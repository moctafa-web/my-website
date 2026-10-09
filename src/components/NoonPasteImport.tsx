import React, { useMemo, useState } from 'react';
import { X, ClipboardPaste } from 'lucide-react';
import { NoonOrder, NoonOrderItem, Product, SerialItem } from '../types';
import { formatCurrency, generateId, getProductUPCs, getTodayStr, productHasUPC } from '../utils/helpers';
import { parseImportDate } from '../utils/importDate';
import { mapNoonStatus } from '../utils/noonSync';

interface Props {
  noonOrders: NoonOrder[];
  products: Product[];
  serials: SerialItem[];
  onAdd: (orders: NoonOrder[]) => { addedCount: number; mergedCount: number } | void;
  onClose: () => void;
}

interface Parsed {
  line: number;
  orderNumber: string;
  shipment: string;
  name: string;
  code: string;
  price?: number;
  date?: string;
  status: NoonOrder['status'];
  rawStatus: string;
  product?: Product;
  serial?: SerialItem;
  state: 'ok' | 'exists' | 'nomatch' | 'dupInPaste' | 'skipStatus';
}

const HEADER_RE = /order|awb|shipment|date|status|رقم|اوردر|أوردر|شحنة|شحنه|تاريخ|حالة|حاله/i;
const DATE_RE = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$|^\d{4}-\d{2}-\d{2}/;
const SHIP_RE = /^P[A-Z]\d{6,}[A-Z]?$/i;       // PH38570886273E
const ORDER_RE = /^N[A-Z]{3,}\d{6,}$/i;         // NEGIA0007449431
const STATUS_RE = /^(shipped|delivered|cancel+ed|returned|pending|in[_ ]transit|out[_ ]for[_ ]delivery|dispatched|created)$/i;

// تقسيم صف الشيت: بيتعرف على كل خانة من شكلها (تاريخ / رقم أوردر / رقم شحنة / حالة / اسم / سيريال)
// ولو الخانات مش بالشكل المعروف بيرجع للترتيب: أوردر | شحنة | اسم | سيريال أو UPC | سعر
export const splitRow = (cells: string[]) => {
  const out = { date: '', order: '', shipment: '', status: '', name: '', code: '', price: '' };
  const rest: string[] = [];
  cells.forEach(c => {
    if (!c) return;
    if (!out.date && DATE_RE.test(c)) out.date = c;
    else if (!out.shipment && SHIP_RE.test(c)) out.shipment = c;
    else if (!out.order && ORDER_RE.test(c)) out.order = c;
    else if (!out.status && STATUS_RE.test(c)) out.status = c;
    else rest.push(c);
  });
  if (!out.order && !out.shipment && !out.date) {
    // ترتيب افتراضي
    const [o = '', sh = '', nm = '', cd = '', pr = ''] = cells;
    return { date: '', order: o, shipment: sh, status: '', name: nm, code: cd, price: pr };
  }
  // الاسم = أطول خانة، السيريال/UPC = آخر خانة غير فاضية من الباقي، السعر = رقم قصير
  const nameIdx = rest.reduce((bi, c, i) => (c.length > (rest[bi]?.length ?? -1) ? i : bi), -1);
  if (nameIdx >= 0 && (rest[nameIdx].length > 20 || rest.length > 1)) { out.name = rest[nameIdx]; rest.splice(nameIdx, 1); }
  const priceIdx = rest.findIndex(c => /^[\d,]+(\.\d+)?$/.test(c) && c.replace(/[^\d]/g, '').length <= 7);
  if (priceIdx >= 0 && rest.length > 1) { out.price = rest[priceIdx]; rest.splice(priceIdx, 1); }
  out.code = rest[rest.length - 1] || '';
  return out;
};

