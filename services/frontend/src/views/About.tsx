import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card } from '../components/common';
import { Box, Typography, Link } from '@mui/material';

export function About() {
  const lang = useStore((s) => s.lang);
  return (
    <section className="view" id="v-about">
      <Card>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>🏛️ {t(lang, 'about.uniT')}</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Box sx={{ width: 64, height: 64, borderRadius: 3, border: '2px solid', borderColor: 'primary.main', display: 'grid', placeItems: 'center', boxShadow: 2, fontSize: 32 }}>🐔</Box>
          <Box>
            <Box component="b" sx={{ fontSize: 17 }}>BroilerLab v1.0.0</Box><br />
            <Box component="small" sx={{ color: 'text.secondary' }}>{t(lang, 'about.subTitle')}</Box>
          </Box>
        </Box>
        <Box sx={{ lineHeight: 2.2, fontSize: 12.5 }}>
          <Typography variant="body2"><b>تاریخچه:</b> {t(lang, 'about.history')}</Typography>
          <Typography variant="body2"><b>تیم:</b> {t(lang, 'about.teamT')}</Typography>
          <Typography variant="body2"><b>منابع داده:</b> {t(lang, 'about.dataNote')}</Typography>
          <Typography variant="body2"><b>نقشه راه:</b> {t(lang, 'about.future')}</Typography>
        </Box>
        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Link href="https://github.com/arsalan-codes" target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'text.secondary', fontWeight: 600 }}>
            🐙 <b>github.com/arsalan-codes</b>
          </Link>
          <Link href="https://www.linkedin.com/in/arsalan-rezazadeh/" target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'text.secondary', fontWeight: 600 }}>
            💼 <b>linkedin.com/in/arsalan-rezazadeh</b>
          </Link>
        </Box>
      </Card>
    </section>
  );
}
