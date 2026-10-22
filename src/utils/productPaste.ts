import { Product } from '../types';
import { normalizeForCompare, normalizeProductCode, productMatchesCode } from './helpers';

// لصق منتجات جديدة من إكسيل: UPC | اسم المنتج
export interface PastedProductRow {
  line: number;
  upc: string;
  name: string;
  raw: string;
}

export type ProductPasteState =
  | { kind: 'ok' }
  | { kind: 'error'; reason: string }
  | { kind: 'dupUpc'; product: Product }
  | { kind: 'dupName'; product: Product }
  | { kind: 'dupInPaste'; firstLine: number; by: 'upc' | 'name' };

const toWesternDigits = (s: string) =>
  s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const cleanCell = (c: string) => c.trim().replace(/^['"`]+|['"`]+$/g, '').trim();

// الصف الأول لو كان عنوان الأعمدة (UPC / اسم المنتج) بيتتجاهل
const isHeaderLine = (upcCell: string, nameCell: string) =>
  /^upc\b/i.test(upcCell) || (/^(اسم المنتج|product name|name)/i.test(nameCell) && !/\d{6,}/.test(upcCell));

export const parseProductPaste = (text: string): PastedProductRow[] => {
  const rows: PastedProductRow[] = [];
  text.split(/\r?\n/).forEach((ln, i) => {
    if (!ln.trim()) return;
    let upc: string;
    let name: string;
    if (ln.includes('\t')) {
      const cells = ln.split('\t');
      upc = cleanCell(cells[0] || '');
      name = cells.slice(1).map(cleanCell).filter(Boolean).join(' ');
    } else {
      const m = ln.trim().match(/^(\S+)\s+(.+)$/);
      upc = m ? cleanCell(m[1]) : cleanCell(ln);
      name = m ? cleanCell(m[2]) : '';
    }
    if (!upc && !name) return;
    if (isHeaderLine(upc, name)) return;
    rows.push({ line: i + 1, upc: toWesternDigits(upc).replace(/\s/g, ''), name: name.replace(/\s+/g, ' '), raw: ln.trim() });
  });
  return rows;
};

const validateRow = (r: PastedProductRow): string | null => {
  if (!r.upc) return 'الـ UPC فاضي';
  if (!r.name) return 'اسم المنتج فاضي';
  if (/^\d(\.\d+)?e\+?\d+$/i.test(r.upc)) return 'الـ UPC اتحوّل لصيغة علمية في الإكسيل (خلّي العمود Text)';
  if (!/^\d{6,14}$/.test(r.upc)) return 'الـ UPC لازم يكون أرقام بس (من 6 لـ 14 رقم)';
  return null;
};

// تصنيف الصفوف: جاهز / خطأ / UPC موجود / اسم موجود / مكرر داخل اللصق
export const classifyProductRows = (
  rows: PastedProductRow[],
  products: Product[],
): (PastedProductRow & { state: ProductPasteState })[] => {
  const seenUpc = new Map<string, number>();
  const seenName = new Map<string, number>();
  return rows.map(r => {
    const err = validateRow(r);
    if (err) return { ...r, state: { kind: 'error', reason: err } as ProductPasteState };
    const upcKey = normalizeProductCode(r.upc);
    const nameKey = normalizeForCompare(r.name);
    const byUpc = products.find(p => productMatchesCode(p, r.upc));
    if (byUpc) return { ...r, state: { kind: 'dupUpc', product: byUpc } as ProductPasteState };
    if (seenUpc.has(upcKey)) return { ...r, state: { kind: 'dupInPaste', firstLine: seenUpc.get(upcKey) as number, by: 'upc' } as ProductPasteState };
    const byName = products.find(p => normalizeForCompare(p.name) === nameKey);
    if (byName) return { ...r, state: { kind: 'dupName', product: byName } as ProductPasteState };
    if (seenName.has(nameKey)) return { ...r, state: { kind: 'dupInPaste', firstLine: seenName.get(nameKey) as number, by: 'name' } as ProductPasteState };
    seenUpc.set(upcKey, r.line);
    seenName.set(nameKey, r.line);
    return { ...r, state: { kind: 'ok' } as ProductPasteState };
  });
};
