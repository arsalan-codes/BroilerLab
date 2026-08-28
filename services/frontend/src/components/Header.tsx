import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import type { StrainKey } from '../types';
import { STRAINS } from '../engine/strains';
import { toShamsiStringFa } from '../i18n/shamsi';
import { SettingsMenu } from './SettingsMenu';

const STRAIN_NAMES: Record<StrainKey, string> = { ross308: 'Ross 308', cobb500: 'Cobb 500', aaplus: 'AA+', hubbardep: 'Hubbard EP' };

export function Header({ onMenu }: { onMenu: () => void }) {
  const { lang, theme, strain, setTheme, toggleLang, setStrain } = useStore();
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const g = now.toLocaleTimeString('en-GB');
      const s = toShamsiStringFa(now);
      setClock(lang === 'fa' ? `${s} · ${g}` : `${now.toISOString().slice(0, 10)} · ${g}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lang]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Menu" style={{ display: 'none' }}>☰</button>
      <div className="brand">
        <div className="mark">🐔</div>
        <div>
          <div className="bt">{t(lang, 'app.title')}</div>
          <div className="bs">{t(lang, 'app.sub')}</div>
          <div className="bu">{t(lang, 'app.uni')}</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="topclock"><span>🕐</span><span className="dir-ltr">{clock}</span></div>

      <div className="strain-select" ref={ref}>
        <div className="strain-select__current" onClick={() => setOpen((o) => !o)} role="combobox" aria-expanded={open} tabIndex={0}>
          <span>{STRAIN_NAMES[strain]}</span>
          <span className="strain-select__icon">▾</span>
        </div>
        {open && (
          <ul className="strain-select__list" role="listbox">
            {(Object.keys(STRAINS) as StrainKey[]).map((k) => (
              <li key={k} className="strain-select__option" role="option" aria-selected={strain === k} onClick={() => { setStrain(k); setOpen(false); }}>
                <span className="strain-select__radio" />{STRAIN_NAMES[k]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="icon-btn" onClick={toggleLang} title="Language" aria-label="Language">🌐</button>
      <SettingsMenu />
      <button className="icon-btn" onClick={() => location.reload()} title="Reset" aria-label="Reset">⟲</button>
    </header>
  );
}
