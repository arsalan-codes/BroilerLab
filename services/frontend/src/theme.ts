import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

// M3 tonal palette derived from BroilerLab teal #19c39a + complementary indigo
const brand = {
  teal: '#19c39a',
  tealDark: '#0e8a6b',
  tealContainer: '#b8f5e3',
  indigo: '#3d7bfd',
  indigoContainer: '#dbe1ff',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  warn: '#7a5900',
  warnContainer: '#ffdf9e',
};

const typography: ThemeOptions['typography'] = {
  fontFamily: 'Vazirmatn, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  h1: { fontSize: '2.8rem', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' },
  h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 },
  h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 },
  h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35 },
  h5: { fontSize: '1.1rem', fontWeight: 600 },
  h6: { fontSize: '1rem', fontWeight: 600 },
  body1: { fontSize: '0.95rem', lineHeight: 1.65 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  button: { textTransform: 'none' as const, fontWeight: 600, letterSpacing: '0.01em' },
};

const shape: ThemeOptions['shape'] = { borderRadius: 16 };

function getDesignTokens(mode: 'light' | 'dark'): ThemeOptions {
  const isLight = mode === 'light';
  return {
    palette: {
      mode,
      primary: {
        main: isLight ? '#006b5a' : brand.teal,
        light: isLight ? '#4dd8b8' : '#6cf0c8',
        dark: brand.tealDark,
        contrastText: isLight ? '#ffffff' : '#00382d',
        // @ts-ignore M3 extra
        container: isLight ? brand.tealContainer : '#004e3f',
        onContainer: isLight ? '#00201a' : '#b8f5e3',
      } as any,
      secondary: {
        main: isLight ? '#3d5a92' : '#b1c6ff',
        contrastText: isLight ? '#ffffff' : '#002e6a',
        // @ts-ignore
        container: brand.indigoContainer,
        onContainer: '#00164e',
      } as any,
      error: {
        main: brand.error,
        // @ts-ignore
        container: brand.errorContainer,
        onContainer: '#410002',
      } as any,
      background: {
        default: isLight ? '#f8f9ff' : '#0b0f17',
        paper: isLight ? '#ffffff' : '#111826',
      },
      divider: isLight ? '#e1e2e6' : '#1f2a3d',
      text: {
        primary: isLight ? '#1a1c1e' : '#e8edf5',
        secondary: isLight ? '#44474e' : '#8a95ab',
      },
    },
    typography,
    shape,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { scrollbarWidth: 'thin' as const },
          '*::-webkit-scrollbar': { width: 8, height: 8 },
          '*::-webkit-scrollbar-thumb': {
            background: isLight ? '#c4c6cf' : '#2a3449',
            borderRadius: 999,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(17,24,38,0.92)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${isLight ? '#e1e2e6' : '#1f2a3d'}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: isLight ? '#f3f3f8' : '#0e141f',
            borderRight: `1px solid ${isLight ? '#e1e2e6' : '#1f2a3d'}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            border: `1px solid ${isLight ? '#e1e2e6' : '#1f2a3d'}`,
            boxShadow: isLight
              ? '0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)'
              : '0 1px 2px rgba(0,0,0,.28), 0 8px 24px rgba(0,0,0,.28)',
            overflow: 'hidden',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 20, paddingBlock: 9 },
          contained: { boxShadow: 'none', ':hover': { boxShadow: '0 2px 8px rgba(0,0,0,.18)' } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 600 },
          filled: { border: '1px solid transparent' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: 20 },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 700,
              fontSize: '0.78rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              color: isLight ? '#44474e' : '#8a95ab',
              background: isLight ? '#f8f9ff' : '#0e141f',
              borderBottom: `1px solid ${isLight ? '#e1e2e6' : '#1f2a3d'}`,
            },
          },
        },
      },
    },
  };
}

export const lightTheme = createTheme(getDesignTokens('light'));
export const darkTheme = createTheme(getDesignTokens('dark'));

// Helper for components needing raw brand colors
export const brandColors = brand;
