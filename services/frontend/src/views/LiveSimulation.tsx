import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, Kpi } from '../components/common';
import { GrowthChart } from '../components/charts';
import { MockDeviceStream } from '../deviceStream';
import { envAt } from '../engine/environment';
import { catalogBW } from '../engine/strains';

const SPEEDS = [1, 4, 12, 40, 999];

export function LiveSimulation() {
  const { lang, strain, experiment, sim, setSim, pushEvent } = useStore();
  const [age0, setAge0] = useState(15);
  const [age1, setAge1] = useState(60);
  const [pen, setPen] = useState('P05');
  const [seed, setSeed] = useState(308);
  const [growth, setGrowth] = useState<{ day: number; v: number }[]>([]);
  const streamRef = useRef<MockDeviceStream | null>(null);

  useEffect(() => {
    const stream = new MockDeviceStream();
    streamRef.current = stream;
    stream.subscribe((e) => pushEvent(e));
    stream.connect();
    return () => { stream.disconnect(); };
  }, []);

  const run = () => {
    const data: { day: number; v: number }[] = [];
    for (let d = age0; d <= age1; d++) {
      // deterministic-ish average using catalog + small noise
      const base = catalogBW(strain, d);
      data.push({ day: d, v: Math.round(base * (0.99 + (d % 3) * 0.005)) });
    }
    setGrowth(data);
    setSim({ isRunning: true, age: age0, progress: 0 });
    pushEvent({ kind: 'meal_started', ts: Date.now(), text: `Run ${pen} · seed ${seed}`, tone: 'ok' });
  };

  const env = envAt(sim.currentHour, sim.age);

  return (
    <section className="view" id="v-sim">
      <div className="view-head">
        <span className="eyebrow">SIM</span>
        <h2>{t(lang, 'sim.title')}</h2>
        <p>{t(lang, 'sim.p')}</p>
      </div>

      <Card title="Controls" icon="🎛️">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 90 }}><input className="field__input num" type="number" value={age0} onChange={(e) => setAge0(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'sim.age0')}</label></div>
          <div className="field" style={{ width: 90 }}><input className="field__input num" type="number" value={age1} onChange={(e) => setAge1(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'sim.age1')}</label></div>
          <div className="field" style={{ width: 100 }}><select className="field__input" value={pen} onChange={(e) => setPen(e.target.value)}>{experiment?.pens.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}</select><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'sim.pen')}</label></div>
          <div className="field" style={{ width: 90 }}><input className="field__input num" type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'sim.seed')}</label></div>
          <Button variant="pri" onClick={run}>▶ {t(lang, 'sim.run')}</Button>
          <Button variant="ghost" onClick={() => setGrowth((g) => [...g, ...g.slice(-1).map((x) => ({ day: x.day + 1, v: Math.round(x.v * 1.02) }))])}>⏭ {t(lang, 'sim.jump')}</Button>
          <Button variant="ghost" onClick={() => setSim({ isPaused: true })}>⏸ {t(lang, 'sim.pause')}</Button>
          <Button variant="ghost" onClick={() => { setSim({ isRunning: false }); setGrowth([]); }}>⏹ {t(lang, 'sim.stop')}</Button>
        </div>
        <div style={{ marginTop: 10, height: 4, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${sim.progress * 100}%`, height: '100%', background: 'var(--acc)' }} />
        </div>
      </Card>

      <div className="grid g4" style={{ marginTop: 14 }}>
        <Kpi label={t(lang, 'sim.kpi.day')} value={sim.age} color="acc" />
        <Kpi label={t(lang, 'sim.kpi.avgW')} value={growth.length ? growth[growth.length - 1].v : '—'} sub="g" color="blue" />
        <Kpi label={t(lang, 'sim.kpi.intake')} value="58" sub="g" color="org" />
        <Kpi label={t(lang, 'sim.kpi.busy')} value="62%" color="prp" />
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'sim.rfid')} icon="📶">
          <div style={{ fontSize: 28, color: 'var(--acc)' }}>🐔</div>
          <div className="dir-ltr" style={{ fontSize: 12 }}>B042 · RSSI −63 dBm</div>
          <div className="ws-dot on" style={{ marginTop: 8 }} />
        </Card>
        <Card title={t(lang, 'sim.lc1')} icon="⚖️">
          <div className="dir-ltr" style={{ fontSize: 22, fontWeight: 800 }}>1505 g</div>
          <div className="dir-ltr" style={{ fontSize: 10, color: 'var(--mut)' }}>raw 1508 ±4</div>
        </Card>
        <Card title={t(lang, 'sim.lc2')} icon="🪣">
          <div className="dir-ltr" style={{ fontSize: 22, fontWeight: 800 }}>{sim.feedBin.toFixed(1)} kg</div>
          <div className="dir-ltr" style={{ fontSize: 10, color: 'var(--mut)' }}>Δ −104 g</div>
        </Card>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'sim.title') + ' — ' + t(lang, 'dash.growth')} icon="📈">
          <div className="chart-box mid"><GrowthChart sim={growth} po={growth.map((g) => ({ day: g.day, v: Math.round(g.v * 1.01) }))} /></div>
        </Card>
        <Card title={t(lang, 'sim.terminal')} icon="💻">
          <div className="live-feed">
            {sim.liveEvents.slice(0, 30).map((e, i) => (
              <div key={i} className={e.tone === 'warn' ? 'wn' : 'ok'}>
                <span className="tm">{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}
              </div>
            ))}
            {sim.liveEvents.length === 0 && <span className="dm">— waiting for device stream —</span>}
          </div>
        </Card>
      </div>
    </section>
  );
}
