import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme-globals.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { lightTheme, darkTheme } from './theme';
import { useStore } from './store';

// RTL cache for emotion when lang === 'fa'
const cacheRtl = createCache({ key: 'mui-rtl', stylisPlugins: [prefixer, rtlPlugin as any] });
const cacheLtr = createCache({ key: 'mui' });

function ThemedApp() {
  const themeMode = useStore((s) => s.theme);
  const lang = useStore((s) => s.lang);
  const theme = themeMode === 'light' ? lightTheme : darkTheme;
  const cache = lang === 'fa' ? cacheRtl : cacheLtr;

  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [lang, themeMode]);

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </CacheProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
);
