import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';

export function SettingsMenu() {
  const { lang, theme, setTheme, toggleLang, resetCycleData } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Settings" title="Settings">⚙️</button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: 44, insetInlineEnd: 0, width: 280, zIndex: 80, padding: 12, boxShadow: 'var(--sh-md)' }}>
          <div style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 700, marginBottom: 8 }}>SETTINGS</div>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {t(lang, 'settings.theme')} <span className="tag bl">{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</span>
          </button>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={toggleLang}>
            {t(lang, 'settings.lang')} <span className="tag bl">{lang === 'fa' ? '🇮🇷 فا' : '🇬🇧 EN'}</span>
          </button>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => useStore.getState().toast(t(lang, 'settings.help'), 'info')}>
            {t(lang, 'settings.help')} <span>？</span>
          </button>
          <button className="btn warn" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => { if (confirm('Reset cycle data?')) { resetCycleData(); useStore.getState().toast('Reset done', 'ok'); } }}>
            {t(lang, 'settings.reset')} <span>⟲</span>
          </button>
          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 10, textAlign: 'center' }}>BroilerLab v1.0.0 · MAE 14.1g · seed 308</div>
        </div>
      )}
    </div>
  );
}
