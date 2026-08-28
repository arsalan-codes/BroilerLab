import { useEffect, useState } from 'react';
import { Box, Grid, Stack, TextField, MenuItem, Typography, Divider, Chip } from '@mui/material';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Button, MiniStat, Tag } from '../components/common';
import { api, ensureAuth } from '../api/client';
import type { StrainKey, Registration } from '../types';
import { toPersianDigits } from '../i18n/shamsi';

const STRAINS: StrainKey[] = ['ross308', 'cobb500', 'aaplus', 'hubbardep'];
const STRAIN_NAMES: Record<StrainKey, string> = {
  ross308: 'Ross 308',
  cobb500: 'Cobb 500',
  aaplus: 'AA+',
  hubbardep: 'Hubbard EP',
};

export function DeviceData() {
  const { lang, cycles, addCycle, removeCycle, sim } = useStore();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [strain, setStrain] = useState<StrainKey>('ross308');
  const [loading, setLoading] = useState(false);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [stats, setStats] = useState<any>(null);

  const active = cycles[0];

  useEffect(() => {
    if (!active) return;
    (async () => {
      setLoading(true);
      try {
        await ensureAuth();
        const [r, s] = await Promise.all([api.registrations(active.id, 50), api.stats(active.id)]);
        setRegs(r);
        setStats(s);
      } catch (e) {
        useStore.getState().toast('Failed to load cycle data: ' + (e as Error).message, 'bad');
      } finally {
        setLoading(false);
      }
    })();
  }, [active]);

  const create = async () => {
    if (!code) return;
    try {
      await ensureAuth();
      const c = await api.createCycle({ cycle_code: code, label: label || code, strain });
      addCycle({ ...c, active: true });
      setCode('');
      setLabel('');
      useStore.getState().toast(t(lang, 'dev.newCycle'));
    } catch (e) {
      useStore.getState().toast('Create failed: ' + (e as Error).message, 'bad');
    }
  };

  const sub = { color: 'text.secondary' } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          DEV
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'dev.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'dev.p')}
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dev.arch')} icon="🔧">
            <Stack spacing={1.5} sx={{ fontSize: 13, lineHeight: 1.8 }}>
              <Typography variant="body2"><b>① لودسل ۱ — سکوی توزین:</b> {t(lang, 'dev.lc1')}</Typography>
              <Typography variant="body2"><b>② لودسل ۲ — مخزن ۲۵kg:</b> {t(lang, 'dev.lc2')}</Typography>
              <Typography variant="body2"><b>③ RFID بال:</b> {t(lang, 'dev.rfid')}</Typography>
              <Typography variant="body2"><b>④ منطق صف:</b> {t(lang, 'dev.queue')}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ ...sub, mt: 2, display: 'block' }}>
              {t(lang, 'dev.threeRows')}
            </Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dev.schema')} icon="🗄️">
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 12,
                bgcolor: 'action.hover',
                p: 1.5,
                borderRadius: 2,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,{' '}
              <br />
              weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi <br />
              <Box component="span" sx={{ color: 'text.disabled' }}>— sample (S04, d18) —</Box> <br />
              2026-08-22 08:00:01,F01,B023,S04,18,641,642,16.70,-38,23.9,58.6,-63
            </Box>
            <Typography variant="caption" sx={{ ...sub, mt: 1.5, display: 'block' }}>
              {t(lang, 'dev.excelNote')}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dev.cycles')} icon="🗂️">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder={t(lang, 'exp.penId')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                sx={{ flex: '1 1 90px', minWidth: 80 }}
              />
              <TextField
                size="small"
                placeholder="نام دوره"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                sx={{ flex: '2 1 140px', minWidth: 120 }}
              />
              <TextField
                size="small"
                select
                value={strain}
                onChange={(e) => setStrain(e.target.value as StrainKey)}
                sx={{ width: 130 }}
              >
                {STRAINS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STRAIN_NAMES[s]}
                  </MenuItem>
                ))}
              </TextField>
              <Button tone="primary" onClick={create}>
                ＋ {t(lang, 'dev.newCycle')}
              </Button>
            </Stack>
            <Box>
              {cycles.length === 0 && (
                <Typography variant="caption" sx={sub}>
                  دوره‌ای ثبت نشده است.
                </Typography>
              )}
              {cycles.map((c) => (
                <Stack
                  key={c.id}
                  direction="row"
                  sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Box>
                    <b>{c.code}</b> · {c.label} ·{' '}
                    <Tag tone={c.strain === 'ross308' ? 'success' : 'secondary'}>{STRAIN_NAMES[c.strain]}</Tag>
                  </Box>
                  <Button tone="default" onClick={() => removeCycle(c.id)}>
                    ✕
                  </Button>
                </Stack>
              ))}
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'dev.live')} icon="📡">
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                display: 'inline-block',
                mr: 1,
                bgcolor: sim.liveEvents.length ? 'success.main' : 'text.disabled',
              }}
            />
            <Box
              sx={{
                mt: 1,
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
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  — no stream —
                </Box>
              )}
              {sim.liveEvents.slice(0, 20).map((e, i) => (
                <Box
                  key={i}
                  sx={{
                    color: e.tone === 'warn' ? 'warning.main' : 'success.main',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  <span style={{ opacity: 0.7 }}>{new Date(e.ts).toLocaleTimeString('en-GB')}</span> {e.text}
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ ...sub, mt: 1, display: 'block' }}>
              {t(lang, 'dev.liveNote')}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Card title={t(lang, 'dev.stats')} icon="📊" sx={{ mb: 2 }}>
        {loading && (
          <Typography variant="caption" sx={sub}>
            در حال بارگذاری…
          </Typography>
        )}
        {stats && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
            <MiniStat value={stats.visits ?? 0} label={t(lang, 'dev.visits')} />
            <MiniStat value={stats.unique_birds ?? 0} label={t(lang, 'dev.birds')} />
            <MiniStat value={stats.device_rows ?? 0} label={t(lang, 'dev.rows')} />
            <MiniStat value={stats.total_intake_g ?? 0} label={t(lang, 'dev.intake')} />
            <MiniStat value={stats.avg_initial_weight_g ?? 0} label={t(lang, 'dev.avgw')} />
            <MiniStat value={stats.missed_rfid ?? 0} label={t(lang, 'dev.miss')} />
          </Stack>
        )}
        {!stats && !loading && (
          <Typography variant="caption" sx={sub}>
            دوره‌ای انتخاب نشده یا داده‌ای ثبت نشده.
          </Typography>
        )}
      </Card>

      <Card title={t(lang, 'dev.regs')} icon="🏷️">
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.tag')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.w')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.date')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.time')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.sensor')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t(lang, 'reg.rssi')}</th>
              </tr>
            </thead>
            <tbody>
              {regs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 8, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    —
                  </td>
                </tr>
              )}
              {regs.slice(0, 12).map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>{r.bird_id}</td>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>{r.initial_weight_g} g</td>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>
                    {lang === 'fa' ? toPersianDigits(r.shamsi_date) : r.gregorian_date}
                  </td>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>{r.time}</td>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>{r.sensor_id}</td>
                  <td style={{ padding: 8, textAlign: 'right', direction: 'ltr' }}>{r.rssi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Card>
    </Box>
  );
}
