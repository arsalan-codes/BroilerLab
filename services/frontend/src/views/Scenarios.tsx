import { useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, Kpi, Tag } from '../components/common';
import { GrowthChart, IntakeChart } from '../components/charts';
import { runScenario } from '../engine/scenario';
import type { ScenarioResult } from '../types';

export function Scenarios() {
  const { lang, experiment, strain } = useStore();
  const [kind, setKind] = useState<'heat' | 'stn'>('heat');
  const [fromDay, setFromDay] = useState(32);
  const [days, setDays] = useState(7);
  const [deltaT, setDeltaT] = useState(5);
  const [stations, setStations] = useState<1 | 2>(2);
  const [res, setRes] = useState<ScenarioResult | null>(null);

  const run = () => {
    if (!experiment) return;
    const r = runScenario(experiment, strain, experiment.seed, kind, { fromDay, days, deltaT, stations });
    setRes(r);
  };

  return (
    <section className="view" id="v-scn">
      <div className="view-head">
        <span className="eyebrow">SCN</span>
        <h2>{t(lang, 'scn.title')}</h2>
        <p>{t(lang, 'scn.p')}</p>
      </div>

      <Card title="Scenario controls" icon="🧪">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 180 }}>
            <select className="field__input" value={kind} onChange={(e) => setKind(e.target.value as 'heat' | 'stn')}>
              <option value="heat">{t(lang, 'scn.heat')}</option>
              <option value="stn">{t(lang, 'scn.stn')}</option>
            </select>
          </div>
          {kind === 'heat' ? (
            <>
              <div className="field" style={{ width: 110 }}><input className="field__input num" type="number" value={fromDay} onChange={(e) => setFromDay(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'scn.from')}</label></div>
              <div className="field" style={{ width: 90 }}><input className="field__input num" type="number" value={days} onChange={(e) => setDays(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>{t(lang, 'scn.days')}</label></div>
              <div className="field" style={{ width: 90 }}><input className="field__input num" type="number" value={deltaT} onChange={(e) => setDeltaT(+e.target.value)} /><label style={{ fontSize: 10, color: 'var(--mut)' }}>ΔT °C</label></div>
            </>
          ) : (
            <div className="field" style={{ width: 160 }}><select className="field__input" value={stations} onChange={(e) => setStations(+e.target.value as 1 | 2)}>{t(lang, 'scn.twoSt')}{t(lang, 'scn.oneSt')}</select></div>
          )}
          <Button variant="warn" onClick={run}>⚡ {t(lang, 'scn.compare')}</Button>
        </div>
        <div className="note wn">فرضیات کالیبره گرما: FI×exp(−0.045·ΔT) حین موج + افت مستقیم وزن ≈۱٫۲٪/°C با بازیابی جزئی پس از تنش.</div>
      </Card>

      {res && (
        <>
          <div className="grid g4" style={{ marginTop: 14 }}>
            <Kpi label={t(lang, 'scn.dBw')} value={`${res.dBw > 0 ? '+' : ''}${res.dBw}`} sub="g" color="acc" />
            <Kpi label={t(lang, 'scn.dip')} value={res.dip} sub="g" color="org" />
            <Kpi label={t(lang, 'scn.dFcr')} value={res.dFcr} color="blue" />
            <Kpi label={t(lang, 'scn.dBusy')} value={res.dBusy} color="prp" />
          </div>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <Card title={t(lang, 'scn.chGrowth')} icon="📈">
              <div className="chart-box mid"><GrowthChart sim={res.scnGrowth.map((v, i) => ({ day: 15 + i, v }))} po={res.baseGrowth.map((v, i) => ({ day: 15 + i, v }))} /></div>
            </Card>
            <Card title={t(lang, 'scn.chFi')} icon="🍽️">
              <div className="chart-box mid"><IntakeChart sim={res.scnFi.map((v, i) => ({ day: 15 + i, v }))} po={res.baseFi.map((v, i) => ({ day: 15 + i, v }))} /></div>
            </Card>
          </div>
          <Card title={t(lang, 'scn.table')} icon="📋" style={{ marginTop: 14 }}>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t(lang, 'exp.penId')}</th><th className="num">n</th>
                    <th className="num">{t(lang, 'scn.bwBase')}</th><th className="num">{t(lang, 'scn.bwScn')}</th>
                    <th className="num">Δ%</th><th className="num">{t(lang, 'scn.fcrBase')}</th><th className="num">{t(lang, 'scn.fcrScn')}</th>
                    <th className="num">{t(lang, 'scn.busyBase')}</th><th className="num">{t(lang, 'scn.busyScn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.penRows.map((r) => (
                    <tr key={r.pen}>
                      <td>{r.pen}</td><td className="num">{r.n}</td>
                      <td className="num">{r.bwBase}</td><td className="num">{r.bwScn}</td>
                      <td className="num">{r.dPct}</td><td className="num">{r.fcrBase}</td><td className="num">{r.fcrScn}</td>
                      <td className="num">{r.busyBase}</td><td className="num">{r.busyScn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
