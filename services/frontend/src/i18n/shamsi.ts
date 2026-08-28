// Jalali (Shamsi) conversion utilities — no external deps.
export function toJalali(g: Date): { jy: number; jm: number; jd: number } {
  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();
  const gregorianDaysBefore = Math.floor((gy - 1) * 365 + (gy - 1) / 4 - (gy - 1) / 100 + (gy - 1) / 400);
  let gDays = gregorianDaysBefore + dayOfYear(gm, gd, isLeap(gy));
  let jy = (gDays > 0 ? -1 : 0) + Math.floor((gDays - 1) / 365);
  while (gDays > jalaliDaysInYear(jy)) {
    gDays -= jalaliDaysInYear(jy);
    jy++;
  }
  let jm = 0;
  while (gDays > jalaliMonthDays(jy, jm)) {
    gDays -= jalaliMonthDays(jy, jm);
    jm++;
  }
  return { jy, jm: jm + 1, jd: gDays };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function dayOfYear(m: number, d: number, _leap: boolean): number {
  const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return days[m - 1] + d;
}
function jalaliDaysInYear(year: number): number {
  const mod = year % 33;
  return mod === 1 || mod === 5 || mod === 9 || mod === 13 || mod === 17 || mod === 22 || mod === 26 || mod === 30 ? 366 : 365;
}
function jalaliMonthDays(year: number, monthIndex: number): number {
  const normal = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  if (monthIndex === 11 && jalaliDaysInYear(year) === 366) return 30;
  return normal[monthIndex];
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function toPersianDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[+d]);
}

export function toShamsiString(g: Date): string {
  const { jy, jm, jd } = toJalali(g);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function toShamsiStringFa(g: Date): string {
  return toPersianDigits(toShamsiString(g));
}

export function gregorianNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
