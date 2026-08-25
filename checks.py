#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Integrity checks + sample rows from the simulated device output."""
import csv, statistics
from collections import Counter

rows = list(csv.DictReader(open("output/sensor_data.csv")))
print("total rows:", len(rows))

bad_fd = sum(1 for r in rows if r["feed_delta_g"] and float(r["feed_delta_g"]) > 0)
missing_id = sum(1 for r in rows if not r["bird_id"])
bins = [float(r["feed_bin_kg"]) for r in rows]
w = [int(r["weight_g"]) for r in rows]
rssi = [int(r["rssi"]) for r in rows]

print(f"positive feed_delta rows: {bad_fd} (must be 0)")
print(f"rows with missing RFID: {missing_id}")
print(f"feed_bin_kg range: {min(bins):.2f} .. {max(bins):.2f}")
print(f"weight_g range: {min(w)} .. {max(w)}")
print(f"rssi: mean={statistics.mean(rssi):.0f}, min={min(rssi)}, max={max(rssi)}")

vd = Counter((r["bird_id"], r["age_day"]) for r in rows)
vpd = sorted(c // 3 for c in vd.values())
print(f"visits/bird/day: mean={statistics.mean(vpd):.0f}, "
      f"p5={vpd[len(vpd)//20]}, p95={vpd[-len(vpd)//20]}")

print("\nsample rows (first visit of bird B023 on 2026-08-22, matching user's example day):")
for r in rows:
    if r["bird_id"] == "B023" and r["timestamp"].startswith("2026-08-22"):
        print(",".join(r.values()))
        break
