import React, { useMemo, useState } from 'react';
import { X, ClipboardPaste } from 'lucide-react';
import { NoonOrder, NoonOrderItem, Product, SerialItem } from '../types';
import { formatCurrency, generateId, getTodayStr, productHasUPC, statusColor, statusLabel } from '../utils/helpers';
import { parseImportDate } from '../utils/importDate';
import { buildSyncPreview, mapNoonStatus, SheetRow, SyncItem } from '../utils/noonSync';

interface Props {
  noonOrders: NoonOrder[];
  products: Product[];
  serials: SerialItem[];
  onAdd: (orders: NoonOrder[]) => { addedCount: number; mergedCount: number } | void;
  /** تحديث حالة أوردر موجود (نفس منطق مزامنة الشيت) */
  onUpdateOrder?: (o: NoonOrder) => void;
  onReturnOrders?: (ids: string[], opts: { date?: string; restock: boolean }) => void;
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
const isStatusCell = (c: string) => c.length <= 40 && mapNoonStatus(c) !== null;

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
    else if (!out.status && isStatusCell(c)) out.status = c;
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

export default function NoonPasteImport({ noonOrders, products, serials, onAdd, onUpdateOrder, onReturnOrders, onClose }: Props) {
  const [text, setText] = useState('');
  const [override, setOverride] = useState<Record<string, boolean>>({});
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

  // تحديث حالة الأوردرات الموجودة: الصفوف اللي أوردرها موجود وفيها حالة في اللصق
  const statusPreview = useMemo(() => {
    const rows: SheetRow[] = parsed
      .filter(p => p.state === 'exists' && p.rawStatus)
      .map(p => ({ awb: p.shipment || p.orderNumber, altKey: p.orderNumber, status: p.rawStatus.toLowerCase() }));
    return rows.length ? buildSyncPreview(rows, noonOrders) : null;
  }, [parsed, noonOrders]);
  const changes = useMemo(() => statusPreview?.changes ?? [], [statusPreview]);
  const isChecked = (i: SyncItem) => override[i.order.id] ?? i.defaultChecked;
  const selectedChanges = changes.filter(isChecked);
  const changeByKey = useMemo(() => {
    const m = new Map<string, SyncItem>();
    changes.forEach(i => { [i.order.orderNumber, i.order.shipmentNumber].forEach(k => { if (k) m.set(k.trim().toLowerCase(), i); }); });
    return m;
  }, [changes]);

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
    let upd = 0;
    const returns: string[] = [];
    selectedChanges.forEach(i => {
      if (!i.to) return;
      if (i.to === 'returned' && onReturnOrders) returns.push(i.order.id);
      else if (onUpdateOrder) onUpdateOrder({ ...i.order, status: i.to });
      else return;
      upd++;
    });
    if (returns.length) onReturnOrders?.(returns, { restock: true });
    const parts: string[] = [];
    if (orders.length) parts.push(`إضافة ${res?.addedCount ?? orders.length} أوردر${res?.mergedCount ? ` (+${res.mergedCount} مدموج)` : ''}`);
    if (upd) parts.push(`تحديث حالة ${upd} أوردر`);
    setResult(`✅ تم: ${parts.join(' + ')}`);
    setOverride({});
    setText('');
  };

  const tag = (s: Parsed['state'], p?: Parsed) =>
    p && s === 'exists' && changeByKey.has((p.orderNumber).toLowerCase()) ? <span className="text-blue-300">موجود — هتتحدث حالته ↓</span> :
    s === 'ok' ? <span className="text-green-300">جاهز</span> :
    s === 'exists' ? <span className="text-gray-400">موجود قبل كده</span> :
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
          النظام بيتعرف على الأعمدة من شكلها، فتقدر تلصق الشيت زي ما هو (تاريخ، اسم، رقم أوردر NEGIA…، رقم شحنة PH…E، حالة، سيريال). اسم المنتج للعرض فقط، والمطابقة بالسيريال أو الـ UPC. الحالة (Shipped/Delivered…) بتتسجل مع الأوردر، ولو الأوردر موجود قبل كده وحالته في اللصق اتغيرت (مثلاً Shipped ← Delivered) هتظهر لك تحت وتتحدث. لو السعر فاضي بيتاخد سعر البيع من المنتج.
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
              {count('exists') > 0 && <> — {count('exists')} موجود قبل كده{changes.length > 0 && <b className="text-blue-300"> ({changes.length} حالتهم اتغيرت)</b>}</>}
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
                      <td className="p-2">{tag(p.state, p)}{p.rawStatus ? <span className="text-gray-500"> · {p.rawStatus}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {changes.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className="font-bold text-sm text-white">🔄 تحديث حالة أوردرات موجودة</div>
                  <button onClick={() => setOverride(Object.fromEntries(changes.map(i => [i.order.id, true])))} className="text-xs text-violet-300 hover:underline">تحديد الكل</button>
                  <button onClick={() => setOverride({})} className="text-xs text-gray-400 hover:underline">الافتراضي</button>
                  <button onClick={() => setOverride(Object.fromEntries(changes.map(i => [i.order.id, false])))} className="text-xs text-gray-400 hover:underline">إلغاء الكل</button>
                </div>
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead className="sticky top-0 bg-elevated"><tr className="text-gray-400 border-b border-border">
                      <th className="p-2 w-8"></th><th className="p-2 text-right">الأوردر</th><th className="p-2 text-right">من</th><th className="p-2 text-right">إلى</th><th className="p-2 text-right">ملاحظة</th>
                    </tr></thead>
                    <tbody>
                      {changes.map(i => (
                        <tr key={i.order.id} className="border-b border-border/40">
                          <td className="p-2 text-center"><input type="checkbox" checked={isChecked(i)} onChange={e => setOverride(o => ({ ...o, [i.order.id]: e.target.checked }))} /></td>
                          <td className="p-2 font-mono" dir="ltr">{i.order.orderNumber}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded-lg border ${statusColor(i.from)}`}>{statusLabel(i.from)}</span></td>
                          <td className="p-2">{i.to && <span className={`px-2 py-0.5 rounded-lg border ${statusColor(i.to)}`}>{statusLabel(i.to)}</span>}</td>
                          <td className={`p-2 ${i.kind === 'conflict' ? 'text-orange-300' : i.kind === 'cancel' ? 'text-red-300' : 'text-gray-400'}`}>{i.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {statusPreview && (statusPreview.protectedCount > 0 || statusPreview.unknownStatus.length > 0) && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    {statusPreview.protectedCount > 0 && <>{statusPreview.protectedCount} أوردر مدفوع/محوّل ماتلمسوش · </>}
                    {statusPreview.unknownStatus.length > 0 && <>{statusPreview.unknownStatus.length} بحالة مش معروفة</>}
                  </div>
                )}
              </div>
            )}
            <button onClick={submit} disabled={okRows.length === 0 && selectedChanges.length === 0} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <ClipboardPaste size={15} /> {[okRows.length ? `إضافة ${okRows.length} صف جاهز` : '', selectedChanges.length ? `تحديث حالة ${selectedChanges.length}` : ''].filter(Boolean).join(' + ') || 'مفيش حاجة للتنفيذ'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
