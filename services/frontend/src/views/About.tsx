import { useStore } from '../store';
import { t } from '../i18n/strings';
import { Card } from '../components/common';

export function About() {
  const lang = useStore((s) => s.lang);
  return (
    <section className="view" id="v-about">
      <Card>
        <h3>🏛️ {t(lang, 'about.uniT')}</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 15 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, border: '2px solid rgba(25,195,154,.38)', display: 'grid', placeItems: 'center', boxShadow: '0 0 16px rgba(25,195,154,.2)', fontSize: 32 }}>🐔</div>
          <div>
            <b style={{ fontSize: 17 }}>BroilerLab v1.0.0</b><br />
            <small className="dm">{t(lang, 'about.subTitle')}</small>
          </div>
        </div>
        <div style={{ lineHeight: 2.2, fontSize: 12.5 }}>
          <p><b>تاریخچه:</b> {t(lang, 'about.history')}</p>
          <p><b>تیم:</b> {t(lang, 'about.teamT')}</p>
          <p><b>منابع داده:</b> {t(lang, 'about.dataNote')}</p>
          <p><b>نقشه راه:</b> {t(lang, 'about.future')}</p>
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="https://github.com/arsalan-codes" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: 'var(--mut)' }}>🐙 <b>github.com/arsalan-codes</b></a>
          <a href="https://www.linkedin.com/in/arsalan-rezazadeh/" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: 'var(--mut)' }}>💼 <b>linkedin.com/in/arsalan-rezazadeh</b></a>
        </div>
      </Card>
    </section>
  );
}
