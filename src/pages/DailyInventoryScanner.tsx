import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Copy, FileSpreadsheet, Printer, RefreshCw, Save, ScanLine, Trash2, XCircle } from 'lucide-react';
import { Product, SerialItem, DailyInventoryScan, DailyInventoryScanLine } from '../types';
import { generateId, getTodayStr } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { loadCollection } from '../services/firebasePersistence';

type ScanFeedback = { id: number; type: 'success' | 'error'; message: string };

interface Props {
  products: Product[];
  serials: SerialItem[];
  sessions: DailyInventoryScan[];
  onAddSession: (s: DailyInventoryScan) => void;
  onUpdateSession: (s: DailyInventoryScan) => void;
}

const classifyLine = (code: string, serials: SerialItem[], existingLines: DailyInventoryScanLine[]): DailyInventoryScanLine => {
  const norm = code.trim().toLowerCase();
  const hit = serials.find(s => [s.serial, s.imei1, s.imei2].filter(Boolean).some(v => String(v).toLowerCase() === norm));
  const duplicate = existingLines.some(l => l.code.toLowerCase() === norm || (!!hit?.id && l.serialId === hit.id));

  if (duplicate) return { id: generateId(), code, productName: hit?.productName || 'غير معروف', serialId: hit?.id, productId: hit?.productId, result: 'duplicate', countedAt: new Date().toISOString(), serial: hit?.serial, note: 'تم تسجيل نفس الجهاز/القراءة من قبل' };
  if (hit && hit.status === 'available') return { id: generateId(), code, productName: hit.productName, serialId: hit.id, productId: hit.productId, result: 'matched', countedAt: new Date().toISOString(), serial: hit.serial };
  if (hit) return { id: generateId(), code, productName: hit.productName, serialId: hit.id, productId: hit.productId, result: 'not-available', countedAt: new Date().toISOString(), serial: hit.serial, note: `الحالة الحالية: ${hit.status}` };
  return { id: generateId(), code, productName: 'غير معروف', result: 'unknown', countedAt: new Date().toISOString(), note: 'لا يوجد سيريال/IMEI مطابق في النظام' };
};

