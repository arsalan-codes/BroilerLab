import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, MiniStat, Tag } from '../components/common';
import { api, ensureAuth } from '../api/client';
import type { StrainKey, Registration } from '../types';
import { toPersianDigits } from '../i18n/shamsi';

const STRAINS: StrainKey[] = ['ross308', 'cobb500', 'aaplus', 'hubbardep'];
const STRAIN_NAMES: Record<StrainKey, string> = { ross308: 'Ross 308', cobb500: 'Cobb 500', aaplus: 'AA+', hubbardep: 'Hubbard EP' };

export function DeviceData() {
  const { lang, cycles, addCycle, removeCycle, sim, setSim } = useStore();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [strain, setStrain] = useState<StrainKey>('ross308');
  const [loading, setLoading] = useState(false);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [stats, setStats] = useState<any>(null);

  const active = cycles[0];

  useEffect(() => {
    if (!active) return;
    (async () => {
      setLoading(true);
      try {
        await ensureAuth();
        const [r, s] = await Promise.all([api.registrations(active.id, 50), api.stats(active.id)]);
        setRegs(r);
        setStats(s);
      } catch (e) {
        useStore.getState().toast('Failed to load cycle data: ' + (e as Error).message, 'bad');
      } finally {
        setLoading(false);
      }
    })();
  }, [active]);

  const create = async () => {
    if (!code) return;
    try {
      await ensureAuth();
      const c = await api.createCycle({ cycle_code: code, label: label || code, strain });
      addCycle({ ...c, active: true });
      setCode(''); setLabel('');
      useStore.getState().toast(t(lang, 'dev.newCycle'));
    } catch (e) {
      useStore.getState().toast('Create failed: ' + (e as Error).message, 'bad');
    }
  };

  return (
    <section className="view" id="v-dev">
      <div className="view-head">
        <span className="eyebrow">DEV</span>
        <h2>{t(lang, 'dev.title')}</h2>
        <p>{t(lang, 'dev.p')}</p>
      </div>

      <div className="grid g2">
        <Card title={t(lang, 'dev.arch')} icon="🔧">
          <div style={{ lineHeight: 2.2, fontSize: 12 }}>
            <p><b>① لودسل ۱ — سکوی توزین:</b> {t(lang, 'dev.lc1')}</p>
            <p><b>② لودسل ۲ — مخزن ۲۵kg:</b> {t(lang, 'dev.lc2')}</p>
            <p><b>③ RFID بال:</b> {t(lang, 'dev.rfid')}</p>
            <p><b>④ منطق صف:</b> {t(lang, 'dev.queue')}</p>
          </div>
          <div className="note">{t(lang, 'dev.threeRows')}</div>
        </Card>
        <Card title={t(lang, 'dev.schema')} icon="🗄️">
          <div className="feed">
            timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,<br />
            weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi<br />
            <span className="dm">— sample (S04, d18) —</span><br />
            2026-08-22 08:00:01,F01,B023,S04,18,641,642,16.70,-38,23.9,58.6,-63
          </div>
          <div className="note" style={{ marginTop: 12 }}>{t(lang, 'dev.excelNote')}</div>
        </Card>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'dev.cycles')} icon="🗂️">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="field__input" style={{ flex: '1 1 90px', minWidth: 80 }} placeholder={t(lang, 'exp.penId')} value={code} onChange={(e) => setCode(e.target.value)} />
            <input className="field__input" style={{ flex: '2 1 140px', minWidth: 120 }} placeholder="نام دوره" value={label} onChange={(e) => setLabel(e.target.value)} />
            <select className="field__input" style={{ width: 130 }} value={strain} onChange={(e) => setStrain(e.target.value as StrainKey)}>
              {STRAINS.map((s) => <option key={s} value={s}>{STRAIN_NAMES[s]}</option>)}
            </select>
            <Button variant="pri" onClick={create}>＋ {t(lang, 'dev.newCycle')}</Button>
          </div>
          <div style={{ marginTop: 12 }}>
            {cycles.length === 0 && <div className="note">دوره‌ای ثبت نشده است.</div>}
            {cycles.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{c.code}</b> · {c.label} · <Tag kind={c.strain === 'ross308' ? 'ok' : 'bl'}>{STRAIN_NAMES[c.strain]}</Tag>
                </div>
                <Button variant="ghost" onClick={() => removeCycle(c.id)}>✕</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t(lang, 'dev.live')} icon="📡">
          <span id="ws-dot" className={`ws-dot ${sim.liveEvents.length ? 'on' : 'off'}`} />
          <div className="live-feed" style={{ marginTop: 8 }}>
            {sim.liveEvents.length === 0 && <span className="dm">— no stream —</span>}
            {sim.liveEvents.slice(0, 20).map((e, i) => (
              <div key={i} className={e.tone === 'warn' ? 'wn' : 'ok'}><span className="tm">{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}</div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 8 }}>{t(lang, 'dev.liveNote')}</div>
        </Card>
      </div>

      <Card title={t(lang, 'dev.stats')} icon="📊" style={{ marginTop: 14 }}>
        {loading && <div className="note">در حال بارگذاری…</div>}
        {stats && (
          <div className="ministats">
            <MiniStat value={stats.visits ?? 0} label={t(lang, 'dev.visits')} />
            <MiniStat value={stats.unique_birds ?? 0} label={t(lang, 'dev.birds')} />
            <MiniStat value={stats.device_rows ?? 0} label={t(lang, 'dev.rows')} />
            <MiniStat value={stats.total_intake_g ?? 0} label={t(lang, 'dev.intake')} />
            <MiniStat value={stats.avg_initial_weight_g ?? 0} label={t(lang, 'dev.avgw')} />
            <MiniStat value={stats.missed_rfid ?? 0} label={t(lang, 'dev.miss')} />
          </div>
        )}
        {!stats && !loading && <div className="note">دوره‌ای انتخاب نشده یا داده‌ای ثبت نشده.</div>}
      </Card>

      <Card title={t(lang, 'dev.regs')} icon="🏷️" style={{ marginTop: 14 }}>
        <div className="reg-table">
          <div className="reg-thead">
            <span className="reg-cell reg-cell--tag">{t(lang, 'reg.tag')}</span>
            <span className="reg-cell reg-cell--w">{t(lang, 'reg.w')}</span>
            <span className="reg-cell reg-cell--date">{t(lang, 'reg.date')}</span>
            <span className="reg-cell reg-cell--time">{t(lang, 'reg.time')}</span>
            <span className="reg-cell reg-cell--sensor">{t(lang, 'reg.sensor')}</span>
            <span className="reg-cell reg-cell--rssi">{t(lang, 'reg.rssi')}</span>
          </div>
          <div className="reg-body">
            {regs.length === 0 && <div className="note">—</div>}
            {regs.slice(0, 12).map((r) => (
              <div className="reg-row" key={r.id} style={{ display: 'contents' }}>
                <span className="reg-cell reg-cell--tag dir-ltr">{r.bird_id}</span>
                <span className="reg-cell reg-cell--w dir-ltr">{r.initial_weight_g} g</span>
                <span className="reg-cell reg-cell--date dir-ltr">{lang === 'fa' ? toPersianDigits(r.shamsi_date) : r.gregorian_date}</span>
                <span className="reg-cell reg-cell--time dir-ltr">{r.time}</span>
                <span className="reg-cell reg-cell--sensor dir-ltr">{r.sensor_id}</span>
                <span className="reg-cell reg-cell--rssi dir-ltr">{r.rssi}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}
