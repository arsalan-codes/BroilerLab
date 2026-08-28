import { useEffect, useRef, useState } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrowOutlined';
import SkipNextIcon from '@mui/icons-material/SkipNextOutlined';
import PauseIcon from '@mui/icons-material/PauseOutlined';
import StopIcon from '@mui/icons-material/StopOutlined';
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
      const base = catalogBW(strain, d);
      data.push({ day: d, v: Math.round(base * (0.99 + (d % 3) * 0.005)) });
    }
    setGrowth(data);
    setSim({ isRunning: true, age: age0, progress: 0 });
    pushEvent({ kind: 'meal_started', ts: Date.now(), text: `Run ${pen} · seed ${seed}`, tone: 'ok' });
  };

  const env = envAt(sim.currentHour, sim.age);
  const sub = { color: 'text.secondary' } as const;

  const fieldSx = {
    height: 32, px: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1,
    bgcolor: 'background.paper', color: 'text.primary',
  } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          SIM
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'sim.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'sim.p')}
        </Typography>
      </Box>

      <Card title="Controls" icon="🎛️" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
          <Box>
            <Box component="input" type="number" value={age0} onChange={(e: any) => setAge0(+e.target.value)} sx={{ ...fieldSx, width: 90 }} />
            <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'sim.age0')}</Typography>
          </Box>
          <Box>
            <Box component="input" type="number" value={age1} onChange={(e: any) => setAge1(+e.target.value)} sx={{ ...fieldSx, width: 90 }} />
            <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'sim.age1')}</Typography>
          </Box>
          <Box>
            <Box component="select" value={pen} onChange={(e: any) => setPen(e.target.value)} sx={{ ...fieldSx, width: 100 }}>
              {(experiment?.pens ?? []).map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </Box>
            <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'sim.pen')}</Typography>
          </Box>
          <Box>
            <Box component="input" type="number" value={seed} onChange={(e: any) => setSeed(+e.target.value)} sx={{ ...fieldSx, width: 90 }} />
            <Typography variant="caption" sx={{ ...sub, display: 'block', fontSize: 10 }}>{t(lang, 'sim.seed')}</Typography>
          </Box>
          <Button tone="primary" onClick={run} startIcon={<PlayArrowIcon />}>▶ {t(lang, 'sim.run')}</Button>
          <Button tone="default" onClick={() => setGrowth((g) => [...g, ...g.slice(-1).map((x) => ({ day: x.day + 1, v: Math.round(x.v * 1.02) }))])} startIcon={<SkipNextIcon />}>⏭ {t(lang, 'sim.jump')}</Button>
          <Button tone="default" onClick={() => setSim({ isPaused: true })} startIcon={<PauseIcon />}>⏸ {t(lang, 'sim.pause')}</Button>
          <Button tone="default" onClick={() => { setSim({ isRunning: false }); setGrowth([]); }} startIcon={<StopIcon />}>⏹ {t(lang, 'sim.stop')}</Button>
        </Stack>
        <Box sx={{ mt: 1.5, height: 4, bgcolor: 'divider', borderRadius: 4, overflow: 'hidden' }}>
          <Box sx={{ width: `${sim.progress * 100}%`, height: '100%', bgcolor: 'primary.main' }} />
        </Box>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'sim.kpi.day')} value={sim.age} tone="success" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'sim.kpi.avgW')} value={growth.length ? growth[growth.length - 1].v : '—'} sub="g" tone="secondary" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'sim.kpi.intake')} value="58" sub="g" tone="warning" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi label={t(lang, 'sim.kpi.busy')} value="62%" tone="primary" />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title={t(lang, 'sim.rfid')} icon="📶">
            <Box sx={{ fontSize: 28, color: 'primary.main' }}>🐔</Box>
            <Box sx={{ direction: 'ltr', fontSize: 12 }}>B042 · RSSI −63 dBm</Box>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', mt: 1 }} />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title={t(lang, 'sim.lc1')} icon="⚖️">
            <Box sx={{ direction: 'ltr', fontSize: 22, fontWeight: 800 }}>1505 g</Box>
            <Box sx={{ direction: 'ltr', fontSize: 10, color: 'var(--mut)' }}>raw 1508 ±4</Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title={t(lang, 'sim.lc2')} icon="🪣">
            <Box sx={{ direction: 'ltr', fontSize: 22, fontWeight: 800 }}>{sim.feedBin.toFixed(1)} kg</Box>
            <Box sx={{ direction: 'ltr', fontSize: 10, color: 'var(--mut)' }}>Δ −104 g</Box>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'sim.title') + ' — ' + t(lang, 'dash.growth')} icon="📈">
            <Box sx={{ height: 260 }}>
              <GrowthChart sim={growth} po={growth.map((g) => ({ day: g.day, v: Math.round(g.v * 1.01) }))} />
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'sim.terminal')} icon="💻">
            <Box
              sx={{
                maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
                bgcolor: 'action.hover', p: 1, borderRadius: 2,
              }}
            >
              {sim.liveEvents.slice(0, 30).map((e, i) => (
                <Box key={i} sx={{ color: e.tone === 'warn' ? 'warning.main' : 'success.main' }}>
                  <span style={{ opacity: 0.7 }}>{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}
                </Box>
              ))}
              {sim.liveEvents.length === 0 && (
                <Box component="span" sx={{ color: 'text.disabled' }}>— waiting for device stream —</Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
