import { useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button } from '../components/common';
import type { Experiment, Pen, TreatmentType } from '../types';

const TREATMENTS: TreatmentType[] = ['control', 'probiotic', 'growth', 'vaccine', 'lowprotein', 'heat'];
const TREAT_LABEL: Record<TreatmentType, string> = {
  control: 'Control', probiotic: 'Probiotic', growth: 'Growth promoter', vaccine: 'Vaccine', lowprotein: 'Low protein', heat: 'Heat stress',
};

const PRESETS: Experiment[] = [
  { seed: 308, pens: [
    { id: 'P01', birdCount: 3, treatment: 'control' }, { id: 'P02', birdCount: 3, treatment: 'control' }, { id: 'P03', birdCount: 12, treatment: 'control' },
    { id: 'P04', birdCount: 12, treatment: 'control' }, { id: 'P05', birdCount: 12, treatment: 'control' }, { id: 'P06', birdCount: 12, treatment: 'control' },
  ] },
  { seed: 308, pens: [
    { id: 'P01', birdCount: 15, treatment: 'control' }, { id: 'P02', birdCount: 15, treatment: 'probiotic' },
    { id: 'P03', birdCount: 15, treatment: 'growth' }, { id: 'P04', birdCount: 15, treatment: 'vaccine' },
    { id: 'P05', birdCount: 15, treatment: 'lowprotein' }, { id: 'P06', birdCount: 15, treatment: 'heat' },
    { id: 'P07', birdCount: 15, treatment: 'control' }, { id: 'P08', birdCount: 15, treatment: 'probiotic' },
  ] },
  { seed: 308, pens: [
    { id: 'P01', birdCount: 20, treatment: 'control' }, { id: 'P02', birdCount: 20, treatment: 'control' },
    { id: 'P03', birdCount: 20, treatment: 'heat' }, { id: 'P04', birdCount: 20, treatment: 'heat' },
  ] },
  { seed: 308, pens: [
    { id: 'P01', birdCount: 25, treatment: 'vaccine' }, { id: 'P02', birdCount: 25, treatment: 'vaccine' }, { id: 'P03', birdCount: 25, treatment: 'control' },
  ] },
  { seed: 308, pens: [{ id: 'P01', birdCount: 50, treatment: 'control' }] },
];

export function ExperimentDesigner() {
  const { lang, experiment, setExperiment } = useStore();
  const [pens, setPens] = useState<Pen[]>(experiment?.pens ?? []);

  const update = (next: Pen[]) => { setPens(next); setExperiment({ seed: experiment?.seed ?? 308, pens: next }); };

  const applyPreset = (i: number) => update([...PRESETS[i].pens]);
  const addPen = () => update([...pens, { id: `P${String(pens.length + 1).padStart(2, '0')}`, birdCount: 12, treatment: 'control' }]);
  const removePen = (id: string) => update(pens.filter((p) => p.id !== id));
  const reset = () => update([...PRESETS[0].pens]);
  const build = () => { useStore.getState().toast(t(lang, 'exp.build')); };

  return (
    <section className="view" id="v-exp">
      <div className="view-head">
        <span className="eyebrow">EXP</span>
        <h2>{t(lang, 'exp.title')}</h2>
        <p>{t(lang, 'exp.p')}</p>
      </div>

      <Card title={t(lang, 'exp.preset')} icon="🧩">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => applyPreset(0)}>{t(lang, 'exp.apply')} 1</Button>
          <Button variant="ghost" onClick={() => applyPreset(1)}>2</Button>
          <Button variant="ghost" onClick={() => applyPreset(2)}>3</Button>
          <Button variant="ghost" onClick={() => applyPreset(3)}>4</Button>
          <Button variant="ghost" onClick={() => applyPreset(4)}>5</Button>
          <Button variant="blue" onClick={addPen}>＋ {t(lang, 'exp.addPen')}</Button>
          <Button variant="warn" onClick={reset}>{t(lang, 'exp.reset')}</Button>
          <Button variant="pri" onClick={build}>🏗️ {t(lang, 'exp.build')}</Button>
        </div>
      </Card>

      <Card title={t(lang, 'exp.penId')} icon="📑" style={{ marginTop: 14 }}>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>{t(lang, 'exp.penId')}</th>
                <th className="num">{t(lang, 'exp.birdCount')}</th>
                <th>{t(lang, 'exp.treatment')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pens.map((p, i) => (
                <tr key={p.id}>
                  <td className="num">{i + 1}</td>
                  <td><input className="field__input" style={{ height: 32 }} value={p.id} onChange={(e) => update(pens.map((x) => x.id === p.id ? { ...x, id: e.target.value } : x))} /></td>
                  <td className="num"><input className="field__input num" style={{ height: 32, width: 80 }} type="number" value={p.birdCount} onChange={(e) => update(pens.map((x) => x.id === p.id ? { ...x, birdCount: +e.target.value } : x))} /></td>
                  <td>
                    <select className="field__input" style={{ height: 32 }} value={p.treatment} onChange={(e) => update(pens.map((x) => x.id === p.id ? { ...x, treatment: e.target.value as TreatmentType } : x))}>
                      {TREATMENTS.map((tr) => <option key={tr} value={tr}>{TREAT_LABEL[tr]}</option>)}
                    </select>
                  </td>
                  <td><Button variant="ghost" onClick={() => removePen(p.id)}>✕</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
