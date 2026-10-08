import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search } from 'lucide-react';
import { AppState } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import { buildProfitRows, channelLabel, groupByDocument, totalsOf, Channel, ProfitRow } from '../utils/profitReport';

const monthStart = () => getTodayStr().slice(0, 8) + '01';

type SortKey = 'date' | 'profit_desc' | 'profit_asc' | 'margin_desc';

export default function ProfitDetailReport({ state }: { state: AppState }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getTodayStr());
  const [channel, setChannel] = useState<Channel | 'all'>('all');
  const [view, setView] = useState<'invoice' | 'device'>('invoice');
  const [sort, setSort] = useState<SortKey>('date');
  const [search, setSearch] = useState('');

  const { rows: deviceRows, excludedCount } = useMemo(
    () => buildProfitRows(state, { from, to, channel }),
    [state, from, to, channel]
  );

  const shown = useMemo(() => {
    const base = view === 'invoice' ? groupByDocument(deviceRows) : deviceRows;
    const q = search.trim().toLowerCase();
    const filtered = !q ? base : base.filter(r =>
      r.docNumber.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) ||
      (r.serial || '').toLowerCase().includes(q) || (r.party || '').toLowerCase().includes(q));
    const margin = (r: ProfitRow) => (r.revenue > 0 ? r.profit / r.revenue : -1);
    return [...filtered].sort((a, b) =>
      sort === 'profit_desc' ? b.profit - a.profit :
      sort === 'profit_asc' ? a.profit - b.profit :
      sort === 'margin_desc' ? margin(b) - margin(a) :
      b.date.localeCompare(a.date));
  }, [deviceRows, view, search, sort]);

  const totals = useMemo(() => totalsOf(shown), [shown]);
  const totalProfit = totals.realizedProfit + totals.estimatedProfit;
  const marginPct = (r: { revenue: number; profit: number }) => (r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : '—');

  const exportExcel = () => {
    const data = shown.map(r => ({
      'التاريخ': r.date,
      'القناة': channelLabel(r.channel),
      [r.channel === 'offline' ? 'رقم الفاتورة' : 'رقم الأوردر']: r.docNumber,
      'العميل': r.party || '',
      'الصنف': r.product,
      ...(view === 'device' ? { 'السيريال': r.serial || '' } : {}),
      'الكمية': r.qty,
      'سعر البيع': r.revenue,
      'التكلفة': r.cost,
      'العمولة': r.commission === null ? 'لم يتسوَّ' : r.commission,
      'الربح': r.pendingCost ? 'تكلفة معلّقة' : r.profit,
      'الهامش %': r.pendingCost ? '' : r.revenue > 0 ? Number(((r.profit / r.revenue) * 100).toFixed(1)) : '',
      'الحالة': r.pendingCost ? 'تكلفة معلّقة' : r.estimated ? 'ربح متوقع' : 'محقق',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'الأرباح');
    XLSX.writeFile(wb, `تقرير-الأرباح-${view === 'invoice' ? 'حسب-الفاتورة' : 'حسب-الجهاز'}-${from || 'start'}_${to || 'today'}.xlsx`);
  };

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs border ${active ? 'bg-violet-700/30 border-violet-500/50 text-violet-200' : 'border-border text-gray-400 hover:bg-white/5'}`;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-bold text-white">📊 تقرير الأرباح التفصيلي</h3>
        <p className="text-xs text-gray-500 mt-1">
          الربح لكل فاتورة أو جهاز = سعر البيع − التكلفة − عمولة المنصة. عمولة نون/أمازون = سعر الأوردر − المبلغ اللي اتحوّل فعلاً، فبتظهر بعد التسوية البنكية.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">من</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-dark text-sm" />
        <span className="text-xs text-gray-400">إلى</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-dark text-sm" />
        <button onClick={() => { setFrom(getTodayStr()); setTo(getTodayStr()); }} className={pill(false)}>اليوم</button>
        <button onClick={() => { setFrom(monthStart()); setTo(getTodayStr()); }} className={pill(false)}>الشهر</button>
        <button onClick={() => { setFrom(''); setTo(''); }} className={pill(false)}>كل الفترات</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'كل القنوات'], ['offline', 'المحل'], ['noon', 'نون'], ['amazon', 'أمازون'], ['other', 'أخرى']] as [Channel | 'all', string][]).map(([k, l]) =>
          <button key={k} onClick={() => setChannel(k)} className={pill(channel === k)}>{l}</button>)}
        <span className="mx-1 text-border">|</span>
        <button onClick={() => setView('invoice')} className={pill(view === 'invoice')}>حسب الفاتورة / الأوردر</button>
        <button onClick={() => setView('device')} className={pill(view === 'device')}>حسب الجهاز</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'المبيعات', v: totals.revenue, c: 'text-blue-300' },
          { l: 'التكلفة', v: totals.cost, c: 'text-gray-300' },
          { l: 'عمولة المنصات', v: totals.commission, c: 'text-orange-300' },
          { l: 'الربح المحقق', v: totals.realizedProfit, c: totals.realizedProfit >= 0 ? 'text-green-300' : 'text-red-400' },
          { l: 'ربح متوقع (لم يُسوَّ)', v: totals.estimatedProfit, c: 'text-yellow-300' },
        ].map(x => (
          <div key={x.l} className="bg-muted-bg rounded-xl p-3 text-center">
            <div className={`text-lg font-black ${x.c}`}>{formatCurrency(x.v)}</div>
            <div className="text-xs text-gray-500 mt-1">{x.l}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400">
        الإجمالي (محقق + متوقع): <b className={totalProfit >= 0 ? 'text-green-300' : 'text-red-400'}>{formatCurrency(totalProfit)}</b>
        {totals.revenue > 0 && <> — هامش {((totalProfit / totals.revenue) * 100).toFixed(1)}%</>}
        {excludedCount > 0 && <> — تم استبعاد {excludedCount} أوردر ملغي/مرتجع</>}
        {totals.pendingCostCount > 0 && <span className="text-orange-300"> — {totals.pendingCostCount} صنف تكلفته معلّقة وغير محسوب في الربح</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الفاتورة/الأوردر أو الصنف أو السيريال أو العميل..." className="input-dark w-full pr-9 text-sm" />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="input-dark text-sm">
          <option value="date">الأحدث أولاً</option>
          <option value="profit_desc">الأعلى ربحاً</option>
          <option value="profit_asc">الأقل ربحاً / الخسارة</option>
          <option value="margin_desc">الأعلى هامشاً</option>
        </select>
        <button onClick={exportExcel} disabled={!shown.length} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"><Download size={14} /> Excel</button>
      </div>

      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="sticky top-0 bg-elevated">
            <tr className="border-b border-border text-gray-400">
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">القناة</th>
              <th className="p-2 text-right">الفاتورة / الأوردر</th>
              <th className="p-2 text-right">الصنف{view === 'device' ? ' / السيريال' : ''}</th>
              <th className="p-2 text-center">سعر البيع</th>
              <th className="p-2 text-center">التكلفة</th>
              <th className="p-2 text-center">العمولة</th>
              <th className="p-2 text-center">الربح</th>
              <th className="p-2 text-center">الهامش</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-500">لا توجد بيانات في الفترة المحددة</td></tr>}
            {shown.map(r => (
              <tr key={r.key} className="border-b border-border/40 hover:bg-white/5">
                <td className="p-2 whitespace-nowrap text-gray-300">{r.date}</td>
                <td className="p-2">{channelLabel(r.channel)}</td>
                <td className="p-2">{r.docNumber}{r.party ? <div className="text-[11px] text-gray-500">{r.party}</div> : null}</td>
                <td className="p-2">
                  <div>{r.qty > 1 ? `${r.qty} x ` : ''}{r.product}</div>
                  {view === 'device' && r.serial && <div className="font-mono text-[11px] text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{r.serial}</div>}
                </td>
                <td className="p-2 text-center">{formatCurrency(r.revenue)}</td>
                <td className="p-2 text-center">{formatCurrency(r.cost)}</td>
                <td className="p-2 text-center text-orange-300">{r.commission === null ? <span className="text-gray-500 text-xs">لم يتسوَّ</span> : r.commission ? formatCurrency(r.commission) : '-'}</td>
                <td className={`p-2 text-center font-bold ${r.pendingCost ? 'text-orange-300' : r.profit >= 0 ? (r.estimated ? 'text-yellow-300' : 'text-green-300') : 'text-red-400'}`}>
                  {r.pendingCost ? 'تكلفة معلّقة' : formatCurrency(r.profit)}
                  {r.estimated && !r.pendingCost && <div className="text-[10px] font-normal text-gray-500">متوقع</div>}
                </td>
                <td className="p-2 text-center text-gray-300">{r.pendingCost ? '—' : marginPct(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