export default function NoonPasteImport({ noonOrders, products, serials, onAdd, onClose }: Props) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [result, setResult] = useState('');

  const existing = useMemo(() => new Set(noonOrders.map(o => o.orderNumber.trim().toLowerCase())), [noonOrders]);

  const parsed = useMemo<Parsed[]>(() => {
    const out: Parsed[] = [];
    const seenCodes = new Set<string>();
    text.split(/\r?\n/).forEach((ln, i) => {
      if (!ln.trim()) return;
      const c = ln.split('\t').map(x => x.trim());
      if (i === 0 && c.some(x => HEADER_RE.test(x)) && !c.some(x => DATE_RE.test(x) || SHIP_RE.test(x) || ORDER_RE.test(x))) return;
      const r = splitRow(c);
      const orderNumber = r.order || r.shipment;
      const shipment = r.shipment;
      const { name, code } = r;
      if (!orderNumber) return;
      const price = r.price ? parseFloat(r.price.replace(/[^\d.]/g, '')) : undefined;
      const mapped = r.status ? mapNoonStatus(r.status) : 'pending';
      const status = (mapped ?? 'pending') as NoonOrder['status'];
      const lc = code.toLowerCase();
      const serial = code ? serials.find(s => s.serial.trim().toLowerCase() === lc && s.status === 'available') : undefined;
      const product = serial ? products.find(p => p.id === serial.productId) : code ? products.find(p => productHasUPC(p, code)) : undefined;
      let state: Parsed['state'] = 'ok';
      if (existing.has(orderNumber.toLowerCase())) state = 'exists';
      else if (status === 'canceled' || status === 'returned') state = 'skipStatus';
      else if (!product) state = 'nomatch';
      else if (serial) {
        if (seenCodes.has(lc)) state = 'dupInPaste';
        seenCodes.add(lc);
      }
      out.push({ line: i + 1, orderNumber, shipment, name, code, price: price && price > 0 ? price : undefined, date: r.date, status, rawStatus: r.status, product, serial, state });
    });
    return out;
  }, [text, serials, products, existing]);

  const okRows = parsed.filter(p => p.state === 'ok');
  const count = (s: Parsed['state']) => parsed.filter(p => p.state === s).length;

  const submit = () => {
    const grouped = new Map<string, Parsed[]>();
    okRows.forEach(r => grouped.set(r.orderNumber, [...(grouped.get(r.orderNumber) || []), r]));
    const orders: NoonOrder[] = [...grouped.entries()].map(([orderNumber, rows]) => {
      const items: NoonOrderItem[] = rows.map(r => ({
        productId: r.product!.id,
        productName: r.product!.name,
        upc: r.serial ? (r.product!.upc || '') : r.code,
        serial: r.serial?.serial || '',
        imei1: r.serial?.imei1 || '',
        imei2: r.serial?.imei2 || '',
        price: r.price ?? r.product!.salePrice ?? 0,
        costPrice: r.product!.costPrice ?? 0,
      }));
      return {
        id: generateId(), orderNumber, shipmentNumber: rows[0].shipment, platform: 'noon',
        customerName: '', date: parseImportDate(rows[0].date, parseImportDate(date, getTodayStr())), items, status: rows[0].status, notes: '',
        createdAt: new Date().toISOString(),
      } as NoonOrder;
    });
    const res = orders.length ? onAdd(orders) : undefined;
    setResult(`✅ تمت إضافة ${res?.addedCount ?? orders.length} أوردر${res?.mergedCount ? ` (+${res.mergedCount} مدموج)` : ''}`);
    setText('');
  };

  const tag = (s: Parsed['state']) =>
    s === 'ok' ? <span className="text-green-300">جاهز</span> :
    s === 'exists' ? <span className="text-gray-400">موجود قبل كده (هيتخطى)</span> :
    s === 'skipStatus' ? <span className="text-gray-400">ملغي/مرتجع (هيتخطى)</span> :
    s === 'dupInPaste' ? <span className="text-orange-300">سيريال مكرر في اللصق</span> :
    <span className="text-red-400">السيريال/UPC مش في النظام</span>;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface border border-border rounded-2xl p-5 my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">📋 لصق أوردرات من Google Sheet</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          في الشيت حدد الصفوف (من غير العناوين لو حبيت) وانسخها Ctrl+C، وبعدين الصقها هنا Ctrl+V. الأعمدة بالترتيب:
          <b className="text-gray-300"> رقم الأوردر | رقم الشحنة | اسم المنتج | السيريال أو UPC | (السعر اختياري)</b>.
          النظام بيتعرف على الأعمدة من شكلها، فتقدر تلصق الشيت زي ما هو (تاريخ، اسم، رقم أوردر NEGIA…، رقم شحنة PH…E، حالة، سيريال). اسم المنتج للعرض فقط، والمطابقة بالسيريال أو الـ UPC. الحالة (Shipped/Delivered…) بتتسجل مع الأوردر. لو السعر فاضي بيتاخد سعر البيع من المنتج.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-400">تاريخ احتياطي (لو الصف مفيهوش تاريخ)</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-dark text-sm" />
        </div>
        <textarea value={text} onChange={e => { setText(e.target.value); setResult(''); }} rows={6} dir="ltr"
          placeholder="الصق هنا..." className="input-dark w-full mt-3 font-mono text-xs" />
        {result && <div className="mt-3 text-sm text-green-300">{result}</div>}

        {parsed.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-gray-400">
              {parsed.length} صف: <b className="text-green-300">{okRows.length} جاهز</b>
              {count('exists') > 0 && <> — {count('exists')} موجود قبل كده</>}
              {count('nomatch') > 0 && <span className="text-red-400"> — {count('nomatch')} غير مطابق</span>}
              {count('dupInPaste') > 0 && <span className="text-orange-300"> — {count('dupInPaste')} مكرر</span>}
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="sticky top-0 bg-elevated"><tr className="text-gray-400 border-b border-border">
                  <th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الأوردر</th><th className="p-2 text-right">الشحنة</th><th className="p-2 text-right">المنتج (في النظام)</th>
                  <th className="p-2 text-right">السيريال / UPC</th><th className="p-2 text-center">السعر</th><th className="p-2 text-right">الحالة</th>
                </tr></thead>
                <tbody>
                  {parsed.map(p => (
                    <tr key={p.line} className="border-b border-border/40">
                      <td className="p-2">{p.date ? parseImportDate(p.date, '') : date}</td>
                      <td className="p-2 font-mono" dir="ltr">{p.orderNumber}</td>
                      <td className="p-2 font-mono" dir="ltr">{p.shipment}</td>
                      <td className="p-2">{p.product?.name || <span className="text-gray-500">{p.name}</span>}</td>
                      <td className="p-2 font-mono" dir="ltr">{p.code || '—'}</td>
                      <td className="p-2 text-center">{p.product ? formatCurrency(p.price ?? p.product.salePrice ?? 0) : '—'}</td>
                      <td className="p-2">{tag(p.state)}{p.rawStatus ? <span className="text-gray-500"> · {p.rawStatus}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={submit} disabled={okRows.length === 0} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <ClipboardPaste size={15} /> إضافة {okRows.length} صف جاهز
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
