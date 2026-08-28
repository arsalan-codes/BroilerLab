import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card } from '../components/common';

const SOURCES = [
  { b: '[1] Aviagen — Ross Broiler Management Handbook (2025)', u: 'https://aviagen.com/assets/Tech_Center/Ross_Broiler/Aviagen-ROSS-Broiler-Handbook-EN.pdf', q: '“After 27 days of age, the temperature should remain at 20°C”' },
  { b: '[2] Marcato et al. (2008). R. Bras. Zootec.', u: 'https://redalyc.org/pdf/1797/179713999007.pdf', q: '“the Gompertz function is the one that best describes them”' },
  { b: '[3] Aviagen — Ross 308 PO · Cobb-Vantress · AA+ · Hubbard EP', u: 'https://www.cobbgenetics.com/assets/Cobb-Files/2022-Cobb500-Broiler-Performance-Nutrition-Supplement.pdf', q: 'کاتالوگ کامل وزن/مصرف/FCR هر سویه' },
  { b: '[5] van der Sluis et al. (2025). Poultry Science 104:105103', u: 'https://edepot.wur.nl/691892', q: '“The NFV decreased as the birds grew older”' },
  { b: '[6] Erensoy et al. (2022). Arch Anim Breed 65:171', u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9097258', q: '“Feed efficiency worsened with larger group size”' },
  { b: '[7] Li et al. (2018). animal — UHF-RFID', u: 'https://www.sciencedirect.com/science/article/pii/S1751731118003440', q: 'IBN 92.5% / TS 99%' },
  { b: '[8] Li et al. (2021). Poultry Science', u: 'https://pubmed.ncbi.nlm.nih.gov/33662663/', q: '“less than 60 s… lights ON/OFF peaks”' },
];

export function Science() {
  const lang = useStore((s) => s.lang);
  return (
    <section className="view" id="v-sci">
      <div className="view-head">
        <span className="eyebrow">SCI</span>
        <h2>{t(lang, 'sci.title')}</h2>
        <p>{t(lang, 'sci.p')}</p>
      </div>
      <Card title={t(lang, 'sci.sources')} icon="📚">
        <div style={{ lineHeight: 2.1, fontSize: 12 }}>
          {SOURCES.map((s, i) => (
            <p key={i}><b>{s.b}</b> <a href={s.u} target="_blank" rel="noopener">↗</a><br /><span className="dir-ltr" style={{ color: 'var(--mut)' }}>“{s.q}”</span></p>
          ))}
        </div>
      </Card>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title={t(lang, 'sci.chain')} icon="🔗">
          <div style={{ lineHeight: 2.3, fontSize: 12 }}>
            <p><span className="tag ok">گام ۱</span> کاتالوگ سویه = هدف قفل‌شده هر روز</p>
            <p><span className="tag ok">گام ۲</span> انحراف فردی CV≈۵٪ + AR(1) + بند‌بندی</p>
            <p><span className="tag ok">گام ۳</span> رگرسیون‌های RFID = تعداد/مدت وعده</p>
            <p><span className="tag ok">گام ۴</span> دیورنال دوقله + نور 18L:6D</p>
            <p><span className="tag ok">گام ۵</span> اندازه گروه = تعدیل جزئی FI/BW</p>
            <p><span className="tag ok">گام ۶</span> فیزیک لودسل/RFID = نویز، EMA، صف ≤۹۰s</p>
            <p><span className="tag wn">آمار</span> اثر تصادفی پن (~۱٫۲٪)</p>
            <p><span className="tag ok">خروجی</span> MAE وزن ≈ ۱–۲٪</p>
          </div>
        </Card>
        <Card title={t(lang, 'sci.limits')} icon="⚖️">
          <div style={{ lineHeight: 2.05, fontSize: 12 }}>
            <p>① Ross booklet سال ۲۰۰۷؛ نسخه‌های جدیدتر اهداف متفاوت.</p>
            <p>② اثر اندازه گروه در ۳–۱۲ پرنده غالباً غیرمعنی‌دار.</p>
            <p>③ مدل صف ساده (≤۹۰s).</p>
            <p>④ تلفات احتمال ثابت روزانه [تأییدنشده].</p>
            <p>⑤ ضرایب تیمارها کالیبره‌اند نه استخراج مستقیم.</p>
            <p>⑥ آمار روی «پن» به‌عنوان واحد نمونه.</p>
          </div>
        </Card>
      </div>
    </section>
  );
}
