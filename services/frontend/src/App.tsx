import { useState } from 'react';
import { useStore } from './store';
import { Header } from './components/Header';
import { Nav } from './components/Nav';
import { MobileDrawer } from './components/MobileDrawer';
import { GuidedTour } from './components/GuidedTour';
import { Toasts } from './components/common';
import { Dashboard } from './views/Dashboard';
import { ExperimentDesigner } from './views/ExperimentDesigner';
import { Farm } from './views/Farm';
import { LiveSimulation } from './views/LiveSimulation';
import { Scenarios } from './views/Scenarios';
import { DeviceData } from './views/DeviceData';
import { Science } from './views/Science';
import { Methodology } from './views/Methodology';
import { About } from './views/About';
import { ExportModal } from './views/ExportModal';

const VIEWS: Record<string, () => React.JSX.Element> = {
  'v-dash': Dashboard,
  'v-exp': ExperimentDesigner,
  'v-farm': Farm,
  'v-sim': LiveSimulation,
  'v-scn': Scenarios,
  'v-dev': DeviceData,
  'v-sci': Science,
  'v-met': Methodology,
  'v-about': About,
};

export default function App() {
  const [active, setActive] = useState('v-dash');
  const [exOpen, setExOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const theme = useStore((s) => s.theme);
  const lang = useStore((s) => s.lang);
  const View = VIEWS[active] ?? Dashboard;

  return (
    <div className="wrap" data-theme={theme} data-lang={lang}>
      <Header onMenu={() => setDrawer(true)} />
      <Nav active={active} onChange={setActive} />
      <main>
        <div key={active} style={{ animation: 'fade .25s ease' }}>
          <View />
        </div>
      </main>
      <footer style={{ borderTop: '1px solid var(--line)', marginTop: 30, paddingTop: 16, textAlign: 'center', color: 'var(--mut)', fontSize: 11.5 }}>
        <div><b style={{ color: 'var(--mut)' }}>BroilerLab v1.0.0</b> — © 2026 Arsalan Rezazadeh</div>
        <div style={{ marginTop: 6 }}>
          <a href="https://github.com/arsalan-codes" target="_blank" rel="noopener" style={{ marginInlineEnd: 12 }}>🐙 github</a>
          <a href="https://www.linkedin.com/in/arsalan-rezazadeh/" target="_blank" rel="noopener">💼 linkedin</a>
        </div>
        <div style={{ marginTop: 6 }}>{lang === 'fa' ? 'داده‌ها: Aviagen · Cobb-Vantress · Hubbard · Poultry Science · animal' : 'Data: Aviagen · Cobb-Vantress · Hubbard · Poultry Science · animal'}</div>
        <div>{lang === 'fa' ? 'اجرای کامل آفلاین · seed تکرارپذیر = 308 · واحد نمونه آماری: پن' : 'Fully offline · reproducible seed = 308 · statistical unit: pen'}</div>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setExOpen(true)}>⬇ {lang === 'fa' ? 'خروجی داده' : 'Export'}</button>
      </footer>
      {drawer && <MobileDrawer active={active} onChange={setActive} onClose={() => setDrawer(false)} />}
      {exOpen && <ExportModal onClose={() => setExOpen(false)} />}
      <GuidedTour />
      <Toasts />
      <style>{`@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @media (max-width: 992px) { .mobile-only { display: grid !important; } }`}</style>
    </div>
  );
}
