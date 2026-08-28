import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Nav } from './Nav';

export function MobileDrawer({ active, onChange, onClose }: { active: string; onChange: (id: string) => void; onClose: () => void }) {
  const { lang, theme, setTheme, toggleLang } = useStore();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 90 }} />
      <div className="card" style={{
        position: 'fixed', top: 0, insetInlineEnd: 0, height: '100vh', width: '88vw', maxWidth: 320,
        zIndex: 100, borderRadius: 0, boxShadow: 'var(--sh-lg)', padding: 18, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <b>BroilerLab</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <Nav active={active} onChange={(id) => { onChange(id); onClose(); }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <button className="btn ghost" style={{ justifyContent: 'space-between' }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {t(lang, 'settings.theme')} <span className="tag bl">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>
          <button className="btn ghost" style={{ justifyContent: 'space-between' }} onClick={toggleLang}>
            {t(lang, 'settings.lang')} <span className="tag bl">{lang === 'fa' ? '🇮🇷' : '🇬🇧'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