export default function DailyInventoryScanner({ products: _products, serials, sessions, onAddSession, onUpdateSession }: Props) {
  const [session, setSession] = useState<DailyInventoryScan | null>(null);
  const [visibleSessions, setVisibleSessions] = useState<DailyInventoryScan[]>(sessions || []);
  const [showReport, setShowReport] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [manual, setManual] = useState('');
  const [scannerInput, setScannerInput] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [refreshing, setRefreshing] = useState(false);
  const [printSections, setPrintSections] = useState({ matched: true, missing: true, extra: true, duplicates: false });
  const [shareFeedback, setShareFeedback] = useState('');

  useEffect(() => setVisibleSessions(sessions || []), [sessions]);

  const refreshSessions = async () => {
    setRefreshing(true);
    try {
      const fresh = await loadCollection<DailyInventoryScan>('dailyInventoryScans');
      fresh.sort((a, b) => `${b.date}-${b.completedAt || b.startedAt || ''}`.localeCompare(`${a.date}-${a.completedAt || a.startedAt || ''}`));
      setVisibleSessions(fresh);
    } catch (error) {
      console.error('[Firebase] refresh daily inventory scans failed:', error);
      setFeedback({ id: Date.now(), type: 'error', message: '⚠️ تعذر تحديث جلسات الجرد من Firebase' });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (session) return;
    void refreshSessions();
    const timer = window.setInterval(() => { void refreshSessions(); }, 15000);
    return () => window.clearInterval(timer);
  }, [session]);

  const start = () => {
    const freshDate = getTodayStr();
    setSession({ id: `daily-count-${generateId()}`, date: freshDate, status: 'draft', lines: [], startedAt: new Date().toISOString() });
    setDate(freshDate);
    setShowReport(false);
    setFeedback(null);
    setScannerInput('');
  };

  const openSession = (saved: DailyInventoryScan) => {
    setSession({ ...saved, lines: [...(saved.lines || [])] });
    setDate(saved.date);
    setShowReport(true);
    setFeedback(null);
    setScannerInput('');
  };

  const processCode = (raw: string) => {
    const code = raw.trim();
    if (!code || !session) return;
    const line = classifyLine(code, serials, session.lines);
    const next = { ...session, lines: [...session.lines, line], status: session.status === 'completed' ? 'draft' as const : session.status };
    setSession(next);
    setShowReport(false);
    setFeedback({
      id: Date.now(),
      type: line.result === 'matched' ? 'success' : 'error',
      message: line.result === 'matched' ? `✓ ${line.productName} تم تسجيله` : line.result === 'duplicate' ? '⚠️ الجهاز اتجرد قبل كده' : `⚠️ ${line.note || 'السيريال غير موجود'}`,
    });
  };

  const importExcel = async (file: File) => {
    try {
      if (!session) return;
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) return;
      const headers = Object.keys(rows[0]);
      const key = headers.find(h => /^(serial|serial number|s.?n|imei|imei number|code|barcode|سيريال|السيريال|باركود)$/i.test(h.trim()))
        || headers.find(h => /(serial|imei|barcode|سيريال|باركود)/i.test(h));
      const values: string[] = [];
      for (const row of rows) {
        const raw = key ? row[key] : Object.values(row).find(v => String(v ?? '').trim());
        values.push(...String(raw ?? '').split(/[\n,;\t]+/).map(v => v.trim()).filter(Boolean));
      }
      let nextLines = [...session.lines];
      for (const value of values) nextLines.push(classifyLine(value, serials, nextLines));
      const next = { ...session, lines: nextLines, status: session.status === 'completed' ? 'draft' as const : session.status };
      setSession(next);
      setShowReport(false);
      if (values.length) setFeedback({ id: Date.now(), type: 'success', message: `✓ تم استيراد ${values.length} قراءة من Excel` });
    } catch (error) {
      console.error('Excel import failed', error);
      setFeedback({ id: Date.now(), type: 'error', message: '⚠️ تعذر قراءة ملف Excel' });
    }
  };

  const deleteLine = (id: string) => {
    if (!session) return;
    setSession({ ...session, lines: session.lines.filter(l => l.id !== id), status: 'draft' });
    setShowReport(false);
  };

  const save = async () => {
    if (!session) return;
    const completed: DailyInventoryScan = { ...session, date, status: 'completed', completedAt: new Date().toISOString() };
    if ((visibleSessions || []).some(s => s.id === completed.id)) onUpdateSession(completed);
    else onAddSession(completed);
    setSession(completed);
    setVisibleSessions(prev => [completed, ...prev.filter(s => s.id !== completed.id)]);
    setShowReport(true);
    setFeedback({ id: Date.now(), type: 'success', message: '✓ تم حفظ الجرد في Firebase ويمكن فتحه من أي جهاز' });
  };

  const closeSession = () => {
    setSession(null);
    setShowReport(false);
    setFeedback(null);
    setScannerInput('');
    void refreshSessions();
  };

  const scannedIds = new Set((session?.lines || []).map(l => l.serialId).filter(Boolean) as string[]);
  const expectedSerials = serials.filter(s => s.status === 'available');
  const missingSerials = expectedSerials.filter(s => !scannedIds.has(s.id));
  const matchedLines = (session?.lines || []).filter(l => l.result === 'matched');
  const extraLines = (session?.lines || []).filter(l => l.result === 'unknown' || l.result === 'not-available');
  const duplicateLines = (session?.lines || []).filter(l => l.result === 'duplicate');
  const uniqueMatchedIds = new Set(matchedLines.map(l => l.serialId).filter(Boolean));
  const summary = useMemo(() => ({ matched: uniqueMatchedIds.size, missing: missingSerials.length, extra: extraLines.length, scanned: session?.lines.length || 0 }), [session, missingSerials.length, extraLines.length, uniqueMatchedIds.size]);

  const reportText = useMemo(() => {
    const lines: string[] = [
      `ONE — تقرير نتيجة الجرد اليومي`,
      `التاريخ: ${date}`,
      `مطابق: ${summary.matched} | ناقص/مفقود: ${summary.missing} | زيادة/غير موجود: ${summary.extra}`,
      ''
    ];
    if (printSections.matched) {
      lines.push('✅ المطابق');
      matchedLines.forEach(l => lines.push(`${l.productName} — ${l.serial || l.code} — مطابق`));
      lines.push('');
    }
    if (printSections.missing) {
      lines.push('🔴 الناقص / المفقود');
      missingSerials.forEach(s => lines.push(`${s.productName} — ${s.serial || '-'} — لم يتم جرده`));
      lines.push('');
    }
    if (printSections.extra) {
      lines.push('🟠 الزيادة / غير موجود في النظام');
      extraLines.forEach(l => lines.push(`${l.code} — ${l.productName} — ${l.note || 'غير موجود بالنظام'}`));
      lines.push('');
    }
    if (printSections.duplicates && duplicateLines.length) {
      lines.push('⚠️ القراءات المكررة');
      duplicateLines.forEach(l => lines.push(`${l.code} — ${l.productName}`));
    }
    return lines.join('\n');
  }, [date, summary, printSections, matchedLines, missingSerials, extraLines, duplicateLines]);

  const copyReport = async (kind: 'whatsapp' | 'email') => {
    const emailText = [
      `ONE — تقرير نتيجة الجرد اليومي`,
      `التاريخ: ${date}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `ملخص الجرد`,
      `• المطابق: ${summary.matched}`,
      `• الناقص / المفقود: ${summary.missing}`,
      `• الزيادة / غير موجود: ${summary.extra}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      reportText.replace(`ONE — تقرير نتيجة الجرد اليومي\nالتاريخ: ${date}\nمطابق: ${summary.matched} | ناقص/مفقود: ${summary.missing} | زيادة/غير موجود: ${summary.extra}\n\n`, '')
    ].join('\n');
    const text = kind === 'whatsapp' ? reportText : emailText;
    try {
      await navigator.clipboard.writeText(text);
      setShareFeedback(kind === 'whatsapp' ? 'تم نسخ التقرير بصيغة مناسبة للواتساب' : 'تم نسخ التقرير بصيغة مناسبة للإيميل');
      window.setTimeout(() => setShareFeedback(''), 2200);
    } catch {
      setShareFeedback('تعذر النسخ تلقائيًا. استخدم زر الطباعة أو انسخ التقرير يدويًا.');
    }
  };

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-lg font-bold text-white">جرد يومي بالسكانر</h2><p className="text-xs text-muted mt-1">الجرد بالسكانر اللاسلكي فقط. الجلسة محفوظة في Firebase ويمكن فتحها وتعديلها من أي جهاز.</p></div>
      {!session && <button onClick={refreshSessions} disabled={refreshing} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/> تحديث الجلسات</button>}
    </div>

    {!session ? <>
      <div className="card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"><div><div className="font-bold">ابدأ جلسة جرد اليوم</div><div className="text-xs text-muted mt-1">يمكنك فتح أي جلسة محفوظة وتعديلها ثم إعادة حفظها.</div></div><button onClick={start} className="btn-primary flex items-center gap-2"><ScanLine size={16}/> بدء الجرد</button></div>
      <div className="card overflow-hidden"><div className="p-3 border-b border-border font-bold">آخر جلسات الجرد</div>
        {visibleSessions.slice().sort((a,b)=>`${b.date}-${b.completedAt||b.startedAt||''}`.localeCompare(`${a.date}-${a.completedAt||a.startedAt||''}`)).slice(0,20).map(s=><div key={s.id} className="p-3 border-b border-border/60 flex items-center justify-between gap-3"><div><div className="font-medium">{s.date}</div><div className="text-xs text-muted">{s.lines.filter(l=>l.result==='matched').length} مطابق • {s.lines.filter(l=>l.result!=='matched').length} مشكلة</div></div><div className="flex items-center gap-2"><span className="text-xs text-muted">{s.status==='completed'?'مكتمل':'مسودة'}</span><button onClick={()=>openSession(s)} className="btn-secondary text-xs">فتح / تعديل</button></div></div>)}
        {!visibleSessions.length&&<div className="p-8 text-center text-muted">لا يوجد جرد يومي سابق.</div>}
      </div>
    </> : <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><button onClick={closeSession} className="btn-secondary">← رجوع للجلسات</button><div className="text-sm text-muted">جلسة {date} {session.status==='completed' ? '• محفوظة' : '• قيد التعديل'}</div></div>
      <div className="grid grid-cols-4 gap-2"><div className="card p-3"><div className="text-xs text-muted">مطابق</div><div className="text-xl font-bold text-emerald-300">{summary.matched}</div></div><div className="card p-3"><div className="text-xs text-muted">ناقص</div><div className="text-xl font-bold text-red-300">{summary.missing}</div></div><div className="card p-3"><div className="text-xs text-muted">زيادة / غير موجود</div><div className="text-xl font-bold text-orange-300">{summary.extra}</div></div><div className="card p-3"><div className="text-xs text-muted">إجمالي القراءات</div><div className="text-xl font-bold">{summary.scanned}</div></div></div>
      <div className="card p-4 flex flex-col md:flex-row gap-2"><div className="card p-3 flex-1 border border-emerald-700/30"><div className="text-sm font-bold">🔗 السكانر اللاسلكي</div><div className="text-xs text-muted mt-1">وصل Deli S228W بالموبايل أو اللابتوب بوضع Keyboard/HID، ثم اضغط داخل الخانة مرة واحدة.</div><input autoFocus value={scannerInput} onChange={e=>setScannerInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();processCode(scannerInput);setScannerInput('')}}} placeholder="جاهز لاستقبال Serial / IMEI من السكانر..." className="input-dark mt-2 w-full"/></div><label className="btn-secondary flex items-center justify-center gap-2 cursor-pointer"><FileSpreadsheet size={18}/> استيراد Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)importExcel(f);e.currentTarget.value=''}}/></label><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="إدخال يدوي اختياري Serial / IMEI" className="input-dark flex-1" onKeyDown={e=>{if(e.key==='Enter'){processCode(manual);setManual('')}}}/><button onClick={save} className="btn-secondary flex items-center gap-2"><Save size={16}/> حفظ الجرد</button></div>
      {feedback && <div className={`text-xs ${feedback.type==='success'?'text-emerald-300':'text-red-300'}`}>{feedback.message}</div>}

      {showReport && <div className="print-area card p-5 bg-white text-black"><div className="flex items-center justify-between gap-2 border-b pb-4"><div><h3 className="font-bold text-2xl">ONE — تقرير نتيجة الجرد اليومي</h3><div className="text-sm mt-1">التاريخ: {date} • إجمالي السيريالات المتاحة بالنظام: {expectedSerials.length}</div></div><div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={printSections.matched} onChange={e=>setPrintSections(p=>({...p,matched:e.target.checked}))}/> المطابق</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={printSections.missing} onChange={e=>setPrintSections(p=>({...p,missing:e.target.checked}))}/> الناقص</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={printSections.extra} onChange={e=>setPrintSections(p=>({...p,extra:e.target.checked}))}/> الزيادة</label>
          {duplicateLines.length>0 && <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={printSections.duplicates} onChange={e=>setPrintSections(p=>({...p,duplicates:e.target.checked}))}/> المكرر</label>}
          <button onClick={()=>window.print()} className="btn-primary flex items-center gap-2"><Printer size={16}/> طباعة المحدد</button>
          <button onClick={() => copyReport('whatsapp')} className="btn-secondary flex items-center gap-1"><Copy size={15}/> نسخ للواتساب</button>
          <button onClick={() => copyReport('email')} className="btn-secondary flex items-center gap-1"><Copy size={15}/> نسخ للإيميل</button>
          {shareFeedback && <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">{shareFeedback}</span>}
        </div></div>
        <div className="grid grid-cols-4 gap-3 mt-5"><div className="p-3 rounded-lg bg-emerald-50 text-center"><div className="font-bold text-lg">{summary.matched}</div><div className="text-sm">مطابق</div></div><div className="p-3 rounded-lg bg-red-50 text-center"><div className="font-bold text-lg">{summary.missing}</div><div className="text-sm">ناقص / مفقود</div></div><div className="p-3 rounded-lg bg-orange-50 text-center"><div className="font-bold text-lg">{summary.extra}</div><div className="text-sm">زيادة / غير موجود</div></div><div className="p-3 rounded-lg bg-gray-100 text-center"><div className="font-bold text-lg">{summary.scanned}</div><div className="text-sm">إجمالي القراءات</div></div></div>
        <section className={`mt-6 ${printSections.matched ? '' : 'print-skip'}`}><h4 className="font-bold text-lg mb-2">✅ المطابق</h4>{matchedLines.length?<table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2 text-right">المنتج</th><th className="p-2">Serial</th><th className="p-2">الحالة</th></tr></thead><tbody>{matchedLines.map(l=><tr key={l.id} className="border-b"><td className="p-2">{l.productName}</td><td className="p-2 font-mono">{l.serial||l.code||'-'}</td><td className="p-2 text-center">مطابق</td></tr>)}</tbody></table>:<div className="text-sm">لا توجد قراءات مطابقة.</div>}</section>
        <section className={`mt-6 ${printSections.missing ? '' : 'print-skip'}`}><h4 className="font-bold text-lg mb-2">🔴 الناقص / المفقود</h4>{missingSerials.length?<table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2 text-right">المنتج</th><th className="p-2">Serial</th><th className="p-2">IMEI1</th><th className="p-2">IMEI2</th><th className="p-2">الحالة</th></tr></thead><tbody>{missingSerials.map(s=><tr key={s.id} className="border-b"><td className="p-2">{s.productName}</td><td className="p-2 font-mono">{s.serial||'-'}</td><td className="p-2 font-mono">{s.imei1||'-'}</td><td className="p-2 font-mono">{s.imei2||'-'}</td><td className="p-2 text-center">مفقود / لم يتم جرده</td></tr>)}</tbody></table>:<div className="text-sm">لا يوجد سيريال ناقص — كل السيريالات المتاحة تم جردها.</div>}</section>
        <section className={`mt-6 ${printSections.extra ? '' : 'print-skip'}`}><h4 className="font-bold text-lg mb-2">🟠 الزيادة / غير موجود في النظام</h4>{extraLines.length?<table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2">الكود</th><th className="p-2 text-right">المنتج</th><th className="p-2 text-right">البيان</th></tr></thead><tbody>{extraLines.map(l=><tr key={l.id} className="border-b"><td className="p-2 font-mono">{l.code}</td><td className="p-2">{l.productName}</td><td className="p-2">{l.note||'غير موجود بالنظام'}</td></tr>)}</tbody></table>:<div className="text-sm">لا توجد زيادة أو أكواد غير معروفة.</div>}</section>
        {duplicateLines.length>0 && <section className={`mt-6 ${printSections.duplicates ? '' : 'print-skip'}`}><h4 className="font-bold text-lg mb-2">⚠️ قراءات مكررة</h4><table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2">الكود</th><th className="p-2 text-right">المنتج</th><th className="p-2">البيان</th></tr></thead><tbody>{duplicateLines.map(l=><tr key={l.id} className="border-b"><td className="p-2 font-mono">{l.code}</td><td className="p-2">{l.productName}</td><td className="p-2">{l.note}</td></tr>)}</tbody></table></section>}
        <div className="mt-8 pt-4 border-t text-sm grid grid-cols-3 gap-4"><div><strong>المتوقع:</strong> {expectedSerials.length}</div><div><strong>تم العثور عليه:</strong> {summary.matched}</div><div><strong>لم يتم العثور عليه:</strong> {summary.missing}</div></div>
      </div>}

      <div className="card overflow-hidden"><div className="p-3 border-b border-border font-bold flex items-center gap-2"><ClipboardCheck size={16}/> قراءات الجلسة <span className="text-xs text-muted">({session.lines.length})</span></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="p-3 text-right">الكود</th><th className="p-3 text-right">المنتج</th><th className="p-3 text-center">النتيجة</th><th className="p-3 text-right">الوقت</th><th className="p-3 text-center">حذف</th></tr></thead><tbody>{session.lines.slice().reverse().map(l=><tr key={l.id} className="border-b border-border/60"><td className="p-3 font-mono">{l.code}</td><td className="p-3">{l.productName}</td><td className="p-3 text-center">{l.result==='matched'?<span className="text-emerald-300 flex items-center justify-center gap-1"><CheckCircle2 size={15}/> مطابق</span>:l.result==='duplicate'?<span className="text-orange-300 flex items-center justify-center gap-1"><Trash2 size={15}/> مكرر</span>:<span className="text-red-300 flex items-center justify-center gap-1"><XCircle size={15}/> {l.result==='unknown'?'غير معروف':'غير متاح'}</span>}</td><td className="p-3 text-xs text-muted">{new Date(l.countedAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-3 text-center"><button title="حذف قراءة الجرد فقط" onClick={()=>deleteLine(l.id)} className="text-red-300 hover:text-red-200 p-1"><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></div>
    </div>}
  </div>;
}
