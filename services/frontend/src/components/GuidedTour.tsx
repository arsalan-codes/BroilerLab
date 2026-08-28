import { useState } from 'react';
import { useStore } from '../store';

const STEPS = [
  { title: 'خوش‌آمدید به BroilerLab', text: 'شبیه‌ساز آکادمیک دستگاه پایش مصرف خوراک طیور. این تور ۶ مرحله‌ای شما را با بخش‌های اصلی آشنا می‌کند.' },
  { title: 'داشبورد اعتبارسنجی', text: 'اینجا خروجی شبیه‌ساز با کاتالوگ رسمی سویه مقایسه می‌شود (MAE، FCR، منحنی رشد).' },
  { title: 'طرح آزمایش', text: 'پن‌ها، تعداد پرنده و تیمارها را تعریف کنید. از قالب‌های آماده استفاده کنید یا دستی بسازید.' },
  { title: 'نقشه فارم پویا', text: 'پس از ساخت طرح، فارم را با انیمیشن پرندگان و ایستگاه‌های تغذیه ببینید.' },
  { title: 'شبیه‌سازی زنده', text: 'سن، پن، سرعت و seed را تنظیم کنید و رفتار دستگاه (RFID، لودسل) را زنده تماشا کنید.' },
  { title: 'سناریوها و آمار', text: 'استرس حرارتی یا ایستگاه دوم را مقایسه کنید و تحلیل آماری (ANOVA/Welch) اجرا نمایید.' },
];

export function GuidedTour() {
  const lang = useStore((s) => s.lang);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <button className="btn ghost" style={{ position: 'fixed', bottom: 18, insetInlineEnd: 18, zIndex: 60 }} onClick={() => setOpen(true)}>💡 راهنما</button>;
  }

  const s = STEPS[step];
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 95 }} onClick={() => step === STEPS.length - 1 && setOpen(false)} />
      <div className="card" style={{ position: 'fixed', bottom: 24, insetInlineStart: 24, width: 340, maxWidth: '90vw', zIndex: 100, boxShadow: 'var(--sh-lg)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="tag bl">{step + 1} / {STEPS.length}</span>
          <b>{s.title}</b>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.8 }}>{s.text}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn ghost" onClick={() => setOpen(false)}>{lang === 'fa' ? 'رد کردن' : 'Skip'}</button>
          <div style={{ flex: 1 }} />
          {step > 0 && <button className="btn ghost" onClick={() => setStep((s) => s - 1)}>‹</button>}
          <button className="btn pri" onClick={() => { if (step < STEPS.length - 1) setStep((s) => s + 1); else setOpen(false); }}>›</button>
        </div>
      </div>
    </>
  );
}
