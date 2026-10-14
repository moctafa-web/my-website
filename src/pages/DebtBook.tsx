// src/pages/DebtBook.tsx
// صفحة دفتر الديون: قائمة التجار بالأرصدة مع بحث وترتيب وتبويبات (لينا / علينا)
// بدل المودال الطويل اللي كان لازم تعمل فيه سكرول. الأرصدة من نفس المصدر الموحّد (getPartyBalances).
import React, { useMemo, useState } from 'react';
import { AppState } from '../types';
import { formatCurrency, getTodayStr, printElement } from '../utils/helpers';
import { getPartyBalances } from '../store/domains/accounting.store';
import { Search, Copy, Check, Printer, X } from 'lucide-react';

interface Props {
  state: AppState;
  onAddPayment?: (p: any) => void;
  onOpenStatement?: (type: 'customer' | 'supplier', id: string) => void;
}

type Tab = 'owing' | 'owed';
type SortKey = 'amount' | 'oldest' | 'name';

const daysSince = (date?: string) => {
  if (!date) return null;
  const t = new Date(date + 'T00:00:00').getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

export default function DebtBook({ state, onAddPayment, onOpenStatement }: Props) {
  const balances = useMemo(() => getPartyBalances(state), [state]);
  const owingUs = balances.customersOwing;   // لينا عندهم
  const weOwe = balances.suppliersOwed;      // ليهم عندنا
  const totalOwing = balances.totalOwing;
  const totalOwed = balances.totalOwed;
  const net = totalOwing - totalOwed;

  const [tab, setTab] = useState<Tab>('owing');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('amount');
  const [lateOnly, setLateOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const [payParty, setPayParty] = useState<{ id: string; name: string } | null>(null);
  const [payDir, setPayDir] = useState<'in' | 'out'>('in');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'bank'>('cash');
  const [payDate, setPayDate] = useState(getTodayStr());
  const [payNotes, setPayNotes] = useState('');

  const list = tab === 'owing' ? owingUs : weOwe;
  const total = tab === 'owing' ? totalOwing : totalOwed;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = list.filter(x => !q || `${x.name} ${x.phone || ''}`.toLowerCase().includes(q));
    if (lateOnly) r = r.filter(x => (daysSince(x.oldestDueDate) ?? 0) > 30);
    const sorted = [...r];
    if (sort === 'amount') sorted.sort((a, b) => b.balance - a.balance);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    else sorted.sort((a, b) => (a.oldestDueDate || '9999-12-31').localeCompare(b.oldestDueDate || '9999-12-31') || b.balance - a.balance);
    return sorted;
  }, [list, search, sort, lateOnly]);

  // النسبة من إجمالي القائمة كلها (مش من أكبر تاجر): لو الإجمالي 100 وتاجر عليه 50 يبقى البار 50%
  const pct = (v: number) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);
  const pctLabel = (v: number) => { const x = pct(v); return x > 0 && x < 1 ? '<1%' : `${Math.round(x)}%`; };
  const shownTotal = rows.reduce((s, r) => s + r.balance, 0);
  const isGreen = tab === 'owing';
  const fmt = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 0 });

  const openPay = (p: { id: string; name: string }) => {
    setPayParty(p);
    setPayDir(tab === 'owing' ? 'in' : 'out');
    setPayAmount(''); setPayMethod('cash'); setPayDate(getTodayStr()); setPayNotes('');
  };

  const submitPay = () => {
    const amount = Number(payAmount);
    if (!payParty || !(amount > 0) || !onAddPayment) return;
    onAddPayment({
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: payDir === 'in' ? 'sale' : 'purchase',
      referenceId: payParty.id,
      referenceName: payParty.name,
      amount,
      paymentMethod: payMethod,
      direction: payDir,
      date: payDate || getTodayStr(),
      notes: payNotes.trim(),
      createdAt: new Date().toISOString(),
    });
    setPayParty(null);
  };

  const title = isGreen ? 'لنا عندهم فلوس' : 'لهم عندنا فلوس';

  const copyList = async () => {
    let msg = `📒 دفتر الديون — ${title}\n🗓️ ${new Date().toLocaleDateString('ar-EG')}\n\n`;
    rows.forEach((r, i) => { msg += `${i + 1}) ${r.name} - ${fmt(r.balance)} ج.م\n`; });
    msg += `\nالإجمالي: ${fmt(shownTotal)} ج.م`;
    try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const printList = () => {
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td style="font-weight:bold">${fmt(r.balance)} ج.م</td></tr>`).join('');
    printElement(`<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;padding:8mm">
      <h2 style="margin:0 0 4px">📒 دفتر الديون — ${title}</h2>
      <div style="color:#666;font-size:12px;margin-bottom:10px">${new Date().toLocaleDateString('ar-EG')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px" border="1" cellpadding="6">
        <thead><tr style="background:#eee"><th>#</th><th>الاسم</th><th>المبلغ</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr style="font-weight:bold"><td colspan="2">الإجمالي</td><td>${fmt(shownTotal)} ج.م</td></tr></tfoot>
      </table></div>`, `دفتر الديون - ${title}`);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">📒 دفتر الديون</h1>
        <div className="flex gap-2">
          <button onClick={copyList} className="btn-secondary flex items-center gap-1 text-sm">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'تم النسخ' : 'نسخ للواتساب'}
          </button>
          <button onClick={printList} className="btn-secondary flex items-center gap-1 text-sm"><Printer size={15} /> طباعة</button>
        </div>
      </div>

      {/* الملخص + التبويبات */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setTab('owing')}
          className={`rounded-xl p-3 text-center border transition-all ${tab === 'owing' ? 'bg-green-900/30 border-green-500/60 ring-1 ring-green-500/40' : 'bg-green-900/10 border-green-700/30 hover:bg-green-900/20'}`}>
          <div className="text-xs text-green-400 mb-1">💚 لينا عندهم</div>
          <div className="text-lg font-black text-green-300">{formatCurrency(totalOwing)}</div>
          <div className="text-xs text-green-600">{owingUs.length} جهة</div>
        </button>
        <button onClick={() => setTab('owed')}
          className={`rounded-xl p-3 text-center border transition-all ${tab === 'owed' ? 'bg-red-900/30 border-red-500/60 ring-1 ring-red-500/40' : 'bg-red-900/10 border-red-700/30 hover:bg-red-900/20'}`}>
          <div className="text-xs text-red-400 mb-1">❤️ ليهم عندنا</div>
          <div className="text-lg font-black text-red-300">{formatCurrency(totalOwed)}</div>
          <div className="text-xs text-red-600">{weOwe.length} جهة</div>
        </button>
        <div className="rounded-xl p-3 text-center border bg-blue-900/10 border-blue-700/30">
          <div className="text-xs text-blue-400 mb-1">📊 الصافي</div>
          <div className={`text-lg font-black ${net >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(Math.abs(net))}</div>
          <div className={`text-xs ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{net >= 0 ? 'لصالحنا ✅' : 'علينا ⚠️'}</div>
        </div>
      </div>

      {/* بحث + ترتيب + فلتر */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم التاجر أو رقمه..."
            className="input-dark w-full pr-9" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><X size={15} /></button>
          )}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="input-dark">
          <option value="amount">الترتيب: الأكبر مبلغاً</option>
          <option value="oldest">الترتيب: الأقدم مديونية</option>
          <option value="name">الترتيب: الاسم</option>
        </select>
        <button onClick={() => setLateOnly(v => !v)}
          className={`px-3 py-2 rounded-xl border text-sm ${lateOnly ? 'bg-amber-600/30 border-amber-500/60 text-amber-200' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
          ⏰ متأخر +30 يوم
        </button>
      </div>

      <div className="text-xs text-gray-400 px-1">
        {isGreen ? '💚' : '❤️'} {title} — ظاهر {rows.length} من {list.length} · إجمالي الظاهر {formatCurrency(shownTotal)}
        {total > 0 && rows.length !== list.length ? ` (${Math.round((shownTotal / total) * 100)}% من الإجمالي)` : ''}
      </div>

      {/* القائمة */}
      <div className="border border-border rounded-2xl overflow-hidden bg-surface">
        <div className="hidden sm:grid grid-cols-[2.5rem_1fr_9rem_6rem_12rem] gap-2 px-4 py-2 text-xs text-gray-500 bg-white/5 border-b border-border">
          <div>#</div><div>التاجر</div><div className="text-center">المبلغ</div><div className="text-center">أقدم فاتورة</div><div className="text-center">إجراءات</div>
        </div>
        <div className="max-h-[calc(100dvh-24rem)] min-h-[200px] overflow-y-auto divide-y divide-border/60">
          {rows.length === 0 && (
            <div className="text-center text-gray-500 py-10 text-sm">
              {list.length === 0 ? (isGreen ? '🎉 ما فيش ديون لينا' : '🎉 ما فيش ديون علينا') : 'مفيش نتائج مطابقة'}
            </div>
          )}
          {rows.map((r, idx) => {
            const age = daysSince(r.oldestDueDate);
            const ageCls = age === null ? 'text-gray-600' : age > 60 ? 'text-red-300 bg-red-900/30' : age > 30 ? 'text-amber-300 bg-amber-900/30' : 'text-gray-300 bg-white/5';
            return (
              <div key={r.id} className="grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_9rem_6rem_12rem] gap-x-2 gap-y-1 items-center px-4 py-2.5 hover:bg-white/[.03]">
                <div className="text-xs text-gray-500">{idx + 1}</div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{r.name}</div>
                  {r.phone && <div className="text-xs text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{r.phone}</div>}
                </div>
                <div className="col-span-2 sm:col-span-1 sm:text-center">
                  <div className={`text-base font-black ${isGreen ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(r.balance)}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full ${isGreen ? 'bg-green-500/70' : 'bg-red-500/70'}`} style={{ width: `${pct(r.balance)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 w-8 text-left">{pctLabel(r.balance)}</span>
                  </div>
                </div>
                <div className="sm:text-center">
                  {age === null ? <span className="text-xs text-gray-600">—</span>
                    : <span className={`text-xs px-2 py-0.5 rounded-full ${ageCls}`}>{age === 0 ? 'النهارده' : `${age} يوم`}</span>}
                </div>
                <div className="flex gap-1.5 sm:justify-center col-span-2 sm:col-span-1">
                  {onAddPayment && (
                    <button onClick={() => openPay(r)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${isGreen ? 'text-green-300 bg-green-900/20 hover:bg-green-900/40' : 'text-red-300 bg-red-900/20 hover:bg-red-900/40'}`}>
                      {isGreen ? 'دخول دفعة' : 'خروج دفعة'}
                    </button>
                  )}
                  <button onClick={() => onOpenStatement?.(r.type, r.id)}
                    className="text-xs text-violet-300 bg-violet-900/20 hover:bg-violet-900/40 px-3 py-1.5 rounded-lg transition-colors">
                    كشف حساب
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {payParty && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4" onClick={() => setPayParty(null)}>
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-1">💰 تسجيل دفعة — {payParty.name}</h3>
            <p className="text-xs text-gray-400 mb-4">{payDir === 'in' ? 'دخول دفعة من التاجر' : 'خروج دفعة للتاجر'}</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => setPayDir('in')} className={`py-2 rounded-xl border text-sm ${payDir === 'in' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>⬅️ دخول دفعة</button>
              <button onClick={() => setPayDir('out')} className={`py-2 rounded-xl border text-sm ${payDir === 'out' ? 'bg-red-700/30 border-red-500/50 text-red-300' : 'border-white/10 text-gray-400'}`}>➡️ خروج دفعة</button>
            </div>
            <div className="space-y-3">
              <input type="number" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="input-dark w-full" placeholder="المبلغ" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPayMethod('cash')} className={`py-2 rounded-xl border text-sm ${payMethod === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 كاش</button>
                <button onClick={() => setPayMethod('bank')} className={`py-2 rounded-xl border text-sm ${payMethod === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 بنك</button>
              </div>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="input-dark w-full" />
              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className="input-dark w-full" placeholder="ملاحظات اختيارية" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={submitPay} disabled={!(Number(payAmount) > 0)} className="btn-primary flex-1 disabled:opacity-50">✅ تأكيد الدفعة</button>
              <button onClick={() => setPayParty(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
