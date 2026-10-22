import React, { useMemo, useState } from 'react';
import { X, ClipboardPaste } from 'lucide-react';
import { ExistingName, classifySupplierRows, parseSupplierPaste } from '../utils/supplierPaste';

interface Props {
  existing: ExistingName[];
  /** بيضيف حساب بالاسم ده؛ الصفحة اللي فاتحة المودال هي اللي بتحدد نوعه */
  onAddName: (name: string) => { success: boolean; message?: string } | void;
  /** نص يوضح للمستخدم الحساب هيتسجل بإيه */
  typeNote: string;
  onClose: () => void;
}

export default function SupplierPasteImport({ existing, onAddName, typeNote, onClose }: Props) {
  const [text, setText] = useState('');
  const [includeSimilar, setIncludeSimilar] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const rows = useMemo(() => classifySupplierRows(parseSupplierPaste(text), existing), [text, existing]);
  const okRows = rows.filter(r => r.state.kind === 'ok');
  const similarRows = rows.filter(r => r.state.kind === 'similar');
  const chosenSimilar = similarRows.filter(r => includeSimilar.has(r.line));
  const toSave = [...okRows, ...chosenSimilar].sort((a, b) => a.line - b.line);
  const count = (k: string) => rows.filter(r => r.state.kind === k).length;

  const toggle = (line: number) =>
    setIncludeSimilar(prev => { const n = new Set(prev); n.has(line) ? n.delete(line) : n.add(line); return n; });

  const save = () => {
    let added = 0;
    const failed: string[] = [];
    toSave.forEach(r => {
      const res = onAddName(r.name);
      if (res && res.success === false) failed.push(`السطر ${r.line} (${r.name}): ${res.message || 'تعذر الإضافة'}`);
      else added++;
    });
    setResult({ added, failed });
    setText('');
    setIncludeSimilar(new Set());
  };

  const tag = (r: (typeof rows)[number]) => {
    const s = r.state;
    switch (s.kind) {
      case 'ok': return <span className="text-green-300">✔ جاهز</span>;
      case 'error': return <span className="text-red-400">{s.reason} — هيتخطى</span>;
      case 'dupExisting': return <span className="text-red-400">مكرر — موجود بالفعل: {s.with} — مرفوض</span>;
      case 'dupInPaste': return <span className="text-red-400">مكرر مع السطر {s.firstLine} في اللصق ({s.with}) — مرفوض</span>;
      case 'similar': return (
        <span className="text-orange-300">
          ⚠ شبيه بـ {s.source === 'paste' ? `السطر ${s.line} في اللصق: ` : ''}{s.with} — {s.reason}
        </span>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-4xl my-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">📋 لصق تجار من إكسيل</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>

        {result ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-gray-200">تمت إضافة <b className="text-green-400">{result.added}</b> تاجر.</div>
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
              انسخ عمود أسماء التجار من الإكسيل (Ctrl+C) والصقه هنا — عمود واحد بس. <b className="text-gray-300">{typeNote}</b>
              الاسم المكرر بيترفض. الاسم الشبيه (زي «مكتب الغزال» و«الغزال») بيتعلّم بتحذير وبيتخطى، ولو عايزه فعلًا علّم عليه.
            </p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
              placeholder="الصق أسماء التجار هنا..." className="input-dark w-full mt-3 text-sm" />

            {rows.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-gray-400">
                  {rows.length} صف: <b className="text-green-300">{okRows.length} جاهز</b>
                  {count('similar') > 0 && <span className="text-orange-300"> — {count('similar')} شبيه</span>}
                  {(count('dupExisting') + count('dupInPaste')) > 0 && <span className="text-red-400"> — {count('dupExisting') + count('dupInPaste')} مكرر</span>}
                  {count('error') > 0 && <span className="text-red-400"> — {count('error')} خطأ</span>}
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="sticky top-0 bg-elevated"><tr className="text-gray-400 border-b border-border">
                      <th className="p-2 text-center w-16">إضافة</th><th className="p-2 text-right">سطر</th>
                      <th className="p-2 text-right">الاسم</th><th className="p-2 text-right">الحالة</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.line} className={`border-b border-border/40 ${r.state.kind === 'ok' ? '' : r.state.kind === 'similar' ? 'bg-orange-900/10' : 'bg-red-900/10'}`}>
                          <td className="p-2 text-center">
                            {r.state.kind === 'ok' && <span className="text-green-300">✔</span>}
                            {r.state.kind === 'similar' && (
                              <input type="checkbox" checked={includeSimilar.has(r.line)} onChange={() => toggle(r.line)} />
                            )}
                          </td>
                          <td className="p-2 text-gray-500">{r.line}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{tag(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={save} disabled={toSave.length === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  <ClipboardPaste size={15} /> {toSave.length ? `حفظ ${toSave.length} تاجر` : 'مفيش صفوف جاهزة'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
