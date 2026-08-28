import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Box, Stack, Typography, Checkbox, FormControlLabel, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Button } from '../components/common';

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { lang, sim, experiment, strain } = useStore();
  const [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx');
  const [sheets, setSheets] = useState({ summary: true, device: true, exp: true, catalog: true });

  const buildSummary = () => [
    { day: 15, bw: 400, fi: 50, fcr: 1.45 },
    { day: 30, bw: 1500, fi: 110, fcr: 1.5 },
    { day: 45, bw: 3200, fi: 180, fcr: 1.58 },
    { day: 60, bw: 4500, fi: 220, fcr: 1.63 },
  ];
  const buildDevice = () => sim.deviceRecords.slice(-200);
  const buildExp = () => (experiment?.pens ?? []).map((p) => ({ pen: p.id, birds: p.birdCount, treatment: p.treatment }));
  const buildCatalog = () => [{ strain, note: 'PO reference' }];

  const sheetLabels: Record<string, string> = {
    summary: 'خلاصه روزانه',
    device: 'داده دستگاه',
    exp: 'طرح آزمایش',
    catalog: 'کاتالوگ PO',
  };

  const generate = () => {
    if (fmt === 'xlsx') {
      const wb = XLSX.utils.book_new();
      if (sheets.summary) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSummary()), 'خلاصه روزانه');
      if (sheets.device) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildDevice()), 'داده دستگاه');
      if (sheets.exp) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildExp()), 'طرح آزمایش');
      if (sheets.catalog) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildCatalog()), 'کاتالوگ PO');
      XLSX.writeFile(wb, `broilerlab_${strain}.xlsx`);
    } else {
      const rows = buildDevice();
      const header = Object.keys(rows[0] ?? {}).join(',');
      const body = rows.map((r) => Object.values(r).join(',')).join('\n');
      const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `broilerlab_${strain}.csv`;
      a.click();
    }
    useStore.getState().toast(t(lang, 'ex.generate'));
    onClose();
  };

  const sub = { color: 'text.secondary' } as const;

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t(lang, 'ex.title')}</span>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ ...sub, display: 'block', mb: 1.5 }}>
          {t(lang, 'ex.source')} <b style={{ direction: 'ltr' }}>simulation</b>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Button tone={fmt === 'xlsx' ? 'primary' : 'default'} onClick={() => setFmt('xlsx')}>📊 Excel</Button>
          <Button tone={fmt === 'csv' ? 'primary' : 'default'} onClick={() => setFmt('csv')}>⬇ CSV</Button>
        </Stack>
        {fmt === 'xlsx' && (
          <Stack spacing={0.5} sx={{ fontSize: 13 }}>
            {Object.entries(sheets).map(([k, v]) => (
              <FormControlLabel
                key={k}
                control={
                  <Checkbox
                    checked={v}
                    onChange={(e) => setSheets((s) => ({ ...s, [k]: e.target.checked }))}
                  />
                }
                label={sheetLabels[k]}
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button tone="default" onClick={onClose}>{t(lang, 'ex.back')}</Button>
        <Button tone="primary" onClick={generate}>⬇ {t(lang, 'ex.generate')}</Button>
      </DialogActions>
    </Dialog>
  );
}
