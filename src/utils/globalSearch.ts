import { AppState } from '../types';
import { formatCurrency, getProductUPCs, statusLabel } from './helpers';
import { calculatePartyBalance } from '../store/domains/accounting.store';

export type ResultType = 'product' | 'party' | 'saleInvoice' | 'purchaseInvoice' | 'serial' | 'noonOrder';

export interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  score: number;
}

// توحيد النص للمقارنة: حروف صغيرة، أرقام غربية، توحيد الألف والياء والتاء المربوطة، شيل التشكيل
export const normSearch = (s: string): string =>
  String(s ?? '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .trim();

const compact = (s: string) => normSearch(s).replace(/[\s\-_]/g, '');

const PER_TYPE = 8;
const TYPE_ORDER: ResultType[] = ['serial', 'noonOrder', 'saleInvoice', 'purchaseInvoice', 'party', 'product'];

// بحث شامل: كل كلمات البحث لازم تكون موجودة (بأي ترتيب)، والأكواد (سيريال/IMEI/UPC) بتتطابق
// حتى لو فيها مسافات أو شرطات. النتائج مرتبة بالأقرب أولًا، وكل نوع له حد أقصى عشان نوع واحد
// ما يزاحمش الباقي.
export function searchAll(state: AppState, rawQuery: string): SearchResult[] {
  const q = normSearch(rawQuery);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const code = compact(rawQuery);
  const useCode = code.length >= 3;

  const textScore = (value: string | undefined): number => {
    if (!value) return 0;
    const v = normSearch(value);
    if (v === q) return 90;
    if (v.startsWith(q)) return 60;
    if (v.includes(q)) return 40;
    return tokens.every(t => v.includes(t)) ? 25 : 0;
  };
  const codeScore = (value: string | undefined): number => {
    if (!useCode || !value) return 0;
    const v = compact(value);
    if (!v) return 0;
    if (v === code) return 100;
    if (v.startsWith(code)) return 70;
    return v.includes(code) ? 45 : 0;
  };
  const best = (...n: number[]) => Math.max(0, ...n);

  const groups: Record<ResultType, SearchResult[]> = { serial: [], noonOrder: [], saleInvoice: [], purchaseInvoice: [], party: [], product: [] };

  // منتجات
  state.products.forEach(p => {
    const score = best(textScore(p.name), codeScore(p.sku), ...getProductUPCs(p).map(codeScore), codeScore(p.barcode));
    if (!score) return;
    const stock = p.productType === 'serial'
      ? state.serials.filter(s => s.productId === p.id && s.status === 'available').length
      : p.stock;
    groups.product.push({
      type: 'product', id: p.id, title: p.name, score,
      subtitle: `${p.sku} • ${formatCurrency(p.salePrice)} • مخزون: ${stock}`,
    });
  });

  // سيريالات: السيريال بيتكرر كسجلات تاريخية لو اتشرى تاني بعد البيع؛ بنعرضه مرة واحدة بحالته الحالية
  const serialGroups = new Map<string, { items: AppState['serials']; score: number }>();
  state.serials.forEach(s => {
    const score = best(codeScore(s.serial), codeScore(s.imei1), codeScore(s.imei2));
    if (!score) return;
    const key = s.serial.trim().toLowerCase();
    const g = serialGroups.get(key) || { items: [], score: 0 };
    g.items.push(s);
    g.score = Math.max(g.score, score);
    serialGroups.set(key, g);
  });
  serialGroups.forEach(({ items, score }) => {
    const current = items.find(s => s.status === 'available') || items.find(s => s.status === 'transferred') ||
      items.find(s => s.status === 'missing') || [...items].reverse()[0];
    if (!current) return;
    const purchaseInv = state.purchaseInvoices.find(i => i.id === current.purchaseInvoiceId);
    const saleInv = state.saleInvoices.find(i => i.id === current.saleInvoiceId);
    const purchaseCount = new Set(items.map(s => s.purchaseInvoiceId).filter(Boolean)).size;
    const saleCount = new Set(items.map(s => s.saleInvoiceId).filter(Boolean)).size;
    const statusLabel = current.status === 'available' ? '🟢 متاح' : current.status === 'sold' ? '🔵 مباع'
      : current.status === 'transferred' ? '🟣 محول (نون/أمازون)' : current.status === 'missing' ? '⚠️ مفقود' : '↩️ مرتجع';
    const parts = [statusLabel];
    if (purchaseInv) parts.push(`شراء ${purchaseInv.invoiceNumber}`);
    if (saleInv) parts.push(`بيع ${saleInv.invoiceNumber}`);
    else parts.push(`${purchaseCount} شراء • ${saleCount} بيع`);
    groups.serial.push({
      type: 'serial', id: current.id, score,
      title: `${current.serial} — ${current.productName}`,
      subtitle: parts.join(' • '),
    });
  });

  // العملاء والموردين: حساب واحد لكل طرف
  (state.parties || []).forEach(p => {
    const nameScore = textScore(p.name);
    const score = best(nameScore ? nameScore + 15 : 0, p.phone && compact(p.phone).includes(code) && useCode ? 60 : 0); // الحساب نفسه يسبق فواتيره
    if (!score) return;
    const bal = calculatePartyBalance(state, p);
    const role = p.roles.customer && p.roles.supplier ? 'عميل ومورد' : p.roles.supplier ? 'مورد / تاجر' : 'عميل';
    groups.party.push({
      type: 'party', id: p.id, title: p.name, score,
      subtitle: `${role} • ${p.phone || 'بدون هاتف'} • ${bal > 0 ? 'لنا' : bal < 0 ? 'علينا' : 'الرصيد'}: ${formatCurrency(Math.abs(bal))}`,
    });
  });

  // الفواتير: برقم الفاتورة أو اسم الطرف أو اسم/كود صنف أو سيريال/IMEI جواها
  const scanInvoice = (
    type: 'saleInvoice' | 'purchaseInvoice',
    inv: { id: string; invoiceNumber: string; total: number; date: string; items: any[] },
    partyName: string,
  ) => {
    let score = best(textScore(inv.invoiceNumber), codeScore(inv.invoiceNumber), textScore(partyName));
    let matchedSerial = '';
    inv.items.forEach(item => {
      score = best(score, textScore(item.productName) - 10, codeScore(item.sku) - 10);
      (item.serials || []).forEach((s: any) => {
        const sc = best(codeScore(s.serial), codeScore(s.imei1), codeScore(s.imei2));
        if (sc > 0) { matchedSerial = matchedSerial || s.serial; score = Math.max(score, sc - 5); }
      });
    });
    if (score <= 0) return;
    groups[type].push({
      type, id: inv.id, score,
      title: `${type === 'saleInvoice' ? 'فاتورة بيع' : 'فاتورة شراء'} ${inv.invoiceNumber}`,
      subtitle: `${partyName} • ${formatCurrency(inv.total)} • ${inv.date}${matchedSerial ? ` • فيها السيريال ${matchedSerial}` : ''}`,
    });
  };
  state.saleInvoices.forEach(inv => scanInvoice('saleInvoice', inv, inv.customerName));
  state.purchaseInvoices.forEach(inv => scanInvoice('purchaseInvoice', inv, inv.supplierName));

  // أوردرات نون/أمازون: برقم الأوردر أو الشحنة أو اسم العميل أو صنف أو سيريال/IMEI جواها
  (state.noonOrders || []).forEach(o => {
    let score = best(textScore(o.orderNumber), codeScore(o.orderNumber), codeScore(o.shipmentNumber), textScore(o.customerName));
    let matchedSerial = '';
    o.items.forEach(item => {
      score = best(score, textScore(item.productName) - 10);
      const sc = best(codeScore(item.serial), codeScore(item.imei1), codeScore(item.imei2));
      if (sc > 0) { matchedSerial = matchedSerial || item.serial || ''; score = Math.max(score, sc - 5); }
    });
    if (score <= 0) return;
    const platform = o.platform === 'noon' ? 'Noon' : o.platform === 'amazon' ? 'Amazon' : 'منصة';
    const total = o.items.reduce((sum, i) => sum + (i.price || 0), 0);
    groups.noonOrder.push({
      type: 'noonOrder', id: o.id, score,
      title: `أوردر ${platform} ${o.orderNumber}`,
      subtitle: `${statusLabel(o.status)} • ${formatCurrency(total)} • ${o.date}${o.customerName ? ` • ${o.customerName}` : ''}${matchedSerial ? ` • فيه السيريال ${matchedSerial}` : ''}`,
    });
  });

  // ترتيب: النوع اللي عنده أعلى تطابق يطلع الأول، وجوه كل نوع الأعلى تطابقًا أولًا
  const ordered = TYPE_ORDER
    .map(t => ({ t, list: groups[t].sort((a, b) => b.score - a.score).slice(0, PER_TYPE) }))
    .filter(g => g.list.length)
    .sort((a, b) => b.list[0].score - a.list[0].score || TYPE_ORDER.indexOf(a.t) - TYPE_ORDER.indexOf(b.t));
  return ordered.flatMap(g => g.list);
}
