#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ross 308 broiler feeding-station simulator (load-cell platform + load-cell feed bin + wing RFID).

Sources (see docs/RESEARCH_NOTES.md):
  [1] Aviagen Ross Broiler Management Handbook 2025  (temperature by body weight, lighting 18L:6D)
  [2] Marcato et al. 2008                            (Gompertz params - context/validation)
  [3] Aviagen Ross 308 Performance Objectives 2007   (daily BW / FI / FCR tables, as-hatched & sexes)
  [5] van der Sluis et al. 2025 Poult Sci 104:105103 (feeder visits decline with age, bout duration rises)
  [7] Li et al. 2018 animal                          (UHF-RFID accuracy, 1.3-2.0 min per visit)
  [8] Li et al. 2021 Poult Sci                       (<60 s most events, dawn/dusk peaks, <6 birds/feeder)

Row schema follows the user-provided device sample:
timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi
"""
import csv, math, os, random, statistics, sys
from datetime import datetime, timedelta

random.seed(308)  # deterministic runs

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "output")
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------------------- config
SIM_START_DATE = datetime(2026, 8, 19)   # this day == age_day 15  => 2026-08-22 == age 18 (matches user's sample)
AGE_START, AGE_END = 15, 60
LIGHT_ON, LIGHT_OFF = 5, 23              # 18L:6D per Handbook [1]
PENS = [("P01", 3), ("P02", 5), ("P03", 7), ("P04", 8), ("P05", 10), ("P06", 12)]
FLOCK_ID = "F01"
BIN_CAPACITY_KG, BIN_START_KG, BIN_REFILL_TRIGGER_KG = 25.0, 18.5, 3.0
ROWS_PER_VISIT = 3                        # start / middle / end (like the 3-row sample)
DEATH_DAILY_P_FROM_D21 = 0.0008           # ~3% cumulative to d60, typical post-brooding weekly ~0.5%

# ------------------------------------------------------------------- PO table parsing
def parse_po_tables(layout_txt):
    """Parse pdftotext -layout dump of the official Performance Objectives booklet."""
    sections = {"ash": [], "male": [], "female": []}
    current, order = None, []
    for raw in open(layout_txt, encoding="utf-8"):
        line = raw.rstrip("\n")
        if "As-Hatched Performance" in line and "continued" not in line:
            current = "ash"
        elif "Male Performance" in line and "continued" not in line:
            current = "male"
        elif "Female Performance" in line and "continued" not in line:
            current = "female"
        elif current:
            t = line.split()
            if len(t) >= 3 and t[0].isdigit():
                try:
                    day, bw, dg = int(t[0]), int(t[1]), int(t[2])
                except ValueError:
                    continue  # page footers like "06 June 2007" also start with digits
                rec = {"day": day, "bw": bw, "dg": dg,
                       "fi": None, "cum": None, "fcr": None}
                if len(t) >= 6:
                    # ... [weekly] fi cum fcr  (last four numeric fields carry fi/cum/fcr)
                    try:
                        rec["fi"], rec["cum"], rec["fcr"] = float(t[-4]), float(t[-3]), float(t[-2]) if False else None, None
                    except ValueError:
                        pass
                    # safer explicit mapping
                    tail = t[-6:] if len(t) >= 6 else t
                    # possible shapes: [dg,fi,cum,fcr] len4 | [weekly,dg?..] handled below
                if len(t) == 6:      # day bw dg fi cum fcr
                    rec.update(fi=float(t[3]), cum=int(float(t[4])), fcr=float(t[5]))
                elif len(t) == 7:    # day bw dg weekly fi cum fcr
                    rec.update(fi=float(t[4]), cum=int(float(t[5])), fcr=float(t[6]))
                sections[current].append(rec)
    # dedupe (headers repeat) keeping records with FI
    out = {}
    for k, rows in sections.items():
        best = {}
        for r in rows:
            d = r["day"]
            if d not in best or (r["fi"] is not None and (best[d]["fi"] is None)):
                if d in best and best[d]["fi"] is not None:
                    continue
                best[d] = r
        out[k] = [best[d] for d in sorted(best)]
    return out


def write_reference_csv(po, path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["day","bw_ash_g","fi_ash_g","fcr_ash","bw_male_g","fi_male_g","fcr_male",
                    "bw_female_g","fi_female_g","fcr_female"])
        for i in range(len(po["ash"])):
            a, m, fe = po["ash"][i], po["male"][i], po["female"][i]
            assert a["day"] == m["day"] == fe["day"]
            w.writerow([a["day"], a["bw"], a["fi"] or "", a["fcr"] or "",
                        m["bw"], m["fi"] or "", m["fcr"] or "",
                        fe["bw"], fe["fi"] or "", fe["fcr"] or ""])


def load_ref(path):
    ref = {}
    last_fi = {"m": None, "f": None, "ash": None}
    for r in csv.DictReader(open(path)):
        d = int(r["day"])
        # PO tables leave daily intake blank before d7 -> forward-fill so every day has an FI target
        for k, col in (("m", "fi_male_g"), ("f", "fi_female_g"), ("ash", "fi_ash_g")):
            v = r[col].strip()
            if v:
                last_fi[k] = float(v)
        ref[d] = {
            "bw": {"m": float(r["bw_male_g"]), "f": float(r["bw_female_g"]), "ash": float(r["bw_ash_g"])},
            "fi": dict(last_fi),
        }
    return ref

# ------------------------------------------------------------------ behaviour engines
def temp_for_weight(bw_g):
    """House temperature by body weight - Handbook 2025 Table 2.2 [1]."""
    pts = [(44,30),(100,28),(180,27),(290,26),(425,25),(590,24),(790,23),(1015,22),(1260,21),(1530,20)]
    for w, t in pts:
        if bw_g <= w:
            return t
    return 20

def diurnal_weight(h):
    """Share of daily intake by hour-of-day: dawn + dusk peaks [8], near-zero in dark."""
    if h < LIGHT_ON or h >= LIGHT_OFF:
        return 0.0
    morning = math.exp(-((h - 6.5) ** 2) / (2 * 1.8 ** 2))
    evening = math.exp(-((h - 20.5) ** 2) / (2 * 1.8 ** 2))
    midday  = 0.45 * math.exp(-((h - 13.0) ** 2) / (2 * 3.5 ** 2))
    return morning + evening + midday

_HOURS = list(range(LIGHT_ON, LIGHT_OFF))
_HOUR_W = [diurnal_weight(h) + 1e-9 for h in _HOURS]
_HOUR_CUM = []
_c = 0.0
for wv in _HOUR_W:
    _c += wv
    _HOUR_CUM.append(_c)
_HOURS_TOTAL = _c

def sample_visit_hour():
    """Inverse-CDF sample onto hour grid; minutes uniform inside the hour."""
    x = random.uniform(0, _HOURS_TOTAL)
    lo, hi = 0, len(_HOUR_CUM) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if _HOUR_CUM[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    h = _HOURS[lo]
    return h + random.random()

def visit_plan(fi_day_g, age_day, rng_sigma=0.30):
    """Split a bird-day intake into station visits.

    Eating-rate model: rate rises with age (calibrated so visit counts/durations land inside
    the published bands: visits decline, bout length rises [5]; bouts mostly < 120 s [7][8])."""
    rate_g_min = 1.0 + 0.055 * (age_day - AGE_START)          # d15:1.0 -> d60:3.5 g/min
    total_min = fi_day_g / rate_g_min
    n = max(6, round(total_min * 60 / bout_len_s(age_day)))
    weights = [random.weibullvariate(1.0, 1.35) for _ in range(n)]
    s = sum(weights)
    plan = []
    for wi in weights:
        meal = fi_day_g * wi / s
        dur = min(240.0, max(12.0, meal / rate_g_min * 60.0))
        plan.append([sample_visit_hour(), meal, dur])
    plan.sort(key=lambda v: v[0])
    return plan

def bout_len_s(age_day):
    """Mean feeding-bout duration: rises ~2.2 s/day [5], 45 s at d15, capped 135 s [7][8]."""
    return min(135.0, 45.0 + 2.192 * (age_day - AGE_START))

# ---------------------------------------------------------------------------- devices
class Bird:
    def __init__(self, bid, sex, pen, cv):
        self.id, self.sex, self.pen, self.cv = bid, sex, pen, cv
        self.alive = True
        self.death_age = None
        self.wiggle = 0.0

    def bw(self, age, ref):
        """Individual live weight: official sex curve x stable individual deviation x AR(1) wiggle."""
        self.wiggle = 0.9 * self.wiggle + random.gauss(0, 0.008)
        return ref[age]["bw"][self.sex] * (1 + self.cv + self.wiggle)


def simulate(pens, ref):
    rows, summaries, deaths, fills = [], [], [], []
    birds_all = []
    bid_n = 0
    for pid, n in pens:
        for _ in range(n):
            bid_n += 1
            sex = "m" if random.random() < 0.5 else "f"
            cv = max(0.0, random.gauss(0.0, 0.05))  # zero-mean individual deviation; CV~5%
            birds_all.append(Bird(f"B{bid_n:03d}", sex, pid, cv))

    # group-size response: small calibration, direction per Erensoy et al. 2022 [6]
    def pen_bw_mult(n):  return max(0.96, min(1.03, 1 - 0.004 * (n - 7)))
    def pen_fi_mult(n):  return max(0.94, min(1.04, 1 + 0.005 * (n - 7)))

    for age in range(AGE_START, AGE_END + 1):
        day_date = SIM_START_DATE + timedelta(days=age - AGE_START)
        for pid, n in pens:
            sbirds = [b for b in birds_all if b.pen == pid and b.alive]
            # --- mortality roll (once a bird is gone it stops transmitting)
            for b in list(sbirds):
                if age >= 21 and random.random() < DEATH_DAILY_P_FROM_D21:
                    b.alive = False
                    deaths.append((pid, b.id, age))
                    sbirds.remove(b)
            if not sbirds:
                continue
            env_temp_base = temp_for_weight(statistics.mean(b.bw(age, ref) for b in sbirds))
            temp_noise = random.gauss(0, 0.3)
            humidity = min(70.0, max(45.0, 58 + 0.12 * (age - AGE_START)
                                     + 3.0 * math.sin((age % 30) / 30 * 2 * math.pi) + random.gauss(0, 1.5)))

            # ---- plan every visit of every bird for this pen-day, then serialise at the station
            visits = []
            for b in sbirds:
                fi_target = ref[age]["fi"][b.sex] * pen_fi_mult(n)
                w_ratio = (b.bw(age, ref) / ref[age]["bw"][b.sex]) ** 0.8
                fi_bird = fi_target * w_ratio * math.exp(random.gauss(0, 0.10))
                for t_h, meal, dur in visit_plan(fi_bird, age):
                    visits.append((t_h, b, meal, dur))
            visits.sort(key=lambda v: v[0])

            bin_kg = getattr(simulate, f"_bin_{pid}", BIN_START_KG)
            station_free_s = -1e9
            busy_s, overlap_n = 0.0, 0
            day_rows = []

            for t_h, b, meal, dur in visits:
                start_s = int(t_h * 3600)
                wait = start_s - station_free_s
                if wait < 0:
                    if -wait <= 90:                 # queue briefly (single head-hole)
                        start_s = station_free_s
                    else:                           # give up queuing -> co-feeding anomaly
                        overlap_n += 1
                if bin_kg < BIN_REFILL_TRIGGER_KG:
                    bin_kg = BIN_CAPACITY_KG
                    fills.append((pid, age))
                end_s = start_s + int(dur)
                station_free_s = end_s + 2          # head-in/out overhead
                busy_s += dur

                true_w = b.bw(age, ref) * pen_bw_mult(n)  # grams (ref table already in g)
                ema = true_w + random.gauss(0, 3)
                cons_total_g = meal
                pts = {start_s, (start_s + end_s)//2, end_s - 1}
                prev_frac = 0.0
                for ts in sorted(pts):
                    frac = min(1.0, max(prev_frac, (ts - start_s) / max(1, dur)))
                    newly = (frac - prev_frac) * cons_total_g
                    prev_frac = frac
                    raw = int(round(true_w + random.gauss(0, 4.0)))
                    ema = 0.5 * ema + 0.5 * raw
                    bin_kg -= newly / 1000.0
                    dt = day_date.replace(hour=0, minute=0, second=0) + timedelta(seconds=ts)
                    rssi = max(-90, min(-42, int(random.gauss(-65, 5))))
                    weak = random.random() < 0.02
                    missing = random.random() < 0.004
                    day_rows.append([
                        dt.strftime("%Y-%m-%d %H:%M:%S"), FLOCK_ID,
                        "" if missing else b.id, f"S{pid[1:]}", str(age),
                        str(raw), str(int(round(ema))), f"{bin_kg:.2f}",
                        # device convention: cumulative consumption of the current visit
                        # (negative = mass leaving the bin), like the user's 3-row example
                        str(int(round(-cons_total_g * frac))),
                        f"{env_temp_base + temp_noise - 1.0*math.sin(((ts/3600)-14)/24*2*math.pi):.1f}",
                        f"{humidity + random.gauss(0,0.8):.1f}",
                        str(rssi - (20 if weak else 0)),
                    ])
            setattr(simulate, f"_bin_{pid}", bin_kg)
            rows.extend(day_rows)

            end_mean_bw = statistics.mean(b.bw(age, ref) * pen_bw_mult(n) for b in sbirds)
            day_fi = sum(v[2] for v in visits)
            summaries.append({
                "date": day_date.strftime("%Y-%m-%d"), "pen": pid, "n_birds": n,
                "n_alive": len(sbirds), "age_day": age,
                "mean_bw_g": round(end_mean_bw), "feed_intake_g": round(day_fi),
                "fi_per_bird_g": round(day_fi / len(sbirbs) if False else day_fi / len(sbirds)),
                "visits": len(visits),
                "station_busy_pct": round(100 * busy_s / ((LIGHT_OFF - LIGHT_ON) * 3600), 1),
                "overlap_events": overlap_n,
                "bin_refills_today": sum(1 for p, a in fills if p == pid and a == age),
                "temp_c_target": env_temp_base, "humidity_avg": round(humidity, 1),
            })
    return rows, summaries, deaths

# ------------------------------------------------------------------------- validation
def validate(ref, summaries):
    by_age = {}
    for s in summaries:
        by_age.setdefault(s["age_day"], []).append(s)
    print("age | sim BW (pooled pens) | PO as-hatched | dev% | sim FI/bird | PO FI")
    devs = []
    for age in sorted(by_age):
        ss = by_age[age]
        sim_bw = statistics.mean(x["mean_bw_g"] for x in ss)
        po_bw = ref[age]["bw"]["ash"]
        sim_fi = statistics.mean(x["fi_per_bird_g"] for x in ss)
        po_fi = ref[age]["fi"]["ash"]
        dev = 100 * (sim_bw - po_bw) / po_bw
        devs.append(abs(dev))
        print(f"{age:3d} | {sim_bw:8.0f} | {po_bw:8.0f} | {dev:+5.1f}% | {sim_fi:7.0f} | {po_fi:6.0f}")
    print(f"\nBW MAE: {statistics.mean(devs):.2f}% of PO")
    # window FCR check vs PO-implied (d15->60): (cumFI60-cumFI15)/(BW60-BW15)
    win_fcr_po = (8747 - 596) / (4123 - 506)
    print(f"PO window FCR d15-60 (as-hatched): {win_fcr_po:.3f}")
    for pid, n in PENS:
        ss = [x for x in summaries if x["pen"] == pid]
        fi_bird_total = sum(x["fi_per_bird_g"] for x in ss)
        gain_bird = ss[-1]["mean_bw_g"] - ss[0]["mean_bw_g"]
        print(f"{pid} (n={n:2d}): window FCR/bird d{AGE_START}-{AGE_END} = "
              f"{fi_bird_total/gain_bird:.3f}  (visits/day={sum(x['visits'] for x in ss)/len(ss)/n:.0f}/bird, "
              f"station busy={max(x['station_busy_pct'] for x in ss):.0f}% peak)")

# -------------------------------------------------------------------------------- main
def main():
    layout_txt = os.path.join(BASE, "ross308_PO_layout.txt")
    ref_csv = os.path.join(OUT, "ross308_po_reference.csv")
    po = parse_po_tables(layout_txt)
    write_reference_csv(po, ref_csv)
    ref = load_ref(ref_csv)
    print(f"PO reference parsed: {len(ref)} days "
          f"(d15 ash BW={ref[15]['bw']['ash']}, d60={ref[60]['bw']['ash']})")

    rows, summaries, deaths = simulate(PENS, ref)
    sensor_csv = os.path.join(OUT, "sensor_data.csv")
    with open(sensor_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp","flock_id","bird_id","sensor_id","age_day","raw_weight_g",
                    "weight_g","feed_bin_kg","feed_delta_g","temp_c","humidity","rssi"])
        w.writerows(rows)
    with open(os.path.join(OUT, "daily_summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summaries[0].keys()))
        w.writeheader(); w.writerows(summaries)
    print(f"\nsensor rows: {len(rows):,}  -> {sensor_csv}")
    print(f"deaths: {deaths if deaths else 'none'}")

    validate(ref, summaries)

if __name__ == "__main__":
    main()
