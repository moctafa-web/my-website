import React, { useMemo, useState } from 'react';
import { X, ClipboardPaste } from 'lucide-react';
import { Brand, Product, ProductCategory, ProductType } from '../types';
import { categoryLabel, generateId } from '../utils/helpers';
import { classifyProductRows, parseProductPaste } from '../utils/productPaste';

interface Props {
  products: Product[];
  brands: Brand[];
  onAddProduct: (p: Product) => { success: boolean; message?: string } | void;
  onClose: () => void;
}

const CATEGORIES: ProductCategory[] = ['phones', 'tablets', 'laptops', 'accessories', 'other'];

export default function ProductPasteImport({ products, brands, onAddProduct, onClose }: Props) {
  const [text, setText] = useState('');
  const [productType, setProductType] = useState<ProductType>('serial');
  const [category, setCategory] = useState<ProductCategory>('phones');
  const [brand, setBrand] = useState(brands.find(b => b.name === 'Apple')?.name || brands[0]?.name || 'Apple');
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const rows = useMemo(() => classifyProductRows(parseProductPaste(text), products), [text, products]);
  const okRows = rows.filter(r => r.state.kind === 'ok');
  const count = (k: string) => rows.filter(r => r.state.kind === k).length;

  const tag = (r: (typeof rows)[number]) => {
    const s = r.state;
    switch (s.kind) {
      case 'ok': return <span className="text-green-300">✔ جاهز</span>;
      case 'error': return <span className="text-red-400">{s.reason} — هيتخطى</span>;
      case 'dupUpc': return <span className="text-orange-300">الـ UPC موجود في منتج: {s.product.name} — هيتخطى</span>;
      case 'dupName': return <span className="text-orange-300">نفس الاسم موجود (UPC: {s.product.upc || s.product.sku}) — هيتخطى</span>;
      case 'dupInPaste': return <span className="text-orange-300">{s.by === 'upc' ? 'UPC' : 'اسم'} مكرر مع السطر {s.firstLine} في اللصق — هيتخطى</span>;
    }
  };

  const save = () => {
    let added = 0;
    const failed: string[] = [];
    okRows.forEach(r => {
      const now = new Date().toISOString();
      const res = onAddProduct({
        id: generateId(), name: r.name, description: '', sku: r.upc, upc: r.upc, upcs: [r.upc], barcode: '',
        category, brand, productType, costPrice: 0, salePrice: 0, stock: 0, minStock: 2,
        createdAt: now, updatedAt: now,
      });
      if (res && res.success === false) failed.push(`السطر ${r.line}: ${res.message || 'تعذر الإضافة'}`);
      else added++;
    });
    setResult({ added, failed });
    setText('');
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-4xl my-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">📋 لصق منتجات جديدة من إكسيل</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>

        {result ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-gray-200">تمت إضافة <b className="text-green-400">{result.added}</b> منتج.</div>
            {result.failed.length > 0 && (
              <div className="text-xs text-red-300 space-y-1 max-h-40 overflow-auto">
                <div className="font-bold">اتعذرت {result.failed.length}:</div>
                {result.failed.map((f, i) => <div key={i}>• {f}</div>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setResult(null)} className="btn-secondary flex-1">لصق دفعة تانية</button>
              <button onClick={onClose} className="btn-primary flex-1">تم</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              انسخ الصفوف من الإكسيل (Ctrl+C) والصقها هنا. الأعمدة بالترتيب: <b className="text-gray-300">UPC | اسم المنتج</b>.
              الـ UPC بيتسجل كمان ككود المنتج (SKU). التكلفة والسعر والكمية بتبدأ بصفر (المخزون بيدخل بفواتير الشراء بس).
              أي UPC أو اسم موجود قبل كده (أو متكرر في اللصق) بيتخطى.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="form-label">نوع المنتج (لكل الصفوف)</label>
                <select value={productType} onChange={e => setProductType(e.target.value as ProductType)} className="input-dark w-full">
                  <option value="serial">سيريال (بيتعد بالسيريالات)</option>
                  <option value="normal">عادي (بالكمية)</option>
                </select>
              </div>
              <div>
                <label className="form-label">الفئة</label>
                <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)} className="input-dark w-full">
                  {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">العلامة التجارية</label>
                <select value={brand} onChange={e => setBrand(e.target.value)} className="input-dark w-full">
                  {brands.length === 0 && <option value="Apple">Apple</option>}
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} dir="ltr"
              placeholder="الصق هنا..." className="input-dark w-full mt-3 font-mono text-xs" />

            {rows.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-gray-400">
                  {rows.length} صف: <b className="text-green-300">{okRows.length} جاهز</b>
                  {count('dupUpc') > 0 && <span className="text-orange-300"> — {count('dupUpc')} UPC موجود</span>}
                  {count('dupName') > 0 && <span className="text-orange-300"> — {count('dupName')} اسم موجود</span>}
                  {count('dupInPaste') > 0 && <span className="text-orange-300"> — {count('dupInPaste')} مكرر في اللصق</span>}
                  {count('error') > 0 && <span className="text-red-400"> — {count('error')} خطأ</span>}
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="sticky top-0 bg-elevated"><tr className="text-gray-400 border-b border-border">
                      <th className="p-2 text-right">سطر</th><th className="p-2 text-right">UPC / SKU</th>
                      <th className="p-2 text-right">اسم المنتج</th><th className="p-2 text-right">الحالة</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.line} className={`border-b border-border/40 ${r.state.kind === 'ok' ? '' : r.state.kind === 'error' ? 'bg-red-900/10' : 'bg-orange-900/10'}`}>
                          <td className="p-2 text-gray-500">{r.line}</td>
                          <td className="p-2 font-mono" dir="ltr">{r.upc}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{tag(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={save} disabled={okRows.length === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  <ClipboardPaste size={15} /> {okRows.length ? `حفظ ${okRows.length} منتج جديد` : 'مفيش صفوف جاهزة'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
