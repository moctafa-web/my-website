// مسودة الفاتورة: بتتحفظ في المتصفح (localStorage) تلقائياً أثناء الكتابة،
// وبتتمسح لما الفاتورة تتحفظ فعلاً أو لما المستخدم يتجاهلها.
const PREFIX = 'one-erp:invoice-draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // أسبوع

export interface Draft<T = any> {
  savedAt: string;
  data: T;
}

export const loadDraft = <T = any>(kind: 'sale' | 'purchase'): Draft<T> | null => {
  try {
    const raw = localStorage.getItem(PREFIX + kind);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft<T>;
    if (!d?.savedAt || !d.data) return null;
    if (Date.now() - new Date(d.savedAt).getTime() > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + kind);
      return null;
    }
    return d;
  } catch {
    return null;
  }
};

export const saveDraft = (kind: 'sale' | 'purchase', data: unknown) => {
  try {
    localStorage.setItem(PREFIX + kind, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    /* التخزين ممتلئ أو غير متاح: نتجاهل */
  }
};

export const clearDraft = (kind: 'sale' | 'purchase') => {
  try {
    localStorage.removeItem(PREFIX + kind);
  } catch {
    /* ignore */
  }
};
