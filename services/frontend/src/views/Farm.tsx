import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Grid, Stack, Typography, Chip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrowOutlined';
import SkipNextIcon from '@mui/icons-material/SkipNextOutlined';
import SkipPreviousIcon from '@mui/icons-material/SkipPreviousOutlined';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, MiniStat, Tag } from '../components/common';
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
  const sub = { color: 'text.secondary' } as const;

  if (!experiment || experiment.pens.length === 0) {
    return (
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
        <Card>
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <Box sx={{ fontSize: 48 }}>🏡</Box>
            <Typography variant="body1" sx={{ ...sub, mt: 1.5 }}>
              {t(lang, 'farm.empty')}
            </Typography>
            <Button tone="primary" onClick={() => { document.getElementById('v-exp')?.scrollIntoView(); }}>
              🐔 {t(lang, 'farm.emptyCta')}
            </Button>
          </Box>
        </Card>
      </Box>
    );
  }

  const selectedPen = sim.selectedPen ?? experiment.pens[0].id;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          FARM
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'farm.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'farm.p')}
        </Typography>
      </Box>

      <Card>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
          <Button tone="primary" onClick={play} startIcon={<PlayArrowIcon />}>▶ {t(lang, 'farm.play')}</Button>
          <Button tone="default" onClick={() => { stop(); runDay(day + 1); setDay((d) => d + 1); }} startIcon={<SkipNextIcon />}>⏭ {t(lang, 'farm.nextDay')}</Button>
          <Button tone="default" onClick={() => { stop(); runDay(15); setDay(15); }} startIcon={<SkipPreviousIcon />}>⏮ {t(lang, 'farm.fromDay15')}</Button>
          <Tag tone="secondary">Day {day}</Tag>
          <Tag tone={env.isDark ? 'default' : 'success'}>{env.isDark ? '🌙 Dark' : '☀️ Light'}</Tag>
          <Tag tone="warning">{env.tempC}°C · {env.humidity}%</Tag>
          <Box sx={{ flex: 1 }} />
          <Button tone="default" disabled>{t(lang, 'farm.excel')}</Button>
          <Button tone="default" disabled>{t(lang, 'farm.csv')}</Button>
        </Stack>

        <Box
          sx={{
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            bgcolor: 'background.default',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          >
            <span style={{ color: 'var(--mut)' }}>❂</span>
            <span style={{ color: 'var(--mut)' }}>❂</span>
            <span style={{ color: 'var(--mut)' }}>❂</span>
            <Box sx={{ ml: 'auto', fontSize: 10, color: 'var(--mut)' }}>BROILERLAB BARN</Box>
          </Box>
          {env.isDark && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0,0,0,.45)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--mut)',
                fontSize: 12,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              🌙 دوره تاریکی — 18L:6D
            </Box>
          )}
          <Grid container spacing={1.5} sx={{ p: 2 }}>
            {experiment.pens.map((p) => {
              const birds = farm ? farm.birds.filter((b) => b.penId === p.id).slice(0, 10) : [];
              const regCount = farm ? farm.registrations.filter((r) => r.bird_id.startsWith(p.id)).length : 0;
              const isSel = selectedPen === p.id;
              return (
                <Grid key={p.id} size={{ xs: 6, sm: 4, md: 3 }}>
                  <Box
                    onClick={() => setSim({ selectedPen: p.id })}
                    sx={{
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: isSel ? 'primary.main' : 'divider',
                      borderRadius: 2,
                      p: 1.2,
                      bgcolor: isSel ? 'action.selected' : 'background.paper',
                      transition: 'border-color .15s',
                    }}
                  >
                    <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 11 }}>
                      <b>{p.id}</b>
                      <Tag tone="success">{p.treatment}</Tag>
                    </Stack>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 1 }}>
                      {birds.map((b, i) => (
                        <Box
                          key={b.id}
                          sx={{
                            fontSize: 14,
                            filter: regCount > i ? 'none' : 'grayscale(1) opacity(.35)',
                          }}
                        >
                          🐤
                        </Box>
                      ))}
                    </Box>
                    <Box
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        mt: 1,
                        bgcolor: 'primary.main',
                        width: `${Math.min(100, 40 + regCount * 5)}%`,
                      }}
                    />
                    <Typography variant="caption" sx={{ ...sub, mt: 0.5, display: 'block' }}>
                      {regCount}/{p.birdCount} fed · {Math.round((regCount / Math.max(1, p.birdCount)) * 100)}%
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Card>

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'farm.inspector')} icon="🔍">
            <Typography variant="body2" sx={sub}>
              {selectedPen} — {experiment.pens.find((p) => p.id === selectedPen)?.birdCount} birds · treatment {experiment.pens.find((p) => p.id === selectedPen)?.treatment}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
              <MiniStat value={day} label={t(lang, 'sim.kpi.day')} />
              <MiniStat value={env.tempC} label="°C" />
              <MiniStat value={sim.feedBin.toFixed(1)} label="kg bin" />
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'farm.events')} icon="📡">
            <Box
              sx={{
                maxHeight: 200,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: 12,
                bgcolor: 'action.hover',
                p: 1,
                borderRadius: 2,
              }}
            >
              {sim.liveEvents.length === 0 && (
                <Box component="span" sx={{ color: 'text.disabled' }}>— no events —</Box>
              )}
              {sim.liveEvents.map((e, i) => (
                <Box
                  key={i}
                  sx={{ color: e.tone === 'warn' ? 'warning.main' : 'success.main' }}
                >
                  <span style={{ opacity: 0.7 }}>{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
