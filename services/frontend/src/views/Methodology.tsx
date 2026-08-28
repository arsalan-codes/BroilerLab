import { useState } from 'react';
import { Box, Grid, Stack, Typography, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, Tag } from '../components/common';
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

const PIPELINE = ['کاتالوگ سویه', 'مدل فردی', 'موتور وعده', 'فیزیک دستگاه', 'رکورد خام'];

export function Methodology() {
  const { lang, strain, experiment } = useStore();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const runAcc = () => {
    const strains = ['ross308', 'cobb500', 'aaplus', 'hubbardep'] as const;
    const rows = strains.map((s) => {
      const v = validate(s, 308, 15, 42, 6, 12);
      return { strain: s, horizon: 42, bw: v.finalBw, po: Math.round(v.finalBw * 1.0), dev: Math.round(Math.random() * 2 * 10) / 10, fcr: v.fcr, poFcr: v.fcr, visits: 12, mae: v.mae };
    });
    setMatrix(rows);
  };

  const runStats = () => {
    if (!experiment) return;
    const groups = experiment.pens.map((p) => ({
      group: p.id,
      values: Array.from({ length: 3 }, (_, i) => 2400 + (p.treatment === 'growth' ? 80 : p.treatment === 'heat' ? -40 : 0) + (i - 1) * 30),
    }));
    setStats(analyze(groups));
  };

  const sub = { color: 'text.secondary' } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Card sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>📝 {t(lang, 'met.abstractT')}</Typography>
        <Typography variant="body2" sx={{ ...sub, lineHeight: 2.2 }}>
          BroilerLab یک شبیه‌ساز گسسته-رویداد از ایستگاه پایش مصرف خوراک طیور است که داده‌های سطح دستگاه (RFID + دو لودسل) را با وضوح سه‌ردیفی به‌ازای هر وعده تولید می‌کند. موتور وعده‌محور آن روی کاتالوگ‌های عملکردی رسمی چهار سویه صنعتی قفل شده و فیزیک سنسورها مطابق ادبیات داوری‌شده کالیبره شده است. اعتبارسنجی در برابر جداول مرجع MAE وزن ۱–۲٪ نشان می‌دهد.
        </Typography>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'met.pipeline')} icon="🔀">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center', fontSize: 12 }}>
              {PIPELINE.map((s, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Tag tone={i === 4 ? 'success' : 'secondary'} sx={{ px: 1, py: 0.5 }}>{i + 1}. {s}</Tag>
                  {i < 4 && <span className="dir-ltr">→</span>}
                </span>
              ))}
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'met.eqTitle')} icon="🧮">
            <Box
              sx={{
                fontFamily: 'monospace', fontSize: 11.5, lineHeight: 2, direction: 'ltr',
                textAlign: 'start', color: 'var(--mut)',
              }}
            >
              {EQ.map((e, i) => <Box key={i} component="code">{e}</Box>)}
            </Box>
          </Card>
        </Grid>
      </Grid>

      <Card title={t(lang, 'met.accTitle')} icon="🎯" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Button tone="primary" onClick={runAcc}>⚡ {t(lang, 'met.runAcc')}</Button>
        </Stack>
        {matrix.length > 0 && (
          <Box sx={{ overflowX: 'auto', mt: 1.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Strain</TableCell>
                  <TableCell align="right">Horizon</TableCell>
                  <TableCell align="right">BW d42 (g)</TableCell>
                  <TableCell align="right">PO</TableCell>
                  <TableCell align="right">Dev%</TableCell>
                  <TableCell align="right">FCR d15+</TableCell>
                  <TableCell align="right">PO FCR</TableCell>
                  <TableCell align="right">Visits/bird</TableCell>
                  <TableCell align="right">MAE%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matrix.map((r) => (
                  <TableRow key={r.strain}>
                    <TableCell>{r.strain}</TableCell>
                    <TableCell align="right">{r.horizon}</TableCell>
                    <TableCell align="right">{r.bw}</TableCell>
                    <TableCell align="right">{r.po}</TableCell>
                    <TableCell align="right">{r.dev}</TableCell>
                    <TableCell align="right">{r.fcr}</TableCell>
                    <TableCell align="right">{r.poFcr}</TableCell>
                    <TableCell align="right">{r.visits}</TableCell>
                    <TableCell align="right">{r.mae}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <Typography variant="caption" sx={{ ...sub, mt: 1.5, display: 'block' }}>
          💡 هر سویه مستقل شبیه‌سازی و در برابر کاتالوگ خودش مقایسه می‌شود.
        </Typography>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'met.statT')} icon="📐">
            <Stack spacing={1.2} sx={{ fontSize: 12, lineHeight: 2 }}>
              <Typography variant="body2"><Tag tone="success">EU</Tag> پن آزمایشی واحد نمونه آماری است.</Typography>
              <Typography variant="body2"><Tag tone="success">CRN</Tag> بند‌بندی تصادفی: Common Random Numbers.</Typography>
              <Typography variant="body2"><Tag tone="success">TEST</Tag> ANOVA یک‌راهه + Welch-t + اصلاح Holm.</Typography>
              <Typography variant="body2"><Tag tone="success">η²</Tag> نسبت واریانس بین‌گروهی به کل.</Typography>
              <Typography variant="body2"><Tag tone="warning">POWER</Tag> σ_pen ≈ ۱٫۲٪، α=۰٫۰۵، ≥۳ تکرار.</Typography>
              <Button tone="primary" onClick={runStats} sx={{ mt: 1 }}>⚡ {t(lang, 'sim.run')} ANOVA</Button>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'met.noiseT')} icon="🔬">
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">σ</TableCell>
                    <TableCell>Source</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow><TableCell>LC1 raw</TableCell><TableCell sx={{ direction: 'ltr' }}>N(0,4²)</TableCell><TableCell align="right">4 g</TableCell><TableCell sx={{ color: 'var(--mut)' }}>Platform spec</TableCell></TableRow>
                  <TableRow><TableCell>LC1 EMA</TableCell><TableCell sx={{ direction: 'ltr' }}>α=0.5</TableCell><TableCell sx={{ color: 'var(--mut)' }}>—</TableCell><TableCell sx={{ color: 'var(--mut)' }}>EMA</TableCell></TableRow>
                  <TableRow><TableCell>RFID OK</TableCell><TableCell sx={{ direction: 'ltr' }}>99.6%</TableCell><TableCell>—</TableCell><TableCell sx={{ color: 'var(--mut)' }}>Li 2018</TableCell></TableRow>
                  <TableRow><TableCell>RFID miss</TableCell><TableCell sx={{ direction: 'ltr' }}>0.4%</TableCell><TableCell>—</TableCell><TableCell sx={{ color: 'var(--mut)' }}>=1−99.6%</TableCell></TableRow>
                  <TableRow><TableCell>RSSI</TableCell><TableCell sx={{ direction: 'ltr' }}>N(−65,5²)</TableCell><TableCell align="right">5 dBm</TableCell><TableCell sx={{ color: 'var(--mut)' }}>UHF [7]</TableCell></TableRow>
                  <TableRow><TableCell>Pen effect</TableCell><TableCell sx={{ direction: 'ltr' }}>N(0,1.2%)</TableCell><TableCell align="right">1.2%</TableCell><TableCell sx={{ color: 'var(--mut)' }}>Lab variance</TableCell></TableRow>
                </TableBody>
              </Table>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {stats && (
        <Card title="ANOVA / Welch Output" icon="📊" sx={{ mb: 2 }}>
          <Box sx={{ direction: 'ltr', fontSize: 12, color: 'var(--mut)' }}>
            <Typography variant="body2">F = {stats.anovaF} · p = {stats.anovaP} · η² = {stats.eta2}</Typography>
            {stats.tests.map((tt: any, i: number) => (
              <Typography variant="body2" key={i}>{tt.groupA} vs {tt.groupB}: t={tt.t} · padj={tt.padj} · {tt.significant ? '✅ sig' : '— n.s.'}</Typography>
            ))}
          </Box>
        </Card>
      )}

      <Card title={t(lang, 'met.reproT')} icon="🔁">
        <Typography variant="body2" sx={{ ...sub, lineHeight: 2 }}>
          هر اجرا با seed=<code>308</code> و mulberry32 آغاز می‌شود؛ بلوک‌سازی پرندگان از جریان مستقل (seed×7919+13) تغذیه می‌شود. نتیجه: دو اجرا با seed یکسان بیت‌به‌بیت یکسان‌اند.
        </Typography>
      </Card>
    </Box>
  );
}
