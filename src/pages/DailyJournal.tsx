import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DailyJournal as DailyJournalType, JournalEntry, TreasuryTransaction } from '../types';
import { formatCurrency, getTodayStr, generateId } from '../utils/helpers';
import { Plus, X, Printer, ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface Props {
  journals: DailyJournalType[];
  treasuryTransactions: TreasuryTransaction[];
  onSaveJournal: (journal: DailyJournalType) => void;
}

const TYPE_LABELS: Record<string, string> = {
  sale: 'مبيعات', purchase: 'مشتريات', expense: 'مصاريف',
  payment_in: 'تحصيل ديون (عملاء)', payment_out: 'سداد ديون (موردين)',
  adjustment: 'تسوية يدوية', transfer: 'تحويل بين الخزينتين', opening: 'رصيد افتتاحي',
};

export default function DailyJournal({ journals, treasuryTransactions, onSaveJournal }: Props) {
  const [date, setDate] = useState(getTodayStr());
  const [actualBalance, setActualBalance] = useState('');
  const [actualBalanceBank, setActualBalanceBank] = useState('');
  const [closingTime, setClosingTime] = useState<string | null>(null);
  const [closingNote, setClosingNote] = useState('');

  const [inEntries, setInEntries] = useState<JournalEntry[]>([{ id: '1', label: '', amount: 0 }]);
  const [outEntries, setOutEntries] = useState<JournalEntry[]>([{ id: '1', label: '', amount: 0 }]);
  const [showHistory, setShowHistory] = useState(false);

  // ✅ Ref لتخزين آخر دفعة محفوظة + Debounce timer
  const lastSavedRef = useRef<DailyJournalType | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSaveJournal);

  // ✅ نحافظ على أحدث onSaveJournal بدون ما نحطه في dependencies
  useEffect(() => {
    onSaveRef.current = onSaveJournal;
  }, [onSaveJournal]);

  const journalsByDate: Record<string, DailyJournalType> = {};
  journals.forEach(j => { journalsByDate[j.date] = j; });

  // ✅ تحميل بيانات اليوم عند تغيير التاريخ فقط
  useEffect(() => {
    const saved = journalsByDate[date];

    // ✅ لو البيانات اللي جاية من Firebase هي نفسها اللي حفظناها، متعملش حاجة
    if (saved && lastSavedRef.current && saved.updatedAt === lastSavedRef.current.updatedAt) {
      return;
    }

    if (saved) {
      setInEntries(saved.inEntries.length > 0 ? saved.inEntries : [{ id: '1', label: '', amount: 0 }]);
      setOutEntries(saved.outEntries.length > 0 ? saved.outEntries : [{ id: '1', label: '', amount: 0 }]);
      setActualBalance(saved.actualBalance ? String(saved.actualBalance) : '');
      setActualBalanceBank(saved.actualBalanceBank ? String(saved.actualBalanceBank) : '');
      setClosingTime(saved.closingTime || null);
      setClosingNote(saved.closingNote || '');
    } else {
      setInEntries([{ id: '1', label: '', amount: 0 }]);
      setOutEntries([{ id: '1', label: '', amount: 0 }]);
      setActualBalance('');
      setActualBalanceBank('');
      setClosingTime(null);
      setClosingNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, journals]);

  // ✅ Auto-save مع Debounce (نص ثانية)
  useEffect(() => {
    // ✅ لو مفيش أي بيانات، متحفظش
    const hasData =
      inEntries.some(e => e.label || e.amount > 0) ||
      outEntries.some(e => e.label || e.amount > 0) ||
      actualBalance !== '' || actualBalanceBank !== '';
    if (!hasData) return;

    // ✅ امسح أي timer قديم
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // ✅ استنى 500ms بعد آخر تغيير
    saveTimerRef.current = setTimeout(() => {
      const journal: DailyJournalType = {
        id: date,
        date,
        openingBalance: autoCalc.cash.openingAuto,
        inEntries,
        outEntries,
        actualBalance: parseFloat(actualBalance) || 0,
        actualBalanceBank: parseFloat(actualBalanceBank) || 0,
        closingTime: closingTime || undefined,
        closingNote: closingNote || undefined,
        updatedAt: new Date().toISOString(),
      };
      lastSavedRef.current = journal;
      onSaveRef.current(journal);
    }, 500);

    // ✅ Cleanup عند إلغاء الـ effect
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, inEntries, outEntries, actualBalance, actualBalanceBank, closingTime, closingNote, autoCalc.cash.openingAuto]);

  const inRefs = useRef<(HTMLInputElement | null)[]>([]);
  const outRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx === inEntries.length - 1) {
        addIn();
        setTimeout(() => { inRefs.current[idx + 1]?.focus(); }, 50);
      } else {
        inRefs.current[idx + 1]?.focus();
      }
    }
  };

  const handleOutKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx === outEntries.length - 1) {
        addOut();
        setTimeout(() => { outRefs.current[idx + 1]?.focus(); }, 50);
      } else {
        outRefs.current[idx + 1]?.focus();
      }
    }
  };

  const addIn = () => setInEntries(prev => [...prev, { id: generateId(), label: '', amount: 0 }]);
  const addOut = () => setOutEntries(prev => [...prev, { id: generateId(), label: '', amount: 0 }]);
  const removeIn = (id: string) => setInEntries(prev => prev.filter(e => e.id !== id));
  const removeOut = (id: string) => setOutEntries(prev => prev.filter(e => e.id !== id));

  const updateIn = (id: string, field: 'label' | 'amount', value: string) => {
    setInEntries(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : e
    ));
  };
  const updateOut = (id: string, field: 'label' | 'amount', value: string) => {
    setOutEntries(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : e
    ));
  };

  const totalIn = inEntries.reduce((s, e) => s + e.amount, 0);
  const totalOut = outEntries.reduce((s, e) => s + e.amount, 0);
  const actual = parseFloat(actualBalance) || 0;

  // ✅ الحساب التلقائي: بيقرا من نفس سجل حركات الخزينة اللي بيتغذى منه كل رصيد في النظام
  // فبيبقى مطابق 100% لأي رصيد ظاهر في أي مكان تاني (كشف حساب، خزينة، أرباح...)
  const autoCalc = useMemo(() => {
    const build = (treasury: 'cash' | 'bank') => {
      const before = treasuryTransactions.filter(t => t.treasury === treasury && t.date < date);
      const today = treasuryTransactions.filter(t => t.treasury === treasury && t.date === date);
      const openingAuto = before.reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0);
      const byType: Record<string, { in: number; out: number }> = {};
      today.forEach(t => {
        if (!byType[t.type]) byType[t.type] = { in: 0, out: 0 };
        if (t.direction === 'in') byType[t.type].in += t.amount;
        else byType[t.type].out += t.amount;
      });
      const netToday = today.reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0);
      const expectedClosing = openingAuto + netToday;
      return { openingAuto, byType, netToday, expectedClosing };
    };
    return { cash: build('cash'), bank: build('bank') };
  }, [treasuryTransactions, date]);

  // ✅ الرصيد النهائي المتوقع = المحسوب تلقائيًا من الفواتير والحركات + أي بند يدوي استثنائي (لو كتبت حاجة)
  // البنود اليدوية دلوقتي مخصصة بس لحاجات خارج النظام (سلفة شخصية مثلًا) - مش لتكرار المبيعات/المصاريف
  const expected = autoCalc.cash.expectedClosing + totalIn - totalOut;
  const diff = actual - expected;
  const bankActualNum = parseFloat(actualBalanceBank) || 0;
  const diffBank = bankActualNum - autoCalc.bank.expectedClosing;

  const handleClosing = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    setClosingTime(timeStr);
  };

  const handleReset = () => {
    if (!window.confirm('هتمسح بيانات هذا اليوم؟')) return;
    setInEntries([{ id: '1', label: '', amount: 0 }]);
    setOutEntries([{ id: '1', label: '', amount: 0 }]);
    setActualBalance('');
    setActualBalanceBank('');
    setClosingTime(null);
    setClosingNote('');
  };

  const handlePrint = () => {
    const inRows = inEntries.filter(e => e.amount > 0).map(e =>
      '<tr><td>' + (e.label || '—') + '</td><td style="text-align:left;color:#16a34a">+' + e.amount.toLocaleString('ar-EG') + '</td></tr>'
    ).join('');
    const outRows = outEntries.filter(e => e.amount > 0).map(e =>
      '<tr><td>' + (e.label || '—') + '</td><td style="text-align:left;color:#ef4444">-' + e.amount.toLocaleString('ar-EG') + '</td></tr>'
    ).join('');
    const autoCashRows = Object.entries(autoCalc.cash.byType).map(([type, v]) =>
      '<tr><td>' + (TYPE_LABELS[type] || type) + '</td><td style="text-align:left">' +
      (v.in > 0 ? '<span style="color:#16a34a">+' + v.in.toLocaleString('ar-EG') + '</span> ' : '') +
      (v.out > 0 ? '<span style="color:#ef4444">-' + v.out.toLocaleString('ar-EG') + '</span>' : '') +
      '</td></tr>'
    ).join('');
    const autoBankRows = Object.entries(autoCalc.bank.byType).map(([type, v]) =>
      '<tr><td>' + (TYPE_LABELS[type] || type) + '</td><td style="text-align:left">' +
      (v.in > 0 ? '<span style="color:#16a34a">+' + v.in.toLocaleString('ar-EG') + '</span> ' : '') +
      (v.out > 0 ? '<span style="color:#ef4444">-' + v.out.toLocaleString('ar-EG') + '</span>' : '') +
      '</td></tr>'
    ).join('');

    const diffText = diff === 0 ? '✅ مظبوط'
      : diff > 0 ? ('📈 أوفر +' + diff.toLocaleString('ar-EG'))
      : ('🔴 عجز ' + diff.toLocaleString('ar-EG'));

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      '<html dir="rtl"><head><meta charset="utf-8"/><title>تقفيل يوم ' + date + '</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:20px;font-size:14px}h2{text-align:center;margin-bottom:4px}' +
      'p{text-align:center;color:#666;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin-bottom:12px}' +
      'th{background:#f3f4f6;padding:8px;border:1px solid #ddd}td{padding:6px 8px;border:1px solid #eee}' +
      '.summary{background:#f9fafb;padding:12px;border-radius:8px;margin-top:12px}' +
      '.summary div{display:flex;justify-content:space-between;padding:4px 0}' +
      '.diff{font-size:18px;font-weight:bold;text-align:center;margin-top:12px;padding:10px;border-radius:8px;background:#f0fdf4}</style></head><body>' +
      '<h2>ONE - تقفيل اليومية</h2>' +
      '<p>يوم: ' + date + (closingTime ? ' | وقت التقفيل: ' + closingTime : '') + '</p>' +
      '<h3>💵 حركة الكاش التلقائية</h3>' +
      '<table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>' +
      (autoCashRows || '<tr><td colspan="2" style="text-align:center;color:#999">لا يوجد</td></tr>') +
      '</tbody></table>' +
      (Object.keys(autoCalc.bank.byType).length > 0 ?
        '<h3>🏦 حركة البنك التلقائية</h3><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>' + autoBankRows + '</tbody></table>' : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<div><h3 style="color:#16a34a">📥 بند إضافي داخل</h3><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>' +
      (inRows || '<tr><td colspan="2" style="text-align:center;color:#999">لا يوجد</td></tr>') +
      '</tbody></table><div style="text-align:left;font-weight:bold;color:#16a34a">الإجمالي: ' + totalIn.toLocaleString('ar-EG') + '</div></div>' +
      '<div><h3 style="color:#dc2626">📤 بند إضافي خارج</h3><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>' +
      (outRows || '<tr><td colspan="2" style="text-align:center;color:#999">لا يوجد</td></tr>') +
      '</tbody></table><div style="text-align:left;font-weight:bold;color:#dc2626">الإجمالي: ' + totalOut.toLocaleString('ar-EG') + '</div></div>' +
      '</div>' +
      '<div class="summary"><div><span>رصيد أول اليوم (كاش)</span><span>' + autoCalc.cash.openingAuto.toLocaleString('ar-EG') + '</span></div>' +
      '<div style="font-weight:bold;border-top:1px solid #ddd;margin-top:8px;padding-top:8px"><span>المفروض يتبقى (كاش)</span><span>' + expected.toLocaleString('ar-EG') + '</span></div>' +
      '<div><span>رصيد الدرج الفعلي (كاش)</span><span>' + actual.toLocaleString('ar-EG') + '</span></div></div>' +
      '<div class="diff">' + diffText + '</div>' +
      (actualBalanceBank !== '' ?
        '<div class="summary" style="margin-top:16px"><div style="font-weight:bold"><span>المفروض يتبقى (بنك)</span><span>' + autoCalc.bank.expectedClosing.toLocaleString('ar-EG') + '</span></div>' +
        '<div><span>رصيد البنك الفعلي</span><span>' + bankActualNum.toLocaleString('ar-EG') + '</span></div></div>' : '') +
      '<script>window.print();window.close();</script></body></html>'
    );
    win.document.close();
  };

  const savedDates = Object.keys(journalsByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📒 دفتر اليومية</h2>
          <p className="text-gray-500 text-sm">تقفيل الدرج اليومي - يحفظ تلقائياً على كل الأجهزة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`btn-secondary flex items-center gap-2 text-sm ${showHistory ? 'bg-violet-700/20 border-violet-700/40 text-violet-300' : ''}`}
          >
            🗂️ الأيام المحفوظة ({savedDates.length})
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer size={15} /> طباعة
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-xl border border-red-700/40 text-red-400 text-sm hover:bg-red-900/20 transition-colors"
          >
            🗑️ مسح
          </button>
        </div>
      </div>

      {/* الأيام المحفوظة */}
      {showHistory && (
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4">
          <h3 className="font-bold text-white mb-3">🗂️ الأيام المحفوظة</h3>
          {savedDates.length === 0 ? (
            <div className="text-center text-gray-500 py-4">لا توجد أيام محفوظة بعد</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {savedDates.map(d => {
                const j = journalsByDate[d];
                const jIn = j.inEntries.reduce((s, e) => s + e.amount, 0);
                const jOut = j.outEntries.reduce((s, e) => s + e.amount, 0);
                const jExpected = j.openingBalance + jIn - jOut;
                const jDiff = j.actualBalance - jExpected;
                const isSelected = d === date;

                return (
                  <button
                    key={d}
                    onClick={() => { setDate(d); setShowHistory(false); }}
                    className={`text-right p-3 rounded-xl border transition-colors ${
                      isSelected ? 'bg-violet-700/20 border-violet-500/40' : 'bg-[#12122a] border-white/10 hover:border-violet-700/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm font-medium">{d}</span>
                      {j.closingTime && (
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {j.closingTime}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-400">+{jIn.toLocaleString('ar-EG')}</span>
                      <span className="text-red-400">-{jOut.toLocaleString('ar-EG')}</span>
                      <span className={
                        j.actualBalance === 0 ? 'text-gray-500' :
                        Math.abs(jDiff) < 1 ? 'text-green-400 font-bold' :
                        jDiff > 0 ? 'text-yellow-400 font-bold' : 'text-red-400 font-bold'
                      }>
                        {j.actualBalance === 0 ? '—' :
                         Math.abs(jDiff) < 1 ? '✓ مظبوط' :
                         jDiff > 0 ? ('+' + Math.abs(jDiff).toLocaleString('ar-EG')) :
                         ('-' + Math.abs(jDiff).toLocaleString('ar-EG'))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* التاريخ + رصيد أول اليوم (تلقائي) */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">📅 تاريخ اليوم</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-dark w-full" />
          </div>
          <div>
            <label className="form-label">💰 رصيد أول اليوم (الدرج) - تلقائي</label>
            <div className="input-dark w-full flex items-center text-violet-300 font-bold">
              {formatCurrency(autoCalc.cash.openingAuto)}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          🔄 الرصيد ده بيتحسب لوحده من كل حركات الأمس وقبله (مبيعات، مشتريات، مصاريف، دفعات) - مفيش داعي تكتبه يدوي.
        </p>
        {closingTime && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-700/30 rounded-xl px-3 py-2">
            <Clock size={14} />
            <span>تم التقفيل الساعة {closingTime}</span>
            {closingNote && <span className="text-gray-400 mr-2">- {closingNote}</span>}
            <button onClick={() => { setClosingTime(null); setClosingNote(''); }} className="mr-auto text-gray-500 hover:text-red-400"><X size={12} /></button>
          </div>
        )}
      </div>

      {/* ✅ حركة اليوم التلقائية - نفس الأرقام اللي في كشف الحساب والخزينة بالظبط */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['cash', 'bank'] as const).map(treasury => {
          const calc = autoCalc[treasury];
          const hasMovement = Object.keys(calc.byType).length > 0;
          return (
            <div key={treasury} className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 space-y-2">
              <h3 className="font-bold text-white flex items-center gap-2">
                {treasury === 'cash' ? '💵 حركة الكاش اليوم (تلقائي)' : '🏦 حركة البنك اليوم (تلقائي)'}
              </h3>
              {!hasMovement && <p className="text-xs text-gray-500">مفيش حركات مسجلة في التاريخ ده</p>}
              {Object.entries(calc.byType).map(([type, v]) => (
                <div key={type} className="flex justify-between text-sm py-1 border-b border-white/5">
                  <span className="text-gray-400">{TYPE_LABELS[type] || type}</span>
                  <span>
                    {v.in > 0 && <span className="text-green-400">+{v.in.toLocaleString('ar-EG')}</span>}
                    {v.in > 0 && v.out > 0 && <span className="text-gray-600"> / </span>}
                    {v.out > 0 && <span className="text-red-400">-{v.out.toLocaleString('ar-EG')}</span>}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold">
                <span className="text-gray-300 text-sm">صافي اليوم</span>
                <span className={calc.netToday >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {calc.netToday >= 0 ? '+' : ''}{formatCurrency(calc.netToday)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-violet-300 border-t border-white/10 pt-2">
                <span>المتوقع آخر اليوم</span>
                <span className="font-bold">{formatCurrency(calc.expectedClosing)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* الداخل والخارج - بنود استثنائية بس، مش تكرار للمبيعات/المشتريات */}
      <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300">
        ℹ️ القسم اللي تحت ده لبنود استثنائية بس (زي سلفة شخصية أو حاجة مش متسجلة في النظام). مبيعاتك ومشترياتك ومصاريفك بتتحسب لوحدها فوق - متكتبهاش هنا تاني عشان منضربش الرقم مرتين.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* الداخل */}
        <div className="bg-[#1a1a35] border border-green-900/30 rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-green-400">📥 بند إضافي داخل (استثنائي)</h3>
          <div className="space-y-2">
            {inEntries.map((entry, idx) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="text-gray-600 text-xs w-5 text-center flex-shrink-0">{idx + 1}</span>
                <input type="text" value={entry.label} onChange={e => updateIn(entry.id, 'label', e.target.value)} className="input-dark text-sm flex-[2]" placeholder="البند..." />
                <input
                  ref={el => { inRefs.current[idx] = el; }}
                  type="number" value={entry.amount || ''} onChange={e => updateIn(entry.id, 'amount', e.target.value)}
                  onKeyDown={e => handleInKeyDown(e, idx)} className="input-dark text-sm text-green-400 font-mono flex-[1] min-w-0" placeholder="0"
                />
                {inEntries.length > 1 && (
                  <button onClick={() => removeIn(entry.id)} className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 flex-shrink-0"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addIn} className="w-full py-2 border border-dashed border-green-800/50 rounded-xl text-green-600 hover:text-green-400 hover:border-green-700/60 text-sm flex items-center justify-center gap-1 transition-colors">
            <Plus size={14} /> إضافة بند
          </button>
          <div className="border-t border-green-900/30 pt-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">إجمالي الداخل</span>
            <span className="text-green-400 font-black text-xl">+{formatCurrency(totalIn)}</span>
          </div>
        </div>

        {/* الخارج */}
        <div className="bg-[#1a1a35] border border-red-900/30 rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-red-400">📤 بند إضافي خارج (استثنائي)</h3>
          <div className="space-y-2">
            {outEntries.map((entry, idx) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="text-gray-600 text-xs w-5 text-center flex-shrink-0">{idx + 1}</span>
                <input type="text" value={entry.label} onChange={e => updateOut(entry.id, 'label', e.target.value)} className="input-dark text-sm flex-[2]" placeholder="البند..." />
                <input
                  ref={el => { outRefs.current[idx] = el; }}
                  type="number" value={entry.amount || ''} onChange={e => updateOut(entry.id, 'amount', e.target.value)}
                  onKeyDown={e => handleOutKeyDown(e, idx)} className="input-dark text-sm text-red-400 font-mono flex-[1] min-w-0" placeholder="0"
                />
                {outEntries.length > 1 && (
                  <button onClick={() => removeOut(entry.id)} className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 flex-shrink-0"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addOut} className="w-full py-2 border border-dashed border-red-800/50 rounded-xl text-red-600 hover:text-red-400 hover:border-red-700/60 text-sm flex items-center justify-center gap-1 transition-colors">
            <Plus size={14} /> إضافة بند
          </button>
          <div className="border-t border-red-900/30 pt-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">إجمالي الخارج</span>
            <span className="text-red-400 font-black text-xl">-{formatCurrency(totalOut)}</span>
          </div>
        </div>
      </div>

      {/* ملخص التقفيل - كاش */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-white">📊 ملخص تقفيل الكاش</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-400">رصيد أول اليوم (تلقائي)</span>
            <span className="text-white font-medium">{formatCurrency(autoCalc.cash.openingAuto)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-400">+ صافي حركة اليوم (تلقائي)</span>
            <span className={autoCalc.cash.netToday >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
              {autoCalc.cash.netToday >= 0 ? '+' : ''}{formatCurrency(autoCalc.cash.netToday)}
            </span>
          </div>
          {(totalIn > 0 || totalOut > 0) && (
            <>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">+ بنود إضافية داخلة</span>
                <span className="text-green-400 font-medium">+{formatCurrency(totalIn)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">- بنود إضافية خارجة</span>
                <span className="text-red-400 font-medium">-{formatCurrency(totalOut)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between py-2 border-t border-white/10 font-bold">
            <span className="text-white">المفروض يتبقى في الدرج</span>
            <span className="text-violet-400 text-lg">{formatCurrency(expected)}</span>
          </div>
        </div>

        <div className="bg-[#12122a] rounded-xl p-3">
          <label className="form-label">🪙 رصيد الدرج الفعلي (اللي عدّيته)</label>
          <input type="number" value={actualBalance} onChange={e => setActualBalance(e.target.value)} className="input-dark w-full text-lg font-mono" placeholder="اكتب الرصيد الفعلي..." />
        </div>

        {actualBalance !== '' && (
          <div className={
            'rounded-xl p-4 border ' +
            (diff === 0 ? 'bg-green-900/20 border-green-700/40' : diff > 0 ? 'bg-yellow-900/20 border-yellow-700/40' : 'bg-red-900/20 border-red-700/40')
          }>
            <div className="text-center mb-3">
              <div className="text-3xl font-black mb-1">{diff === 0 ? '✅' : diff > 0 ? '📈' : '🔴'}</div>
              <div className={'text-xl font-black ' + (diff === 0 ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-red-400')}>
                {diff === 0 ? 'مظبوط تماماً!' : diff > 0 ? ('أوفر +' + formatCurrency(diff)) : ('عجز ' + formatCurrency(Math.abs(diff)))}
              </div>
              <div className="text-gray-500 text-sm mt-1">
                {diff === 0 ? 'الدرج مظبوط 👍' : diff > 0 ? 'في فلوس زيادة في الدرج' : 'في فلوس ناقصة من الدرج'}
              </div>
            </div>

            {!closingTime ? (
              <div className="space-y-2">
                <input type="text" value={closingNote} onChange={e => setClosingNote(e.target.value)} className="input-dark w-full text-sm" placeholder="ملاحظة التقفيل (اختياري)..." />
                <button onClick={handleClosing} className="w-full py-2.5 bg-violet-700/40 border border-violet-500/50 rounded-xl text-violet-300 text-sm font-medium hover:bg-violet-700/60 transition-colors flex items-center justify-center gap-2">
                  <Clock size={15} /> تسجيل وقت التقفيل
                </button>
              </div>
            ) : (
              <div className="text-center bg-violet-900/20 border border-violet-700/30 rounded-xl py-2 px-3">
                <div className="flex items-center justify-center gap-2 text-violet-300 text-sm">
                  <Clock size={14} />
                  <span>تم التقفيل الساعة <strong>{closingTime}</strong></span>
                </div>
                {closingNote && <div className="text-gray-400 text-xs mt-1">{closingNote}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ملخص تقفيل البنك */}
      <div className="bg-[#1a1a35] border border-blue-900/30 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-white">🏦 ملخص تقفيل البنك</h3>
        <div className="flex justify-between py-2 text-sm font-bold">
          <span className="text-white">المفروض يتبقى في البنك</span>
          <span className="text-blue-400 text-lg">{formatCurrency(autoCalc.bank.expectedClosing)}</span>
        </div>
        <div className="bg-[#12122a] rounded-xl p-3">
          <label className="form-label">🏦 رصيد البنك الفعلي (من كشف الحساب/التطبيق)</label>
          <input type="number" value={actualBalanceBank} onChange={e => setActualBalanceBank(e.target.value)} className="input-dark w-full text-lg font-mono" placeholder="اكتب رصيد البنك الفعلي..." />
        </div>
        {actualBalanceBank !== '' && (
          <div className={
            'rounded-xl p-4 border text-center ' +
            (diffBank === 0 ? 'bg-green-900/20 border-green-700/40' : diffBank > 0 ? 'bg-yellow-900/20 border-yellow-700/40' : 'bg-red-900/20 border-red-700/40')
          }>
            <div className={'text-lg font-black ' + (diffBank === 0 ? 'text-green-400' : diffBank > 0 ? 'text-yellow-400' : 'text-red-400')}>
              {diffBank === 0 ? '✅ مظبوط تماماً!' : diffBank > 0 ? ('📈 أوفر +' + formatCurrency(diffBank)) : ('🔴 عجز ' + formatCurrency(Math.abs(diffBank)))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}