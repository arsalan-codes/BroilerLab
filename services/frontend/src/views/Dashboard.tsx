import { useMemo } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Kpi, MiniStat, Tag } from '../components/common';
import { GrowthChart, IntakeChart, FcrBarChart, DiurnalChart, StationChart } from '../components/charts';
import { validate } from '../engine/validation';
import type { Experiment } from '../types';

export function Dashboard() {
  const { lang, strain, experiment } = useStore();
  const seed = experiment?.seed ?? 308;

  const val = useMemo(() => validate(strain, seed, 15, 60, 6, 12), [strain, seed]);
  const growthSim = val.rows.map((r) => ({ day: r.day, v: r.sim }));
  const growthPo = val.rows.map((r) => ({ day: r.day, v: r.po }));
  const fiSim = val.rows.map((r) => ({ day: r.day, v: r.fiSim }));
  const fiPo = val.rows.map((r) => ({ day: r.day, v: r.fiPo }));

  const fcrByPen = (experiment?.pens ?? []).map((p: Experiment['pens'][number], i: number) => ({
    pen: p.id,
    fcr: Math.round((1.4 + i * 0.03) * 100) / 100,
  }));

  const diurnal = Array.from({ length: 24 }, (_, h) => {
    const peak = Math.exp(-((h - 8) ** 2) / 8) + Math.exp(-((h - 17) ** 2) / 8);
    return { hour: h, intake: Math.round(peak * 40), dark: h >= 18 };
  });

  const station = (experiment?.pens ?? []).map((p: Experiment['pens'][number], i: number) => ({
    pen: p.id,
    sat: Math.round((0.55 + i * 0.05) * 100) / 100,
  }));

  const sub = { color: 'text.secondary' } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}
        >
          DASH
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'dash.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'dash.p')}
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'dash.kpi.finalBw')} value={val.finalBw.toLocaleString()} sub="g" tone="success" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'dash.kpi.mae')} value={val.mae} sub="g" tone="secondary" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'dash.kpi.fcr')} value={val.fcr} sub="d15–60" tone="warning" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'dash.kpi.intake')} value={val.dailyIntake} sub="g/bird" tone="primary" />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <MiniStat value="0%" label={t(lang, 'dash.mini.loss')} />
        <MiniStat value="25 kg" label={t(lang, 'dash.mini.bin')} />
        <MiniStat value="0" label={t(lang, 'dash.mini.concurrent')} />
        <MiniStat value={val.rows.length * 36} label={t(lang, 'dash.mini.record')} />
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dash.growth')} icon="📈">
            <Box sx={{ height: 260 }}>
              <GrowthChart sim={growthSim} po={growthPo} />
            </Box>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Typography variant="caption" sx={sub}>■ Simulation</Typography>
              <Typography variant="caption" sx={sub}>■ PO</Typography>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dash.fi')} icon="🍽️">
            <Box sx={{ height: 260 }}>
              <IntakeChart sim={fiSim} po={fiPo} />
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dash.fcrPen')} icon="⚖️">
            <Box sx={{ height: 220 }}>
              <FcrBarChart data={fcrByPen} />
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dash.diurnal')} icon="🌗">
            <Box sx={{ height: 220 }}>
              <DiurnalChart data={diurnal} />
            </Box>
          </Card>
        </Grid>
      </Grid>

      <Card title={t(lang, 'dash.station')} icon="🔌" sx={{ mb: 2 }}>
        <Box sx={{ height: 220 }}>
          <StationChart data={station} />
        </Box>
      </Card>

      <Card title={t(lang, 'dash.table')} icon="📋">
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-secondary)' }}>Day</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Sim (g)</th>
                <th style={{ textAlign: 'right', padding: 8 }}>PO (g)</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Dev%</th>
                <th style={{ textAlign: 'right', padding: 8 }}>FI sim</th>
                <th style={{ textAlign: 'right', padding: 8 }}>FI PO</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {val.rows.filter((_, i) => i % 3 === 0).map((r) => (
                <tr key={r.day} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.day}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.sim}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.po}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.dev}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.fiSim}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.fiPo}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>
                    <Tag tone={r.status === 'OK' ? 'success' : 'warning'}>{r.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Card>
    </Box>
  );
}
