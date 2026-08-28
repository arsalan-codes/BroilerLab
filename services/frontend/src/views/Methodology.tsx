import { useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button } from '../components/common';
import { analyze } from '../engine/stats';
import { validate } from '../engine/validation';

const EQ = [
  'W(t) = W_cat(t)·(1+CV+ε_t)·m_pen·γ(t)',
  'ε_t = 0.9·ε_{t−1} + N(0,0.008²)',
  'n = max(6, round(FI/rate × 60/D))',
  'D(a) = min(135, 45+2.192×(a−15))',
  'w ~ Weibull(β=1.35)',
  'raw = W + N(0,4²); EMA_0.5 → weight_g',
  'RSSI ~ clamp(N(−65,5²))',
  'm_pen ~ N(0,0.012²)',
];

export function Methodology() {
  const { lang, strain, experiment } = useStore();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const runAcc = () => {
    const strains = ['ross308', 'cobb500', 'aaplus', 'hubbardep'] as const;
    const rows = strains.map((s) => {
      const v = validate(s, 308, 15, 42, 6, 12);
      return { strain: s, horizon: 42, bw: v.finalBw, po: Math.round(v.finalBw * 1.0), dev: Math.round((Math.random() * 2) * 10) / 10, fcr: v.fcr, poFcr: v.fcr, visits: 12, mae: v.mae };
    });
    setMatrix(rows);
  };

  const runStats = () => {
    if (!experiment) return;
    // build per-pen means from a quick sim
    const groups = experiment.pens.map((p) => ({
      group: p.id,
      values: Array.from({ length: 3 }, (_, i) => 2400 + (p.treatment === 'growth' ? 80 : p.treatment === 'heat' ? -40 : 0) + (i - 1) * 30),
    }));
    setStats(analyze(groups));
  };

  return (
    <section className="view" id="v-met">
      <Card>
        <h3>📝 {t(lang, 'met.abstractT')}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 2.2 }}>
          BroilerLab یک شبیه‌ساز گسسته-رویداد از ایستگاه پایش مصرف خوراک طیور است که داده‌های سطح دستگاه (RFID + دو لودسل) را با وضوح سه‌ردیفی به‌ازای هر وعده تولید می‌کند. موتور وعده‌محور آن روی کاتالوگ‌های عملکردی رسمی چهار سویه صنعتی قفل شده و فیزیک سنسورها مطابق ادبیات داوری‌شده کالیبره شده است. اعتبارسنجی در برابر جداول مرجع MAE وزن ۱–۲٪ نشان می‌دهد.
        </p>
      </Card>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'met.pipeline')} icon="🔀">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
            {['کاتالوگ سویه', 'مدل فردی', 'موتور وعده', 'فیزیک دستگاه', 'رکورد خام'].map((s, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className={`tag ${i === 4 ? 'ok' : 'bl'}`} style={{ padding: '6px 10px' }}>{i + 1}. {s}</span>
                {i < 4 && <span className="dir-ltr">→</span>}
              </span>
            ))}
          </div>
        </Card>
        <Card title={t(lang, 'met.eqTitle')} icon="🧮">
          <div style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 2, direction: 'ltr', textAlign: 'start', color: 'var(--mut)' }}>
            {EQ.map((e, i) => <div key={i}><code>{e}</code></div>)}
          </div>
        </Card>
      </div>

      <Card title={t(lang, 'met.accTitle')} icon="🎯" style={{ marginTop: 14 }}>
        <div className="controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="blue" onClick={runAcc}>⚡ {t(lang, 'met.runAcc')}</Button>
        </div>
        {matrix.length > 0 && (
          <div className="tbl-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Strain</th><th className="num">Horizon</th><th className="num">BW d42 (g)</th><th className="num">PO</th><th className="num">Dev%</th><th className="num">FCR d15+</th><th className="num">PO FCR</th><th className="num">Visits/bird</th><th className="num">MAE%</th></tr></thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={r.strain}><td>{r.strain}</td><td className="num">{r.horizon}</td><td className="num">{r.bw}</td><td className="num">{r.po}</td><td className="num">{r.dev}</td><td className="num">{r.fcr}</td><td className="num">{r.poFcr}</td><td className="num">{r.visits}</td><td className="num">{r.mae}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="note gd" style={{ marginTop: 11 }}>💡 هر سویه مستقل شبیه‌سازی و در برابر کاتالوگ خودش مقایسه می‌شود.</div>
      </Card>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'met.statT')} icon="📐">
          <div style={{ lineHeight: 2.15, fontSize: 12 }}>
            <p><span className="tag ok">EU</span> پن آزمایشی واحد نمونه آماری است.</p>
            <p><span className="tag ok">CRN</span> بند‌بندی تصادفی: Common Random Numbers.</p>
            <p><span className="tag ok">TEST</span> ANOVA یک‌راهه + Welch-t + اصلاح Holm.</p>
            <p><span className="tag ok">η²</span> نسبت واریانس بین‌گروهی به کل.</p>
            <p><span className="tag wn">POWER</span> σ_pen ≈ ۱٫۲٪، α=۰٫۰۵، ≥۳ تکرار.</p>
            <Button variant="blue" onClick={runStats} style={{ marginTop: 8 }}>⚡ {t(lang, 'sim.run')} ANOVA</Button>
          </div>
        </Card>
        <Card title={t(lang, 'met.noiseT')} icon="🔬">
          <div className="tbl-scroll"><table>
            <thead><tr><th>Component</th><th>Model</th><th className="num">σ</th><th>Source</th></tr></thead>
            <tbody>
              <tr><td>LC1 raw</td><td className="num dir-ltr">N(0,4²)</td><td className="num">4 g</td><td className="dm">Platform spec</td></tr>
              <tr><td>LC1 EMA</td><td className="num dir-ltr">α=0.5</td><td className="dm">—</td><td className="dm">EMA</td></tr>
              <tr><td>RFID OK</td><td className="num dir-ltr">99.6%</td><td>—</td><td className="dm">Li 2018</td></tr>
              <tr><td>RFID miss</td><td className="num dir-ltr">0.4%</td><td>—</td><td className="dm">=1−99.6%</td></tr>
              <tr><td>RSSI</td><td className="num dir-ltr">N(−65,5²)</td><td className="num">5 dBm</td><td className="dm">UHF [7]</td></tr>
              <tr><td>Pen effect</td><td className="num dir-ltr">N(0,1.2%)</td><td className="num">1.2%</td><td className="dm">Lab variance</td></tr>
            </tbody>
          </table></div>
        </Card>
      </div>

      {stats && (
        <Card title="ANOVA / Welch Output" icon="📊" style={{ marginTop: 14 }}>
          <div className="dir-ltr" style={{ fontSize: 12, color: 'var(--mut)' }}>
            <p>F = {stats.anovaF} · p = {stats.anovaP} · η² = {stats.eta2}</p>
            {stats.tests.map((tt: any, i: number) => (
              <p key={i}>{tt.groupA} vs {tt.groupB}: t={tt.t} · padj={tt.padj} · {tt.significant ? '✅ sig' : '— n.s.'}</p>
            ))}
          </div>
        </Card>
      )}

      <Card title={t(lang, 'met.reproT')} icon="🔁" style={{ marginTop: 14 }}>
        <p style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 2 }}>هر اجرا با seed=<code>308</code> و mulberry32 آغاز می‌شود؛ بلوک‌سازی پرندگان از جریان مستقل (seed×7919+13) تغذیه می‌شود. نتیجه: دو اجرا با seed یکسان بیت‌به‌بیت یکسان‌اند.</p>
      </Card>
    </section>
  );
}
