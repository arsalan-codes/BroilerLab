import { useStore } from '../store';
import { t } from '../i18n/strings';

const TABS = [
  { id: 'v-dash', idx: '01', key: 'nav.1' },
  { id: 'v-exp', idx: '02', key: 'nav.2' },
  { id: 'v-farm', idx: '03', key: 'nav.3' },
  { id: 'v-sim', idx: '04', key: 'nav.4' },
  { id: 'v-scn', idx: '05', key: 'nav.5' },
  { id: 'v-dev', idx: '06', key: 'nav.6' },
  { id: 'v-sci', idx: '07', key: 'nav.7' },
  { id: 'v-met', idx: '08', key: 'nav.8' },
  { id: 'v-about', idx: '09', key: 'nav.9' },
] as const;

export function Nav({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  const lang = useStore((s) => s.lang);
  return (
    <nav className="tabs" role="tablist" aria-label="Views">
      {TABS.map((tb) => (
        <button
          key={tb.id}
          className={`tab ${active === tb.id ? 'active' : ''}`}
          role="tab"
          aria-selected={active === tb.id}
          onClick={() => onChange(tb.id)}
        >
          <span className="idx">{tb.idx}</span>
          {t(lang, tb.key)}
        </button>
      ))}
    </nav>
  );
}
