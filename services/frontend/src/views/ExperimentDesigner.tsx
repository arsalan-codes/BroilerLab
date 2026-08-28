import { useState } from 'react';
import { Box, Grid, Stack, Typography, Table, TableHead, TableBody, TableRow, TableCell, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAltOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
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

  const sub = { color: 'text.secondary' } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          EXP
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'exp.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'exp.p')}
        </Typography>
      </Box>

      <Card title={t(lang, 'exp.preset')} icon="🧩" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button tone="default" onClick={() => applyPreset(0)}>{t(lang, 'exp.apply')} 1</Button>
          <Button tone="default" onClick={() => applyPreset(1)}>2</Button>
          <Button tone="default" onClick={() => applyPreset(2)}>3</Button>
          <Button tone="default" onClick={() => applyPreset(3)}>4</Button>
          <Button tone="default" onClick={() => applyPreset(4)}>5</Button>
          <Button tone="primary" onClick={addPen} startIcon={<AddIcon />}>＋ {t(lang, 'exp.addPen')}</Button>
          <Button tone="warning" onClick={reset} startIcon={<RestartAltIcon />}>{t(lang, 'exp.reset')}</Button>
          <Button tone="success" onClick={build} startIcon={<BuildIcon />}>🏗️ {t(lang, 'exp.build')}</Button>
        </Stack>
      </Card>

      <Card title={t(lang, 'exp.penId')} icon="📑">
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="right">#</TableCell>
                <TableCell align="right">{t(lang, 'exp.penId')}</TableCell>
                <TableCell align="right">{t(lang, 'exp.birdCount')}</TableCell>
                <TableCell align="right">{t(lang, 'exp.treatment')}</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pens.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell align="right">{i + 1}</TableCell>
                  <TableCell align="right">
                    <Box
                      component="input"
                      value={p.id}
                      onChange={(e: any) => update(pens.map((x) => (x.id === p.id ? { ...x, id: e.target.value } : x)))}
                      sx={{ height: 32, px: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', color: 'text.primary', width: 80 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      component="input"
                      type="number"
                      value={p.birdCount}
                      onChange={(e: any) => update(pens.map((x) => (x.id === p.id ? { ...x, birdCount: +e.target.value } : x)))}
                      sx={{ height: 32, px: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', color: 'text.primary', width: 80 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      component="select"
                      value={p.treatment}
                      onChange={(e: any) => update(pens.map((x) => (x.id === p.id ? { ...x, treatment: e.target.value as TreatmentType } : x)))}
                      sx={{ height: 32, px: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', color: 'text.primary' }}
                    >
                      {TREATMENTS.map((tr) => <option key={tr} value={tr}>{TREAT_LABEL[tr]}</option>)}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => removePen(p.id)} aria-label="remove">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Card>
    </Box>
  );
}
