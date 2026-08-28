import { useState, useEffect, useRef } from 'react';
import {
  AppBar, Toolbar, Box, Typography, IconButton, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Divider, Container, Chip, Menu, MenuItem,
  Tooltip, useMediaQuery, Avatar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ScienceIcon from '@mui/icons-material/Science';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import LiveTvIcon from '@mui/icons-material/LiveTv';
import CompareIcon from '@mui/icons-material/CompareArrows';
import StorageIcon from '@mui/icons-material/Storage';
import BiotechIcon from '@mui/icons-material/Biotech';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import TranslateIcon from '@mui/icons-material/Translate';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useStore } from '../../store';
import { t } from '../../i18n/strings';
import { toShamsiStringFa } from '../../i18n/shamsi';
import type { StrainKey } from '../../types';
import { STRAINS } from '../../engine/strains';

const DRAWER_W = 280;

const TABS = [
  { id: 'v-dash', idx: '01', key: 'nav.1', icon: DashboardIcon, color: '#19c39a' },
  { id: 'v-exp', idx: '02', key: 'nav.2', icon: ScienceIcon, color: '#3d7bfd' },
  { id: 'v-farm', idx: '03', key: 'nav.3', icon: AgricultureIcon, color: '#e99b26' },
  { id: 'v-sim', idx: '04', key: 'nav.4', icon: LiveTvIcon, color: '#e5484d' },
  { id: 'v-scn', idx: '05', key: 'nav.5', icon: CompareIcon, color: '#8b5cf6' },
  { id: 'v-dev', idx: '06', key: 'nav.6', icon: StorageIcon, color: '#19c39a' },
  { id: 'v-sci', idx: '07', key: 'nav.7', icon: BiotechIcon, color: '#3d7bfd' },
  { id: 'v-met', idx: '08', key: 'nav.8', icon: MenuBookIcon, color: '#e99b26' },
  { id: 'v-about', idx: '09', key: 'nav.9', icon: InfoIcon, color: '#8a95ab' },
] as const;

const STRAIN_LABEL: Record<StrainKey, string> = {
  ross308: 'Ross 308', cobb500: 'Cobb 500', aaplus: 'AA+', hubbardep: 'Hubbard EP',
};

