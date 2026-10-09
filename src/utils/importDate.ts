import { normalizeDateValue } from './helpers';

// تاريخ قادم من Excel/Google Sheet → YYYY-MM-DD
// - رقم (serial) يتحول لتاريخ حقيقي
// - نص بصيغة 4/10/2026 يتقري يوم/شهر/سنة (الصيغة المصرية)
export const parseImportDate = (value: unknown, fallback = ''): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return normalizeDateValue(raw) || fallback;
};
