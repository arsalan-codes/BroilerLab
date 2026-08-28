import { useState, useRef, useEffect } from 'react';
import { IconButton, Menu, MenuItem, Divider, Tooltip, Box, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import TranslateIcon from '@mui/icons-material/Translate';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import { useStore } from '../store';
import { t } from '../i18n/strings';

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
      <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      {value && (
        <Typography variant="caption" color="text.secondary">
          {value}
        </Typography>
      )}
    </Box>
  );
}

export function SettingsMenu() {
  const { lang, theme, setTheme, toggleLang, resetCycleData } = useStore();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (anchor && ref.current && !ref.current.contains(e.target as Node)) setAnchor(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [anchor]);

  const close = () => setAnchor(null);

  return (
    <div ref={ref}>
      <Tooltip title={t(lang, 'settings.title')}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Settings" size="small">
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} sx={{ mt: 1 }} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        <Typography
          variant="caption"
          sx={{ px: 2, pt: 1, pb: 0.5, fontWeight: 700, color: 'text.secondary', display: 'block' }}
        >
          {t(lang, 'settings.title')}
        </Typography>
        <Divider />
        <MenuItem
          onClick={() => {
            setTheme(theme === 'dark' ? 'light' : 'dark');
            close();
          }}
        >
          <Row
            icon={theme === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            label={t(lang, 'settings.theme')}
            value={theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            toggleLang();
            close();
          }}
        >
          <Row
            icon={<TranslateIcon fontSize="small" />}
            label={t(lang, 'settings.lang')}
            value={lang === 'fa' ? '🇮🇷 فا' : '🇬🇧 EN'}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            useStore.getState().toast(t(lang, 'settings.help'), 'info');
            close();
          }}
        >
          <Row icon={<HelpOutlineOutlinedIcon fontSize="small" />} label={t(lang, 'settings.help')} />
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (typeof window !== 'undefined' && window.confirm('Reset cycle data?')) {
              resetCycleData();
              useStore.getState().toast('Reset done', 'ok');
            }
            close();
          }}
        >
          <Row icon={<RestartAltIcon fontSize="small" />} label={t(lang, 'settings.reset')} />
        </MenuItem>
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
            BroilerLab v1.0.0
          </Typography>
          <Typography variant="caption" color="text.secondary">
            MAE 14.1g · seed 308
          </Typography>
        </Box>
      </Menu>
    </div>
  );
}
