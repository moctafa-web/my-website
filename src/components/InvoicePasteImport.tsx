import React, { useMemo, useState } from 'react';
import { X, ClipboardPaste } from 'lucide-react';
import { Product } from '../types';
import { formatCurrency } from '../utils/helpers';
import { classifyRows, groupRows, parseInvoicePaste, PasteGroup } from '../utils/invoicePaste';

interface Props {
  mode: 'purchase' | 'sale';
  products: Product[];
  /** يرجّع سبب الرفض (نص) أو null لو السيريال سليم */
  checkSerial: (serial: string, product: Product) => string | null;
  onApply: (groups: PasteGroup[]) => void;
  onClose: () => void;
}

export default function InvoicePasteImport({ mode, products, checkSerial, onApply, onClose }: Props) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseInvoicePaste(text), [text]);
  const rows = useMemo(() => classifyRows(parsed.rows, products, checkSerial), [parsed.rows, products, checkSerial]);
  const okRows = rows.filter(r => r.state.kind === 'ok');
  const groups = useMemo(() => groupRows(rows), [rows]);
  const total = okRows.reduce((s, r) => s + r.price, 0);
  const count = (k: string) => rows.filter(r => r.state.kind === k).length;

  const tag = (r: (typeof rows)[number]) => {
    switch (r.state.kind) {
      case 'ok': return <span className="text-green-300">✔ جاهز</span>;
      case 'noUpc': return <span className="text-red-400">UPC مش موجود — هيتخطى</span>;
      case 'dupInPaste': return <span className="text-orange-300">سيريال مكرر في اللصق — هيتخطى</span>;
      case 'blocked': return <span className="text-red-400">{r.state.reason} — هيتخطى</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-4xl my-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">📋 لصق {mode === 'purchase' ? 'فاتورة شراء' : 'فاتورة بيع'} من إكسيل</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          انسخ الصفوف من الإكسيل (Ctrl+C) والصقها هنا. الأعمدة بالترتيب:
          <b className="text-gray-300"> UPC | اسم المنتج | السيريال | IMEI1 | IMEI2 | السعر</b>.
          المنتجات من غير IMEI: <b className="text-gray-300">UPC | اسم المنتج | السيريال | السعر</b>.
          المطابقة بالـ UPC بس والاسم بيتاخد من النظام. أي صف الـ UPC بتاعه مش موجود في المنتجات بيتخطى ومش بيتعمل منتج جديد.
          {mode === 'sale' ? ' السيريال لازم يكون متاح في المخزون.' : ' السيريال ما ينفعش يكون موجود في المخزون.'}
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6} dir="ltr"
          placeholder="الصق هنا..." className="input-dark w-full mt-3 font-mono text-xs" />

        {(rows.length > 0 || parsed.unreadable.length > 0) && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-gray-400">
              {rows.length} صف: <b className="text-green-300">{okRows.length} جاهز</b>
              {count('noUpc') > 0 && <span className="text-red-400"> — {count('noUpc')} UPC مش موجود</span>}
              {count('blocked') > 0 && <span className="text-red-400"> — {count('blocked')} سيريال مرفوض</span>}
              {count('dupInPaste') > 0 && <span className="text-orange-300"> — {count('dupInPaste')} مكرر</span>}
              {parsed.unreadable.length > 0 && <span className="text-orange-300"> — {parsed.unreadable.length} سطر مش مفهوم (السطر الأخير لازم يكون السعر)</span>}
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="sticky top-0 bg-elevated"><tr className="text-gray-400 border-b border-border">
                  <th className="p-2 text-right">UPC</th><th className="p-2 text-right">المنتج (في النظام)</th>
                  <th className="p-2 text-right">السيريال</th><th className="p-2 text-right">IMEI</th>
                  <th className="p-2 text-center">السعر</th><th className="p-2 text-right">الحالة</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.line} className={`border-b border-border/40 ${r.state.kind === 'ok' ? '' : 'bg-red-900/10'}`}>
                      <td className="p-2 font-mono" dir="ltr">{r.upc}</td>
                      <td className="p-2">{'product' in r.state ? r.state.product.name : <span className="text-gray-500">{r.name}</span>}</td>
                      <td className="p-2 font-mono" dir="ltr">{r.serial}</td>
                      <td className="p-2 font-mono text-gray-400" dir="ltr">{[r.imei1, r.imei2].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="p-2 text-center">{formatCurrency(r.price)}</td>
                      <td className="p-2">{tag(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {groups.length > 0 && (
              <div className="text-xs text-gray-300">
                هيتكتب في الفاتورة {groups.length} بند — الإجمالي <b className="text-white">{formatCurrency(total)}</b>
              </div>
            )}
            <button onClick={() => { onApply(groups); onClose(); }} disabled={groups.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <ClipboardPaste size={15} /> {groups.length ? `كتابة ${okRows.length} صف في الفاتورة` : 'مفيش صفوف جاهزة'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
