import { useState } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
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

  const sub = { color: 'text.secondary' } as const;
  const fieldSx = {
    height: 32, px: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1,
    bgcolor: 'background.paper', color: 'text.primary',
  } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          SCN
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'scn.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'scn.p')}
        </Typography>
      </Box>

      <Card title="Scenario controls" icon="🧪" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
          <Box>
            <Box component="select" value={kind} onChange={(e: any) => setKind(e.target.value)} sx={{ ...fieldSx, width: 180 }}>
              <option value="heat">{t(lang, 'scn.heat')}</option>
              <option value="stn">{t(lang, 'scn.stn')}</option>
            </Box>
          </Box>
          {kind === 'heat' ? (
            <>
              <Box>
                <Box component="input" type="number" value={fromDay} onChange={(e: any) => setFromDay(+e.target.value)} sx={{ ...fieldSx, width: 110 }} />
                <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'scn.from')}</Typography>
              </Box>
              <Box>
                <Box component="input" type="number" value={days} onChange={(e: any) => setDays(+e.target.value)} sx={{ ...fieldSx, width: 90 }} />
                <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'scn.days')}</Typography>
              </Box>
              <Box>
                <Box component="input" type="number" value={deltaT} onChange={(e: any) => setDeltaT(+e.target.value)} sx={{ ...fieldSx, width: 90 }} />
                <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>ΔT °C</Typography>
              </Box>
            </>
          ) : (
            <Box>
              <Box component="select" value={stations} onChange={(e: any) => setStations((+e.target.value) as 1 | 2)} sx={{ ...fieldSx, width: 160 }}>
                <option value={2}>{t(lang, 'scn.twoSt')}</option>
                <option value={1}>{t(lang, 'scn.oneSt')}</option>
              </Box>
            </Box>
          )}
          <Button tone="warning" onClick={run}>⚡ {t(lang, 'scn.compare')}</Button>
        </Stack>
        <Typography variant="caption" sx={{ ...sub, mt: 1.5, display: 'block' }}>
          فرضیات کالیبره گرما: FI×exp(−0.045·ΔT) حین موج + افت مستقیم وزن ≈۱٫۲٪/°C با بازیابی جزئی پس از تنش.
        </Typography>
      </Card>

      {res && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Kpi label={t(lang, 'scn.dBw')} value={`${res.dBw > 0 ? '+' : ''}${res.dBw}`} sub="g" tone="success" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Kpi label={t(lang, 'scn.dip')} value={res.dip} sub="g" tone="warning" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Kpi label={t(lang, 'scn.dFcr')} value={res.dFcr} tone="secondary" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Kpi label={t(lang, 'scn.dBusy')} value={res.dBusy} tone="primary" />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card title={t(lang, 'scn.chGrowth')} icon="📈">
                <Box sx={{ height: 260 }}>
                  <GrowthChart sim={res.scnGrowth.map((v, i) => ({ day: 15 + i, v }))} po={res.baseGrowth.map((v, i) => ({ day: 15 + i, v }))} />
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card title={t(lang, 'scn.chFi')} icon="🍽️">
                <Box sx={{ height: 260 }}>
                  <IntakeChart sim={res.scnFi.map((v, i) => ({ day: 15 + i, v }))} po={res.baseFi.map((v, i) => ({ day: 15 + i, v }))} />
                </Box>
              </Card>
            </Grid>
          </Grid>

          <Card title={t(lang, 'scn.table')} icon="📋">
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'exp.penId')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>n</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.bwBase')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.bwScn')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Δ%</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.fcrBase')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.fcrScn')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.busyBase')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'scn.busyScn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.penRows.map((r) => (
                    <tr key={r.pen} style={{ borderTop: '1px solid var(--divider)' }}>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.pen}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.n}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.bwBase}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.bwScn}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.dPct}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.fcrBase}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.fcrScn}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.busyBase}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.busyScn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Card>
        </>
      )}
    </Box>
  );
}
