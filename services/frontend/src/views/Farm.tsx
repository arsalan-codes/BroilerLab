import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, MiniStat } from '../components/common';
import { buildFarm, simulateDay } from '../engine/farmEngine';
import { envAt } from '../engine/environment';
import type { FarmSim } from '../engine/farmEngine';

export function Farm() {
  const { lang, experiment, strain, sim, setSim, pushEvent } = useStore();
  const [farm, setFarm] = useState<FarmSim | null>(null);
  const [day, setDay] = useState(15);
  const timerRef = useRef<any>(null);

  const ensureFarm = () => {
    if (!experiment) return null;
    const f = buildFarm(experiment, strain, experiment.seed);
    setFarm(f);
    return f;
  };

  const runDay = (d: number) => {
    const f = farm ?? ensureFarm();
    if (!f) return;
    simulateDay(f, d);
    setFarm({ ...f });
    setSim({ deviceRecords: f.records.slice(-200), registrations: f.registrations, generatedRows: f.records.length, feedBin: f.bin.kg });
    pushEvent({ kind: 'bird_entered', ts: Date.now(), text: `Day ${d} simulated — ${f.registrations.length} registrations`, tone: 'ok' });
  };

  const play = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setDay((d) => {
        const nd = d >= 60 ? 15 : d + 1;
        runDay(nd);
        return nd;
      });
    }, 700);
  };
  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };

  useEffect(() => () => stop(), []);

  const env = useMemo(() => envAt(sim.currentHour, day), [sim.currentHour, day]);

  if (!experiment || experiment.pens.length === 0) {
    return (
      <section className="view" id="v-farm">
        <Card>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48 }}>🏡</div>
            <p style={{ color: 'var(--mut)', marginTop: 12 }}>{t(lang, 'farm.empty')}</p>
            <Button variant="pri" onClick={() => { document.getElementById('v-exp')?.scrollIntoView(); }}>🐔 {t(lang, 'farm.emptyCta')}</Button>
          </div>
        </Card>
      </section>
    );
  }

  const selectedPen = sim.selectedPen ?? experiment.pens[0].id;

  return (
    <section className="view" id="v-farm">
      <div className="view-head">
        <span className="eyebrow">FARM</span>
        <h2>{t(lang, 'farm.title')}</h2>
        <p>{t(lang, 'farm.p')}</p>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <Button variant="pri" onClick={play}>▶ {t(lang, 'farm.play')}</Button>
          <Button variant="ghost" onClick={() => { stop(); runDay(day + 1); setDay((d) => d + 1); }}>⏭ {t(lang, 'farm.nextDay')}</Button>
          <Button variant="ghost" onClick={() => { stop(); runDay(15); setDay(15); }}>⏮ {t(lang, 'farm.fromDay15')}</Button>
          <span className="tag bl">Day {day}</span>
          <span className="tag ok">{env.isDark ? '🌙 Dark' : '☀️ Light'}</span>
          <span className="tag wn">{env.tempC}°C · {env.humidity}%</span>
          <div style={{ flex: 1 }} />
          <Button variant="blue" disabled>{t(lang, 'farm.excel')}</Button>
          <Button variant="ghost" disabled>{t(lang, 'farm.csv')}</Button>
        </div>

        <div className="barn">
          <div className="roof">
            <span className="fan">❂</span><span className="fan">❂</span><span className="fan">❂</span>
            <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--mut)' }}>BROILERLAB BARN</span>
          </div>
          {env.isDark && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', pointerEvents: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--mut)', fontSize: 12 }}>🌙 دوره تاریکی — 18L:6D</div>}
          <div className="pen-grid">
            {experiment.pens.map((p) => {
              const birds = farm ? farm.birds.filter((b) => b.penId === p.id).slice(0, 10) : [];
              const regCount = farm ? farm.registrations.filter((r) => r.bird_id.startsWith(p.id)).length : 0;
              return (
                <div key={p.id} className={`pen ${selectedPen === p.id ? 'sel' : ''}`} onClick={() => setSim({ selectedPen: p.id })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <b>{p.id}</b>
                    <span className="tag ok">{p.treatment}</span>
                  </div>
                  <div className="floor">
                    {birds.map((b, i) => (
                      <span key={b.id} className={`chk ${regCount > i ? 'eat' : ''}`}>🐤</span>
                    ))}
                  </div>
                  <div className="trough" style={{ width: `${Math.min(100, 40 + regCount * 5)}%` }} />
                  <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 6 }}>{regCount}/{p.birdCount} fed · {Math.round((regCount / Math.max(1, p.birdCount)) * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'farm.inspector')} icon="🔍">
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>
            {selectedPen} — {experiment.pens.find((p) => p.id === selectedPen)?.birdCount} birds · treatment {experiment.pens.find((p) => p.id === selectedPen)?.treatment}
          </div>
          <div className="ministats" style={{ marginTop: 10 }}>
            <MiniStat value={day} label={t(lang, 'sim.kpi.day')} />
            <MiniStat value={env.tempC} label="°C" />
            <MiniStat value={sim.feedBin.toFixed(1)} label="kg bin" />
          </div>
        </Card>
        <Card title={t(lang, 'farm.events')} icon="📡">
          <div className="live-feed">
            {sim.liveEvents.length === 0 && <span className="dm">— no events —</span>}
            {sim.liveEvents.map((e, i) => (
              <div key={i} className={e.tone === 'warn' ? 'wn' : 'ok'}>
                <span className="tm">{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
