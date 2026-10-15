import { Product } from '../types';
import { normalizeForCompare, productMatchesCode } from './helpers';

// لصق فاتورة من إكسيل: UPC | اسم المنتج (اختياري) | السيريال | IMEI1 | IMEI2 (اختياريين) | السعر
export interface PastedRow {
  line: number;
  upc: string;
  name: string;
  serial: string;
  imei1: string;
  imei2: string;
  price: number;
  raw: string;
}

export interface PasteGroup {
  product: Product;
  price: number;
  serials: { serial: string; imei1: string; imei2: string }[];
  quantity: number;
}

const toWesternDigits = (s: string) =>
  s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export const parsePrice = (raw: string): number | null => {
  const t = toWesternDigits(raw).replace(/[,\s٬]/g, '').replace(/٫/g, '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t)); // مافيش قروش في النظام
  return Number.isFinite(n) ? n : null;
};

const cleanCell = (c: string) => c.trim().replace(/^['"`]+|['"`]+$/g, '').trim();

export const parseInvoicePaste = (text: string): { rows: PastedRow[]; unreadable: { line: number; raw: string }[] } => {
  const rows: PastedRow[] = [];
  const unreadable: { line: number; raw: string }[] = [];
  text.split(/\r?\n/).forEach((ln, i) => {
    if (!ln.trim()) return;
    const parts = ln.includes('\t') ? ln.split('\t') : ln.trim().split(/\s{2,}/);
    const cells = parts.map(cleanCell).filter(Boolean);
    const price = cells.length >= 3 ? parsePrice(cells[cells.length - 1]) : null;
    if (price === null) { unreadable.push({ line: i + 1, raw: ln.trim() }); return; }
    const upc = cells[0];
    const mid = cells.slice(1, -1);
    let name = '';
    // الاسم عادةً فيه مسافات أو | ؛ السيريال كلمة واحدة
    if (mid.length >= 2 && /[\s|]/.test(mid[0])) name = mid.shift() as string;
    if (mid.length === 0) { unreadable.push({ line: i + 1, raw: ln.trim() }); return; }
    rows.push({ line: i + 1, upc, name, serial: mid[0], imei1: mid[1] || '', imei2: mid[2] || '', price, raw: ln.trim() });
  });
  return { rows, unreadable };
};

export type PasteRowState =
  | { kind: 'ok'; product: Product }
  | { kind: 'noUpc' }
  | { kind: 'dupInPaste' }
  | { kind: 'blocked'; product: Product; reason: string };

// مطابقة كل صف بالمنتج من الـ UPC (المنتج مش موجود = الصف ما يتعملش)
export const classifyRows = (
  rows: PastedRow[],
  products: Product[],
  checkSerial: (serial: string, product: Product) => string | null,
): (PastedRow & { state: PasteRowState })[] => {
  const seen = new Set<string>();
  return rows.map(r => {
    const product = products.find(p => productMatchesCode(p, r.upc));
    if (!product) return { ...r, state: { kind: 'noUpc' } as PasteRowState };
    if (product.productType === 'serial') {
      const key = normalizeForCompare(r.serial);
      if (seen.has(key)) return { ...r, state: { kind: 'dupInPaste' } as PasteRowState };
      seen.add(key);
      const reason = checkSerial(r.serial, product);
      if (reason) return { ...r, state: { kind: 'blocked', product, reason } as PasteRowState };
    }
    return { ...r, state: { kind: 'ok', product } as PasteRowState };
  });
};

// تجميع الصفوف الجاهزة: نفس المنتج + نفس السعر = بند واحد بكمية = عدد السيريالات
export const groupRows = (rows: (PastedRow & { state: PasteRowState })[]): PasteGroup[] => {
  const map = new Map<string, PasteGroup>();
  rows.forEach(r => {
    if (r.state.kind !== 'ok') return;
    const p = r.state.product;
    const key = `${p.id}::${r.price}`;
    let g = map.get(key);
    if (!g) { g = { product: p, price: r.price, serials: [], quantity: 0 }; map.set(key, g); }
    if (p.productType === 'serial') g.serials.push({ serial: r.serial, imei1: r.imei1, imei2: r.imei2 });
    g.quantity += 1;
  });
  return [...map.values()];
};
