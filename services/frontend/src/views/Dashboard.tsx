import { useMemo } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Kpi, MiniStat, Tag } from '../components/common';
import { GrowthChart, IntakeChart, FcrBarChart, DiurnalChart, StationChart } from '../components/charts';
import { validate } from '../engine/validation';
import { catalogBW, catalogFI } from '../engine/strains';

export function Dashboard() {
  const { lang, strain, experiment } = useStore();
  const seed = experiment?.seed ?? 308;

  const val = useMemo(() => validate(strain, seed, 15, 60, 6, 12), [strain, seed]);
  const growthSim = val.rows.map((r) => ({ day: r.day, v: r.sim }));
  const growthPo = val.rows.map((r) => ({ day: r.day, v: r.po }));
  const fiSim = val.rows.map((r) => ({ day: r.day, v: r.fiSim }));
  const fiPo = val.rows.map((r) => ({ day: r.day, v: r.fiPo }));

  const fcrByPen = (experiment?.pens ?? []).map((p, i) => ({
    pen: p.id,
    fcr: Math.round((1.4 + i * 0.03) * 100) / 100,
  }));

  const diurnal = Array.from({ length: 24 }, (_, h) => {
    // double-peak diurnal (18L:6D)
    const peak = Math.exp(-((h - 8) ** 2) / 8) + Math.exp(-((h - 17) ** 2) / 8);
    return { hour: h, intake: Math.round(peak * 40), dark: h >= 18 };
  });

  const station = (experiment?.pens ?? []).map((p, i) => ({
    pen: p.id,
    sat: Math.round((0.55 + i * 0.05) * 100) / 100,
  }));

  return (
    <section className="view" id="v-dash">
      <div className="view-head">
        <span className="eyebrow">DASH</span>
        <h2>{t(lang, 'dash.title')}</h2>
        <p>{t(lang, 'dash.p')}</p>
      </div>

      <Card title={t(lang, 'dash.table')} icon="📊" className="grid g4" >
        <Kpi label={t(lang, 'dash.kpi.finalBw')} value={val.finalBw.toLocaleString()} sub="g" color="acc" />
        <Kpi label={t(lang, 'dash.kpi.mae')} value={val.mae} sub="g" color="blue" />
        <Kpi label={t(lang, 'dash.kpi.fcr')} value={val.fcr} sub="d15–60" color="org" />
        <Kpi label={t(lang, 'dash.kpi.intake')} value={val.dailyIntake} sub="g/bird" color="prp" />
      </Card>

      <div className="grid g4" style={{ marginTop: 14 }}>
        <MiniStat value="0%" label={t(lang, 'dash.mini.loss')} />
        <MiniStat value="25 kg" label={t(lang, 'dash.mini.bin')} />
        <MiniStat value="0" label={t(lang, 'dash.mini.concurrent')} />
        <MiniStat value={val.rows.length * 36} label={t(lang, 'dash.mini.record')} />
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'dash.growth')} icon="📈">
          <div className="chart-box"><GrowthChart sim={growthSim} po={growthPo} /></div>
          <div className="legend">
            <span className="lg"><span className="sw" style={{ background: 'var(--acc)' }} />Simulation</span>
            <span className="lg"><span className="sw" style={{ background: 'var(--mut)' }} />PO</span>
          </div>
        </Card>
        <Card title={t(lang, 'dash.fi')} icon="🍽️">
          <div className="chart-box"><IntakeChart sim={fiSim} po={fiPo} /></div>
        </Card>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'dash.fcrPen')} icon="⚖️">
          <div className="chart-box sm"><FcrBarChart data={fcrByPen} /></div>
        </Card>
        <Card title={t(lang, 'dash.diurnal')} icon="🌗">
          <div className="chart-box sm"><DiurnalChart data={diurnal} /></div>
        </Card>
      </div>

      <Card title={t(lang, 'dash.station')} icon="🔌" style={{ marginTop: 14 }}>
        <div className="chart-box sm"><StationChart data={station} /></div>
      </Card>

      <Card title={t(lang, 'dash.table')} icon="📋" style={{ marginTop: 14 }}>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th className="num">Day</th>
                <th className="num">Sim (g)</th>
                <th className="num">PO (g)</th>
                <th className="num">Dev%</th>
                <th className="num">FI sim</th>
                <th className="num">FI PO</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {val.rows.filter((_, i) => i % 3 === 0).map((r) => (
                <tr key={r.day}>
                  <td className="num">{r.day}</td>
                  <td className="num">{r.sim}</td>
                  <td className="num">{r.po}</td>
                  <td className="num">{r.dev}</td>
                  <td className="num">{r.fiSim}</td>
                  <td className="num">{r.fiPo}</td>
                  <td><Tag kind={r.status === 'OK' ? 'ok' : 'wn'}>{r.status}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
