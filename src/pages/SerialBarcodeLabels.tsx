import React, { useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, Search, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { Product, SerialItem } from '../types';

interface Props {
  products: Product[];
  serials: SerialItem[];
}

// مقاس الملصق: 5 سم طول × 2.5 سم عرض
const LABEL_W_MM = 50;
const LABEL_H_MM = 25;

// Code128 بيدعم ASCII بس (سيريالات أبل حروف إنجليزي وأرقام فمفيش مشكلة)
const isEncodable = (v: string) => /^[\x20-\x7E]+$/.test(v);

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// بيرجّع SVG للباركود (Code128) كنص
const barcodeSvg = (value: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: 'CODE128',
    displayValue: false,
    width: 2,
    height: 60,
    margin: 10, // منطقة هادئة على الجانبين عشان السكانر يقرأ بسهولة
    background: '#ffffff',
    lineColor: '#000000',
  });
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return new XMLSerializer().serializeToString(svg);
};

const labelHtml = (s: SerialItem, showName: boolean) => `
  <div class="label">
    ${showName ? `<div class="name">${escapeHtml(s.productName)}</div>` : ''}
    <div class="bars">${barcodeSvg(s.serial)}</div>
    <div class="code">${escapeHtml(s.serial)}</div>
  </div>`;

// طباعة عبر iframe مخفي (نفس أسلوب باقي النظام عشان مانع النوافذ المنبثقة)
const printLabels = (items: SerialItem[], showName: boolean) => {
  const old = document.getElementById('__one_label_frame__');
  if (old) old.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__one_label_frame__';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }

  doc.open();
  doc.write(`<!DOCTYPE html><html dir="ltr"><head><meta charset="UTF-8" /><title>Serial Labels</title>
    <style>
      @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { background: #fff; color: #000; }
      .label {
        width: ${LABEL_W_MM}mm; height: ${LABEL_H_MM}mm;
        padding: 1.2mm 2mm; overflow: hidden;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        page-break-after: always; break-after: page;
      }
      .label:last-child { page-break-after: auto; break-after: auto; }
      .name { width: 100%; font: bold 6.5pt Arial, sans-serif; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.6mm; }
      .bars { width: 100%; height: ${showName ? '12.5mm' : '15mm'}; }
      .bars svg { width: 100%; height: 100%; display: block; }
      .code { margin-top: 0.8mm; font: bold 8.5pt 'Courier New', monospace; letter-spacing: 0.4px; text-align: center; white-space: nowrap; }
    </style></head><body>${items.map(s => labelHtml(s, showName)).join('')}</body></html>`);
  doc.close();

  setTimeout(() => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60000);
  }, 400);
};

export default function SerialBarcodeLabels({ products, serials }: Props) {
  const [productFilter, setProductFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showName, setShowName] = useState(true);

  // الأجهزة المتاحة في المخزون فقط
  const available = useMemo(
    () => serials.filter(s => s.status === 'available' && !!s.serial),
    [serials]
  );

  const productsWithStock = useMemo(() => {
    const counts = new Map<string, number>();
    available.forEach(s => counts.set(s.productId, (counts.get(s.productId) || 0) + 1));
    return products
      .filter(p => counts.has(p.id))
      .map(p => ({ id: p.id, name: p.name, count: counts.get(p.id) || 0 }));
  }, [available, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter(s =>
      (productFilter === 'all' || s.productId === productFilter) &&
      (!q || s.serial.toLowerCase().includes(q) || s.productName.toLowerCase().includes(q))
    );
  }, [available, productFilter, search]);

  const selectedItems = useMemo(() => available.filter(s => selected.has(s.id)), [available, selected]);
  const badItems = selectedItems.filter(s => !isEncodable(s.serial));
  const printable = selectedItems.filter(s => isEncodable(s.serial));
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllFiltered = () =>
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(s => next.delete(s.id));
      else filtered.forEach(s => next.add(s.id));
      return next;
    });

  const previewItem = printable[0];
  const previewHtml = useMemo(() => (previewItem ? labelHtml(previewItem, showName) : ''), [previewItem, showName]);

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div>
          <div className="font-bold">🏷️ طباعة باركود السيريالات للجرد</div>
          <div className="text-xs text-muted mt-1">
            باركود Code128 لكل جهاز متاح بسيريله، على ملصق {LABEL_W_MM}×{LABEL_H_MM} مم. السكانر العادي بيقرأه ويطابقه مباشرة في الجرد.
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="input-dark md:w-72">
            <option value="all">كل الأجهزة المتاحة ({available.length})</option>
            {productsWithStock.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالسيريال أو اسم الجهاز..."
              className="input-dark w-full pr-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={toggleAllFiltered} className="btn-secondary flex items-center gap-2 text-sm">
            {allFilteredSelected ? <CheckSquare size={15} /> : <Square size={15} />}
            {allFilteredSelected ? 'إلغاء تحديد الظاهر' : `تحديد الكل (${filtered.length})`}
          </button>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-white">مسح التحديد ({selected.size})</button>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} />
            اسم الجهاز على الملصق
          </label>
          <button
            onClick={() => printLabels(printable, showName)}
            disabled={printable.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 mr-auto"
          >
            <Printer size={15} /> طباعة {printable.length} ملصق
          </button>
        </div>

        {badItems.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-orange-300 bg-orange-900/20 border border-orange-700/30 rounded-lg p-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{badItems.length} سيريال فيه رموز غير إنجليزية ومش هيتطبع باركودها: {badItems.map(s => s.serial).join('، ')}</span>
          </div>
        )}
      </div>

      {previewItem && (
        <div className="card p-4">
          <div className="text-xs text-muted mb-2">معاينة أول ملصق (الحجم الفعلي تقريباً)</div>
          <div
            className="bg-white text-black border border-gray-300 rounded"
            style={{ width: `${LABEL_W_MM * 3.78}px`, height: `${LABEL_H_MM * 3.78}px`, direction: 'ltr' }}
          >
            <style>{`
              .prev .label{width:100%;height:100%;padding:5px 8px;display:flex;flex-direction:column;justify-content:center;align-items:center;overflow:hidden}
              .prev .name{width:100%;font:bold 8.7px Arial;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
              .prev .bars{width:100%;height:${showName ? 47 : 57}px}
              .prev .bars svg{width:100%;height:100%;display:block}
              .prev .code{margin-top:3px;font:bold 11px 'Courier New',monospace;text-align:center;white-space:nowrap}
            `}</style>
            <div className="prev" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-3 border-b border-border font-bold text-sm">
          الأجهزة المتاحة <span className="text-xs text-muted">({filtered.length})</span>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-elevated">
              <tr className="border-b border-border text-muted">
                <th className="p-3 w-10"></th>
                <th className="p-3 text-right">الجهاز</th>
                <th className="p-3 text-right">السيريال</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-muted">لا توجد أجهزة متاحة مطابقة</td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} onClick={() => toggle(s.id)} className="border-b border-border/60 cursor-pointer hover:bg-white/5">
                  <td className="p-3 text-center"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-3">{s.productName}</td>
                  <td className="p-3 font-mono">{s.serial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
