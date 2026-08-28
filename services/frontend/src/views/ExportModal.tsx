import { useState } from 'react';
import * as XLSX from 'xlsx';
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

  return (
    <div className="modal-wrap" style={{ display: 'grid', placeItems: 'center', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300 }} onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, width: 420, maxWidth: '92vw', boxShadow: 'var(--sh-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <b>{t(lang, 'ex.title')}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 12 }}>{t(lang, 'ex.source')} <b className="dir-ltr">simulation</b></div>
        <div className="langseg" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button className={`btn ${fmt === 'xlsx' ? 'pri' : 'ghost'}`} onClick={() => setFmt('xlsx')}>📊 Excel</button>
          <button className={`btn ${fmt === 'csv' ? 'pri' : 'ghost'}`} onClick={() => setFmt('csv')}>⬇ CSV</button>
        </div>
        {fmt === 'xlsx' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {Object.entries(sheets).map(([k, v]) => (
              <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={v} onChange={(e) => setSheets((s) => ({ ...s, [k]: e.target.checked }))} /> {k === 'summary' ? 'خلاصه روزانه' : k === 'device' ? 'داده دستگاه' : k === 'exp' ? 'طرح آزمایش' : 'کاتالوگ PO'}
              </label>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="ghost" onClick={onClose}>{t(lang, 'ex.back')}</Button>
          <Button variant="blue" onClick={generate}>⬇ {t(lang, 'ex.generate')}</Button>
        </div>
      </div>
    </div>
  );
}
