import { Box, Grid, Stack, Typography } from '@mui/material';
import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card, Tag } from '../components/common';

const SOURCES = [
  { b: '[1] Aviagen — Ross Broiler Management Handbook (2025)', u: 'https://aviagen.com/assets/Tech_Center/Ross_Broiler/Aviagen-ROSS-Broiler-Handbook-EN.pdf', q: '“After 27 days of age, the temperature should remain at 20°C”' },
  { b: '[2] Marcato et al. (2008). R. Bras. Zootec.', u: 'https://redalyc.org/pdf/1797/179713999007.pdf', q: '“the Gompertz function is the one that best describes them”' },
  { b: '[3] Aviagen — Ross 308 PO · Cobb-Vantress · AA+ · Hubbard EP', u: 'https://www.cobbgenetics.com/assets/Cobb-Files/2022-Cobb500-Broiler-Performance-Nutrition-Supplement.pdf', q: 'کاتالوگ کامل وزن/مصرف/FCR هر سویه' },
  { b: '[5] van der Sluis et al. (2025). Poultry Science 104:105103', u: 'https://edepot.wur.nl/691892', q: '“The NFV decreased as the birds grew older”' },
  { b: '[6] Erensoy et al. (2022). Arch Anim Breed 65:171', u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9097258', q: '“Feed efficiency worsened with larger group size”' },
  { b: '[7] Li et al. (2018). animal — UHF-RFID', u: 'https://www.sciencedirect.com/science/article/pii/S1751731118003440', q: 'IBN 92.5% / TS 99%' },
  { b: '[8] Li et al. (2021). Poultry Science', u: 'https://pubmed.ncbi.nlm.nih.gov/33662663/', q: '“less than 60 s… lights ON/OFF peaks”' },
];

const CHAIN = [
  'گام ۱ — کاتالوگ سویه = هدف قفل‌شده هر روز',
  'گام ۲ — انحراف فردی CV≈۵٪ + AR(1) + بند‌بندی',
  'گام ۳ — رگرسیون‌های RFID = تعداد/مدت وعده',
  'گام ۴ — دیورنال دوقله + نور 18L:6D',
  'گام ۵ — اندازه گروه = تعدیل جزئی FI/BW',
  'گام ۶ — فیزیک لودسل/RFID = نویز، EMA، صف ≤۹۰s',
  'آمار — اثر تصادفی پن (~۱٫۲٪)',
  'خروجی — MAE وزن ≈ ۱–۲٪',
];

const LIMITS = [
  '① Ross booklet سال ۲۰۰۷؛ نسخه‌های جدیدتر اهداف متفاوت.',
  '② اثر اندازه گروه در ۳–۱۲ پرنده غالباً غیرمعنی‌دار.',
  '③ مدل صف ساده (≤۹۰s).',
  '④ تلفات احتمال ثابت روزانه [تأییدنشده].',
  '⑤ ضرایب تیمارها کالیبره‌اند نه استخراج مستقیم.',
  '⑥ آمار روی «پن» به‌عنوان واحد نمونه.',
];

export function Science() {
  const lang = useStore((s) => s.lang);
  const sub = { color: 'text.secondary' } as const;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', textTransform: 'uppercase' }}>
          SCI
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800 }}>
          {t(lang, 'sci.title')}
        </Typography>
        <Typography variant="body2" sx={{ ...sub, mt: 0.5 }}>
          {t(lang, 'sci.p')}
        </Typography>
      </Box>

      <Card title={t(lang, 'sci.sources')} icon="📚" sx={{ mb: 2 }}>
        <Stack spacing={1.5} sx={{ fontSize: 12, lineHeight: 1.8 }}>
          {SOURCES.map((s, i) => (
            <Box key={i}>
              <b>{s.b}</b>{' '}
              <a href={s.u} target="_blank" rel="noopener noreferrer" style={{ direction: 'ltr' }}>↗</a>
              <br />
              <Box component="span" sx={{ direction: 'ltr', color: 'var(--mut)' }}>"{s.q}"</Box>
            </Box>
          ))}
        </Stack>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'sci.chain')} icon="🔗">
            <Stack spacing={1.2} sx={{ fontSize: 12, lineHeight: 2 }}>
              {CHAIN.map((c, i) => (
                <Typography variant="body2" key={i}>
                  <Tag tone="success">{c.split(' — ')[0]}</Tag> {c.split(' — ')[1]}
                </Typography>
              ))}
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card title={t(lang, 'sci.limits')} icon="⚖️">
            <Stack spacing={1.2} sx={{ fontSize: 12, lineHeight: 2 }}>
              {LIMITS.map((c, i) => (
                <Typography variant="body2" key={i}>{c}</Typography>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
