import { useState, Suspense, lazy } from 'react';
import { Box, Fade, Typography, Link, Button, Stack, Divider, CircularProgress } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './views/Dashboard';
import { GuidedTour } from './components/GuidedTour';
import { useStore } from './store';

// Route-level code splitting — heavy views (Recharts, TanStack Table, xlsx)
// are only downloaded when the user opens their tab.
const ExperimentDesigner = lazy(() => import('./views/ExperimentDesigner').then((m) => ({ default: m.ExperimentDesigner })));
const Farm = lazy(() => import('./views/Farm').then((m) => ({ default: m.Farm })));
const LiveSimulation = lazy(() => import('./views/LiveSimulation').then((m) => ({ default: m.LiveSimulation })));
const Scenarios = lazy(() => import('./views/Scenarios').then((m) => ({ default: m.Scenarios })));
const DeviceData = lazy(() => import('./views/DeviceData').then((m) => ({ default: m.DeviceData })));
const Science = lazy(() => import('./views/Science').then((m) => ({ default: m.Science })));
const Methodology = lazy(() => import('./views/Methodology').then((m) => ({ default: m.Methodology })));
const About = lazy(() => import('./views/About').then((m) => ({ default: m.About })));
const ExportModal = lazy(() => import('./views/ExportModal').then((m) => ({ default: m.ExportModal })));

const VIEWS: Record<string, React.ComponentType> = {
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

function ViewFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
      <CircularProgress size={28} thickness={4} />
    </Box>
  );
}

export default function App() {
  const [active, setActive] = useState('v-dash');
  const [exOpen, setExOpen] = useState(false);
  const lang = useStore((s) => s.lang);
  const View = VIEWS[active] ?? Dashboard;

  return (
    <AppShell active={active} onChange={setActive}>
      <Fade in key={active} timeout={220}>
        <Box>
          <Suspense fallback={<ViewFallback />}>
            <View />
          </Suspense>
        </Box>
      </Fade>

      <Divider sx={{ mt: 5, mb: 2.5 }} />
      <Box sx={{ textAlign: 'center', py: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          BroilerLab v2.0 — © 2026 Arsalan Rezazadeh
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1, justifyContent: 'center' }}>
          <Link href="https://github.com/arsalan-codes" target="_blank" rel="noopener" underline="hover" variant="caption">
            GitHub
          </Link>
          <Link href="https://www.linkedin.com/in/arsalan-rezazadeh/" target="_blank" rel="noopener" underline="hover" variant="caption">
            LinkedIn
          </Link>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {lang === 'fa' ? 'داده‌ها: Aviagen · Cobb-Vantress · Hubbard · Poultry Science' : 'Data: Aviagen · Cobb-Vantress · Hubbard · Poultry Science'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {lang === 'fa' ? 'اجرای کامل آفلاین · seed تکرارپذیر = 308 · واحد نمونه آماری: پن' : 'Fully offline · reproducible seed = 308 · statistical unit: pen'}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => setExOpen(true)}
          sx={{ mt: 2 }}
        >
          {lang === 'fa' ? 'خروجی داده' : 'Export'}
        </Button>
      </Box>

      {exOpen && (
        <Suspense fallback={null}>
          <ExportModal onClose={() => setExOpen(false)} />
        </Suspense>
      )}
      <GuidedTour />
    </AppShell>
  );
}
