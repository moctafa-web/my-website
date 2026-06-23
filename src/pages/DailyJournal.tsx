import React, { useState } from 'react';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import { Plus, X, Printer } from 'lucide-react';

interface JournalEntry {
  id: string;
  label: string;
  amount: number;
}

export default function DailyJournal() {
  const [date, setDate] = useState(getTodayStr());
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualBalance, setActualBalance] = useState('');

  // بنود الداخل
  const [inEntries, setInEntries] = useState<JournalEntry[]>([
    { id: '1', label: '', amount: 0 },
  ]);

  // بنود الخارج
  const [outEntries, setOutEntries] = useState<JournalEntry[]>([
    { id: '1', label: '', amount: 0 },
  ]);

  // إضافة بند
  const addIn = () => setInEntries(prev => [...prev, { id: Date.now().toString(), label: '', amount: 0 }]);
  const addOut = () => setOutEntries(prev => [...prev, { id: Date.now().toString(), label: '', amount: 0 }]);

  // حذف بند
  const removeIn = (id: string) => setInEntries(prev => prev.filter(e => e.id !== id));
  const removeOut = (id: string) => setOutEntries(prev => prev.filter(e => e.id !== id));

  // تعديل بند
  const updateIn = (id: string, field: 'label' | 'amount', value: string) => {
    setInEntries(prev => prev.map(e => e.id === id
      ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
      : e
    ));
  };
  const updateOut = (id: string, field: 'label' | 'amount', value: string) => {
    setOutEntries(prev => prev.map(e => e.id === id
      ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
      : e
    ));
  };

  // الحسابات
  const opening = parseFloat(openingBalance) || 0;
  const totalIn = inEntries.reduce((s, e) => s + e.amount, 0);
  const totalOut = outEntries.reduce((s, e) => s + e.amount, 0);
  const expected = opening + totalIn - totalOut;
  const actual = parseFloat(actualBalance) || 0;
  const diff = actual - expected;

  // إعادة تعيين
  const handleReset = () => {
    if (!window.confirm('هتمسح كل البيانات؟')) return;
    setOpeningBalance('');
    setActualBalance('');
    setInEntries([{ id: '1', label: '', amount: 0 }]);
    setOutEntries([{ id: '1', label: '', amount: 0 }]);
    setDate(getTodayStr());
  };

  // طباعة
  const handlePrint = () => {
    const inRows = inEntries.filter(e => e.amount > 0).map(e =>
      `<tr><td>${e.label || '—'}</td><td style="text-align:left;color:#22c55e">+${e.amount.toLocaleString('ar-EG')}</td></tr>`
    ).join('');
    const outRows = outEntries.filter(e => e.amount > 0).map(e =>
      `<tr><td>${e.label || '—'}</td><td style="text-align:left;color:#ef4444">-${e.amount.toLocaleString('ar-EG')}</td></tr>`
    ).join('');

    const diffText = diff === 0 ? '✅ مظبوط'
      : diff > 0 ? `📈 أوفر +${diff.toLocaleString('ar-EG')}`
      : `🔴 عجز ${diff.toLocaleString('ar-EG')}`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html dir="rtl">
      <head>
        <meta charset="utf-8"/>
        <title>تقفيل يوم ${date}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 14px; }
          h2 { text-align: center; margin-bottom: 4px; }
          p { text-align: center; color: #666; margin: 0 0 16px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f3f4f6; padding: 8px; border: 1px solid #ddd; }
          td { padding: 6px 8px; border: 1px solid #eee; }
          .summary { background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 12px; }
          .summary div { display: flex; justify-content: space-between; padding: 4px 0; }
          .diff { font-size: 18px; font-weight: bold; text-align: center; margin-top: 12px; padding: 10px; border-radius: 8px; background: #f0fdf4; }
        </style>
      </head>
      <body>
        <h2>ONE - تقفيل اليومية</h2>
        <p>يوم: ${date}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <h3 style="color:#16a34a">📥 الداخل</h3>
            <table>
              <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
              <tbody>${inRows || '<tr><td colspan="2" style="text-align:center;color:#999">لا يوجد</td></tr>'}</tbody>
            </table>
            <div style="text-align:left;font-weight:bold;color:#16a34a">الإجمالي: ${totalIn.toLocaleString('ar-EG')}</div>
          </div>
          <div>
            <h3 style="color:#dc2626">📤 الخارج</h3>
            <table>
              <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
              <tbody>${outRows || '<tr><td colspan="2" style="text-align:center;color:#999">لا يوجد</td></tr>'}</tbody>
            </table>
            <div style="text-align:left;font-weight:bold;color:#dc2626">الإجمالي: ${totalOut.toLocaleString('ar-EG')}</div>
          </div>
        </div>
        <div class="summary">
          <div><span>رصيد أول اليوم</span><span>${opening.toLocaleString('ar-EG')}</span></div>
          <div><span>+ إجمالي الداخل</span><span style="color:#16a34a">${totalIn.toLocaleString('ar-EG')}</span></div>
          <div><span>- إجمالي الخارج</span><span style="color:#dc2626">${totalOut.toLocaleString('ar-EG')}</span></div>
          <div style="font-weight:bold;border-top:1px solid #ddd;margin-top:8px;padding-top:8px">
            <span>المفروض يتبقى</span><span>${expected.toLocaleString('ar-EG')}</span>
          </div>
          <div><span>رصيد الدرج الفعلي</span><span>${actual.toLocaleString('ar-EG')}</span></div>
        </div>
        <div class="diff">${diffText}</div>
        <script>window.print(); window.close();</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📒 دفتر اليومية</h2>
          <p className="text-gray-500 text-sm">تقفيل الدرج اليومي</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer size={15} /> طباعة
          </button>
          <button onClick={handleReset} className="px-3 py-2 rounded-xl border border-red-700/40 text-red-400 text-sm hover:bg-red-900/20 transition-colors">
            🗑️ مسح الكل
          </button>
        </div>
      </div>

      {/* التاريخ + رصيد أول اليوم */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">📅 تاريخ اليوم</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input-dark w-full"
            />
          </div>
          <div>
            <label className="form-label">💰 رصيد أول اليوم (الدرج)</label>
            <input
              type="number"
              value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)}
              className="input-dark w-full"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* الداخل والخارج */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 📥 الداخل */}
        <div className="bg-[#1a1a35] border border-green-900/30 rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-green-400 flex items-center gap-2">
            📥 الداخل
          </h3>

          <div className="space-y-2">
            {inEntries.map((entry, idx) => (
              <div key={entry.id} className="flex items-center gap-2">
                {/* رقم البند */}
                <span className="text-gray-600 text-xs w-4 text-center">{idx + 1}</span>
                {/* البند (اختياري) */}
                <input
                  type="text"
                  value={entry.label}
                  onChange={e => updateIn(entry.id, 'label', e.target.value)}
                  className="input-dark flex-1 text-sm"
                  placeholder="البند (اختياري)"
                />
                {/* المبلغ */}
                <input
                  type="number"
                  value={entry.amount || ''}
                  onChange={e => updateIn(entry.id, 'amount', e.target.value)}
                  className="input-dark w-28 text-sm text-green-400 font-mono"
                  placeholder="0"
                />
                {/* حذف */}
                {inEntries.length > 1 && (
                  <button
                    onClick={() => removeIn(entry.id)}
                    className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addIn}
            className="w-full py-2 border border-dashed border-green-800/50 rounded-xl text-green-600 hover:text-green-400 hover:border-green-700/60 text-sm flex items-center justify-center gap-1 transition-colors"
          >
            <Plus size={14} /> إضافة بند
          </button>

          {/* إجمالي الداخل */}
          <div className="border-t border-green-900/30 pt-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">إجمالي الداخل</span>
            <span className="text-green-400 font-black text-xl">
              +{formatCurrency(totalIn)}
            </span>
          </div>
        </div>

        {/* 📤 الخارج */}
        <div className="bg-[#1a1a35] border border-red-900/30 rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-red-400 flex items-center gap-2">
            📤 الخارج
          </h3>

          <div className="space-y-2">
            {outEntries.map((entry, idx) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="text-gray-600 text-xs w-4 text-center">{idx + 1}</span>
                <input
                  type="text"
                  value={entry.label}
                  onChange={e => updateOut(entry.id, 'label', e.target.value)}
                  className="input-dark flex-1 text-sm"
                  placeholder="البند (اختياري)"
                />
                <input
                  type="number"
                  value={entry.amount || ''}
                  onChange={e => updateOut(entry.id, 'amount', e.target.value)}
                  className="input-dark w-28 text-sm text-red-400 font-mono"
                  placeholder="0"
                />
                {outEntries.length > 1 && (
                  <button
                    onClick={() => removeOut(entry.id)}
                    className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addOut}
            className="w-full py-2 border border-dashed border-red-800/50 rounded-xl text-red-600 hover:text-red-400 hover:border-red-700/60 text-sm flex items-center justify-center gap-1 transition-colors"
          >
            <Plus size={14} /> إضافة بند
          </button>

          <div className="border-t border-red-900/30 pt-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">إجمالي الخارج</span>
            <span className="text-red-400 font-black text-xl">
              -{formatCurrency(totalOut)}
            </span>
          </div>
        </div>
      </div>

      {/* ملخص التقفيل */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-white">📊 ملخص التقفيل</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-400">رصيد أول اليوم</span>
            <span className="text-white font-medium">{formatCurrency(opening)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-400">+ إجمالي الداخل</span>
            <span className="text-green-400 font-medium">+{formatCurrency(totalIn)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-400">- إجمالي الخارج</span>
            <span className="text-red-400 font-medium">-{formatCurrency(totalOut)}</span>
          </div>
          <div className="flex justify-between py-2 border-t border-white/10 font-bold">
            <span className="text-white">المفروض يتبقى</span>
            <span className="text-violet-400 text-lg">{formatCurrency(expected)}</span>
          </div>
        </div>

        {/* رصيد الدرج الفعلي */}
        <div className="bg-[#12122a] rounded-xl p-3">
          <label className="form-label">🪙 رصيد الدرج الفعلي (اللي عدّيته)</label>
          <input
            type="number"
            value={actualBalance}
            onChange={e => setActualBalance(e.target.value)}
            className="input-dark w-full text-lg font-mono"
            placeholder="اكتب الرصيد الفعلي..."
          />
        </div>

        {/* النتيجة */}
        {actualBalance !== '' && (
          <div className={`rounded-xl p-4 text-center border ${
            diff === 0
              ? 'bg-green-900/20 border-green-700/40'
              : diff > 0
              ? 'bg-yellow-900/20 border-yellow-700/40'
              : 'bg-red-900/20 border-red-700/40'
          }`}>
            <div className="text-3xl font-black mb-1">
              {diff === 0 ? '✅' : diff > 0 ? '📈' : '🔴'}
            </div>
            <div className={`text-xl font-black ${
              diff === 0 ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {diff === 0
                ? 'مظبوط تماماً!'
                : diff > 0
                ? `أوفر +${formatCurrency(diff)}`
                : `عجز ${formatCurrency(Math.abs(diff))}`
              }
            </div>
            <div className="text-gray-500 text-sm mt-1">
              {diff === 0
                ? 'الدرج مظبوط 👍'
                : diff > 0
                ? 'في فلوس زيادة في الدرج'
                : 'في فلوس ناقصة من الدرج'
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}