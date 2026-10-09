import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, RefreshCw, Copy } from 'lucide-react';
import { NoonOrder } from '../types';
import { statusColor, statusLabel } from '../utils/helpers';
import { buildSyncPreview, parseNoonSheet, SheetRow, SyncItem } from '../utils/noonSync';

interface Props {
  orders: NoonOrder[];
  onUpdateOrder: (o: NoonOrder) => void;
  onClose: () => void;
}

export default function NoonSyncModal({ orders, onUpdateOrder, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<number | null>(null);
  const [showNotFound, setShowNotFound] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const preview = useMemo(() => (rows ? buildSyncPreview(rows, orders) : null), [rows, orders]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setDone(null); setFileName(file.name);
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const res = parseNoonSheet(ev.target?.result as string | ArrayBuffer, isCsv);
        if (res.error) { setError(res.error); setRows(null); return; }
        setRows(res.rows);
        const p = buildSyncPreview(res.rows, orders);
        setChecked(Object.fromEntries(p.changes.map(i => [i.order.id, i.defaultChecked])));
      } catch {
        setError('تعذر قراءة الملف. اتأكد إنه CSV أو Excel نازل من نون.');
        setRows(null);
      }
    };
    if (isCsv) reader.readAsText(file, 'utf-8'); else reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const selectedCount = preview ? preview.changes.filter(i => checked[i.order.id]).length : 0;

  const apply = () => {
    if (!preview) return;
    let n = 0;
    preview.changes.forEach(i => {
      if (checked[i.order.id] && i.to) { onUpdateOrder({ ...i.order, status: i.to }); n++; }
    });
    setDone(n);
    setRows(null);
  };

  const copyList = (list: string[]) => { try { navigator.clipboard.writeText(list.join('\n')); } catch { /* ignore */ } };

  const badge = (s: string) => <span className={`text-xs px-2 py-0.5 rounded-lg border ${statusColor(s)}`}>{statusLabel(s)}</span>;

  const kindTag = (i: SyncItem) =>
    i.kind === 'cancel' ? 'text-red-300' : i.kind === 'conflict' ? 'text-orange-300' : 'text-green-300';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface border border-border rounded-2xl p-5 my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">🔄 مزامنة حالة الأوردرات من شيت نون</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mt-1">ارفع شيت الشحنات (Shipment Listing) زي ما نزل من نون. هيتطابق برقم الشحنة، وهتشوف التغييرات قبل ما تتطبق.</p>

        <label className="mt-4 btn-secondary inline-flex items-center gap-2 cursor-pointer text-sm">
          <Upload size={14} /> {fileName ? 'اختيار ملف تاني' : 'اختيار ملف نون (CSV / Excel)'}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
        </label>
        {fileName && <span className="text-xs text-gray-400 mr-3">{fileName}</span>}
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        {done !== null && (
          <div className="mt-4 bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-green-300 text-sm">
            ✅ تم تحديث {done} أوردر. ارفع شيت تاني لو عايز تزامن تاني.
          </div>
        )}

        {preview && rows && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { l: 'صفوف في الشيت', v: rows.length, c: 'text-blue-300' },
                { l: 'هتتغير', v: preview.changes.length, c: 'text-green-300' },
                { l: 'مفيش تغيير', v: preview.unchanged, c: 'text-gray-300' },
                { l: 'محمي (مدفوع/محوّل)', v: preview.protectedCount, c: 'text-violet-300' },
                { l: 'مش موجود في النظام', v: preview.notFound.length, c: 'text-orange-300' },
              ].map(x => (
                <div key={x.l} className="bg-muted-bg rounded-xl p-3 text-center">
                  <div className={`text-2xl font-black ${x.c}`}>{x.v}</div>
                  <div className="text-xs text-gray-500 mt-1">{x.l}</div>
                </div>
              ))}
            </div>

            {preview.lost.length > 0 && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-sm text-red-300">
                ⚠️ {preview.lost.length} شحنة نون مسجلة عليها "مفقودة": {preview.lost.map(r => r.awb).join('، ')}
              </div>
            )}
            {preview.unknownStatus.length > 0 && (
              <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3 text-sm text-orange-300">
                ⚠️ {preview.unknownStatus.length} شحنة بحالة مش معروفة للنظام ومتغيرتش: {[...new Set(preview.unknownStatus.map(i => i.row.status || 'فارغة'))].join('، ')}
              </div>
            )}

            {preview.changes.length > 0 ? (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className="font-bold text-sm text-white">التغييرات المقترحة</div>
                  <button onClick={() => setChecked(Object.fromEntries(preview.changes.map(i => [i.order.id, true])))} className="text-xs text-violet-300 hover:underline">تحديد الكل</button>
                  <button onClick={() => setChecked(Object.fromEntries(preview.changes.map(i => [i.order.id, i.defaultChecked])))} className="text-xs text-gray-400 hover:underline">الافتراضي</button>
                  <button onClick={() => setChecked({})} className="text-xs text-gray-400 hover:underline">إلغاء الكل</button>
                </div>
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="sticky top-0 bg-elevated">
                      <tr className="border-b border-border text-gray-400">
                        <th className="p-2 w-10"></th>
                        <th className="p-2 text-right">الشحنة</th>
                        <th className="p-2 text-right">الأوردر / العميل</th>
                        <th className="p-2 text-right">من</th>
                        <th className="p-2 text-right">إلى</th>
                        <th className="p-2 text-right">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.changes.map(i => (
                        <tr key={i.order.id} className="border-b border-border/40">
                          <td className="p-2 text-center"><input type="checkbox" checked={!!checked[i.order.id]} onChange={e => setChecked(c => ({ ...c, [i.order.id]: e.target.checked }))} /></td>
                          <td className="p-2 font-mono text-xs" dir="ltr">{i.row.awb}</td>
                          <td className="p-2">{i.order.orderNumber}{i.order.customerName ? <div className="text-[11px] text-gray-500">{i.order.customerName}</div> : null}</td>
                          <td className="p-2">{badge(i.from)}</td>
                          <td className="p-2">{i.to && badge(i.to)}</td>
                          <td className={`p-2 text-xs ${kindTag(i)}`}>{i.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 bg-muted-bg rounded-xl p-4">مفيش أي تغيير مطلوب: كل الأوردرات اللي في الشيت حالتها مطابقة.</div>
            )}

            {preview.notFound.length > 0 && (
              <div>
                <button onClick={() => setShowNotFound(v => !v)} className="text-sm text-orange-300 hover:underline">
                  {showNotFound ? '▼' : '◀'} {preview.notFound.length} شحنة في الشيت مش لاقيها في النظام
                </button>
                {showNotFound && (
                  <div className="mt-2 bg-muted-bg rounded-xl p-3 text-xs">
                    <button onClick={() => copyList(preview.notFound.map(r => r.awb))} className="flex items-center gap-1 text-violet-300 mb-2"><Copy size={12} /> نسخ القائمة</button>
                    <div className="font-mono max-h-40 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-1" dir="ltr">
                      {preview.notFound.map(r => <div key={r.awb}>{r.awb} <span className="text-gray-500">({r.status})</span></div>)}
                    </div>
                    <div className="text-gray-500 mt-2">دي غالباً أوردرات لسه ماتسجلتش في النظام، أو رقم الشحنة عندك مكتوب مختلف.</div>
                  </div>
                )}
              </div>
            )}

            {preview.missingFromSheet.length > 0 && (
              <div>
                <button onClick={() => setShowMissing(v => !v)} className="text-sm text-gray-300 hover:underline">
                  {showMissing ? '▼' : '◀'} {preview.missingFromSheet.length} أوردر (معلق/شحن) في النظام ومش في الشيت
                </button>
                {showMissing && (
                  <div className="mt-2 bg-muted-bg rounded-xl p-3 text-xs max-h-40 overflow-y-auto space-y-1">
                    {preview.missingFromSheet.map(o => <div key={o.id}>{o.orderNumber}{o.shipmentNumber ? ` — ${o.shipmentNumber}` : ''} <span className="text-gray-500">({statusLabel(o.status)})</span></div>)}
                  </div>
                )}
              </div>
            )}

            <button onClick={apply} disabled={selectedCount === 0} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <RefreshCw size={15} /> تطبيق {selectedCount} تغيير
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
