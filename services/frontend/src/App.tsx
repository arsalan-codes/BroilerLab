import { useState } from 'react';
import { Box, Fade, Typography, Link, Button, Stack, Divider } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { AppShell } from './components/layout/AppShell';
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
import { GuidedTour } from './components/GuidedTour';
import { useStore } from './store';

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
  const lang = useStore((s) => s.lang);
  const View = VIEWS[active] ?? Dashboard;

  return (
    <AppShell active={active} onChange={setActive}>
      <Fade in key={active} timeout={220}>
        <Box>
          <View />
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

      {exOpen && <ExportModal onClose={() => setExOpen(false)} />}
      <GuidedTour />
    </AppShell>
  );
}