export function AppShell({ active, onChange, children }: {
  active: string; onChange: (id: string) => void; children: React.ReactNode;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const { lang, theme: themeMode, strain, setStrain, toggleLang, toggleTheme, toasts, dismissToast } = useStore();
  const [clock, setClock] = useState('');
  const [strainAnchor, setStrainAnchor] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => {
    const tick = () => setClock(toShamsiStringFa(new Date()));
    tick(); const id = setInterval(tick, 60_000); return () => clearInterval(id);
  }, [lang]);

  useEffect(() => { setDrawerOpen(!isMobile); }, [isMobile]);

  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, md: 64 } }}>
          <IconButton edge="start" onClick={() => setDrawerOpen((v) => !v)} sx={{ mr: 0.5 }}>
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 16, fontWeight: 800 }}>B</Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {lang === 'fa' ? 'برایلرلب' : 'BroilerLab'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                {lang === 'fa' ? 'سامانه هوشمند مرغداری' : 'Poultry Intelligence'}
              </Typography>
            </Box>
            <Chip
              label={STRAIN_LABEL[strain]}
              size="small"
              onClick={(e) => setStrainAnchor(e.currentTarget)}
              sx={{ ml: 1, fontWeight: 700, display: { xs: 'none', md: 'flex' } }}
              color="primary"
              variant="outlined"
            />
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Clock - desktop */}
          <Chip
            label={clock}
            size="small"
            variant="outlined"
            sx={{ display: { xs: 'none', lg: 'flex' }, fontFamily: 'Vazirmatn', fontWeight: 600 }}
          />

          <Tooltip title={lang === 'fa' ? 'تغییر زبان' : 'Toggle language'}>
            <IconButton onClick={toggleLang} size="small"><TranslateIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={themeMode === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton onClick={toggleTheme} size="small">
              {themeMode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={(e) => setNotifAnchor(e.currentTarget)}>
            <NotificationsIcon fontSize="small" />
          </IconButton>
          <IconButton size="small"><SettingsIcon fontSize="small" /></IconButton>

          {/* Strain menu */}
          <Menu anchorEl={strainAnchor} open={!!strainAnchor} onClose={() => setStrainAnchor(null)}>
            {(Object.keys(STRAINS) as StrainKey[]).map((k) => (
              <MenuItem key={k} selected={strain === k} onClick={() => { setStrain(k); setStrainAnchor(null); }}>
                {STRAIN_LABEL[k]}
              </MenuItem>
            ))}
          </Menu>
          <Menu anchorEl={notifAnchor} open={!!notifAnchor} onClose={() => setNotifAnchor(null)}>
            <MenuItem dense>{lang === 'fa' ? 'اعلانی وجود ندارد' : 'No new notifications'}</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_W,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_W, boxSizing: 'border-box', pt: 8 },
        }}
      >
        <Box sx={{ p: 2, pt: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 1.5, fontWeight: 700, letterSpacing: '0.08em', display: 'block' }}>
            {lang === 'fa' ? 'منو' : 'NAVIGATION'}
          </Typography>
          <List dense sx={{ mt: 0.5 }}>
            {TABS.map((tab) => {
              const activeNow = active === tab.id;
              const Icon = tab.icon;
              return (
                <ListItemButton
                  key={tab.id}
                  selected={activeNow}
                  onClick={() => { onChange(tab.id); if (isMobile) setDrawerOpen(false); }}
                  sx={{
                    borderRadius: 3,
                    mb: 0.5,
                    ...(activeNow && {
                      bgcolor: 'primary.container' as any,
                      color: 'primary.onContainer' as any,
                      '& .MuiListItemIcon-root': { color: 'primary.main' },
                    }),
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Box sx={{
                      width: 28, height: 28, borderRadius: 2, display: 'grid', placeItems: 'center',
                      bgcolor: activeNow ? 'primary.main' : 'action.hover', color: activeNow ? 'primary.contrastText' : 'text.secondary',
                    }}>
                      <Icon sx={{ fontSize: 16 }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={<Typography variant="body2" component="span" sx={{ fontWeight: activeNow ? 700 : 500 }}>{t(lang, tab.key) || tab.key}</Typography>}
                    secondary={tab.idx}
                  />
                  {activeNow && <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: tab.color }} />}
                </ListItemButton>
              );
            })}
          </List>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ px: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {lang === 'fa' ? 'نسخه ۲.۰ — Material 3' : 'v2.0 — Material 3'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {clock}
            </Typography>
          </Box>
        </Box>
      </Drawer>

      {/* Main */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: 8,
          ml: isMobile ? 0 : drawerOpen ? 0 : 0,
          transition: (t) => t.transitions.create('margin', { easing: t.transitions.easing.sharp, duration: t.transitions.duration.leavingScreen }),
          minWidth: 0,
          bgcolor: 'background.default',
        }}
      >
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, px: { xs: 1.5, md: 3 } }}>
          {children}
        </Container>

        {/* Toasts as MUI Snackbar-like stack */}
        <Box sx={{ position: 'fixed', bottom: 16, insetInlineEnd: 16, zIndex: 1400, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {toasts.map((toast) => (
            <Box
              key={toast.id}
              onClick={() => dismissToast(toast.id)}
              sx={{
                px: 2, py: 1.2, borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                bgcolor: toast.kind === 'bad' ? 'error.container' : toast.kind === 'warn' ? 'tertiary.container' : toast.kind === 'ok' ? 'primary.container' : 'secondary.container',
                color: toast.kind === 'bad' ? 'error.onContainer' : 'text.primary',
                boxShadow: 3, minWidth: 260, maxWidth: 420,
              } as any}
            >
              {toast.msg}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
