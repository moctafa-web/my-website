import * as XLSX from 'xlsx';
import { formatMoney, paymentMethodLabel } from './helpers';

export type DetailLevel = 'brief' | 'items' | 'items_price' | 'full';

export interface DetailLine {
  qty: number;
  name: string;
  price: number;
  serials: string[];
}

// سطر الصنف حسب مستوى التفاصيل: "5 x Airpods" أو "5 x Airpods @ 3,200"
export const detailLineText = (l: DetailLine, level: DetailLevel): string =>
  `${l.qty} x ${l.name}${level === 'items_price' || level === 'full' ? ` @ ${formatMoney(l.price)}` : ''}`;

export interface ExportRow {
  date: string;
  kind?: 'invoice' | 'payment';
  text: string;
  method?: string;
  person?: string;
  notes?: string;
  lines?: DetailLine[];
  debit: number;
  credit: number;
  balanceAfter: number;
}

export interface ExportInput {
  name: string;
  phone?: string;
  dateFrom: string;
  dateTo: string;
  detailLevel?: DetailLevel; // مستوى تفاصيل البيان
  filterLabel: string; // "كل الحركات" / "الفواتير فقط" / "الدفعات فقط"
  opening: number;
  rows: ExportRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

const side = (b: number) => (Math.abs(b) < 0.005 ? '' : b > 0 ? 'لنا' : 'له');
const balText = (b: number) => `${formatMoney(Math.abs(b))} ${side(b)}`.trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// البيان بدون طريقة الدفع (لأنها بتتعرض في عمود مستقل)
const baseText = (r: ExportRow) =>
  r.kind === 'payment' ? (r.debit > 0 ? 'دفعة خارجة' : 'دفعة واردة') : r.text;
const methodText = (r: ExportRow) =>
  r.kind === 'payment' ? `${paymentMethodLabel(r.method || '')}${r.person ? ` (${r.person})` : ''}` : '';

const periodText = (d: ExportInput) => `${d.dateFrom || 'من البداية'} إلى ${d.dateTo || 'اليوم'}`;

// ========== PDF / طباعة ==========
export const buildStatementHtml = (d: ExportInput): string => {
  const lvl: DetailLevel = d.detailLevel || 'brief';
  const color = (b: number) => (Math.abs(b) < 0.005 ? '#555' : b > 0 ? '#b91c1c' : '#15803d');
  const rows = d.rows.map(r => `
    <tr>
      <td class="dt">${esc(r.date)}</td>
      <td>${esc(baseText(r))}${lvl !== 'brief' && r.lines?.length ? `<ul class="items">${r.lines.map(l => `<li dir="auto">${esc(detailLineText(l, lvl))}${lvl === 'full' && l.serials.length ? `<div class="sn" dir="ltr">${l.serials.map(esc).join('<br/>')}</div>` : ''}</li>`).join('')}</ul>` : ''}${r.notes ? `<div class="note">${esc(r.notes)}</div>` : ''}</td>
      <td>${esc(methodText(r)) || '-'}</td>
      <td class="num">${r.debit ? formatMoney(r.debit) : '-'}</td>
      <td class="num">${r.credit ? formatMoney(r.credit) : '-'}</td>
      <td class="num bal" style="color:${color(r.balanceAfter)}">${balText(r.balanceAfter)}</td>
    </tr>`).join('');

  return `
  <style>
    @page { size: A4; margin: 0; }
    .st h2 { font-size: 20px; margin-bottom: 4px; }
    .st .meta { font-size: 12px; color: #444; margin-bottom: 2px; }
    .st table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .st thead { display: table-header-group; }
    .st tr { page-break-inside: avoid; }
    .st th { background: #eef0f6; font-size: 12px; }
    .st td, .st th { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: right; }
    .st .dt { white-space: nowrap; width: 1%; }
    .st .num { text-align: center; white-space: nowrap; }
    .st .bal { font-weight: 700; }
    .st .items { margin: 4px 0 0; padding-right: 14px; font-size: 11px; color: #333; }
    .st .sn { font-family: 'Courier New', monospace; font-size: 10px; color: #555; margin: 1px 0 3px; text-align: right; }
    .st .note { font-size: 10px; color: #777; margin-top: 2px; }
    .st .open td, .st .total td { background: #f6f7fb; font-weight: 700; }
    .st .sum { margin-top: 14px; font-size: 14px; }
  </style>
  <div class="st" dir="rtl">
    <h2>كشف حساب — ${esc(d.name)}</h2>
    ${d.phone ? `<div class="meta">الهاتف: ${esc(d.phone)}</div>` : ''}
    <div class="meta">الفترة: ${esc(periodText(d))}${d.filterLabel !== 'كل الحركات' ? ` — العرض: ${esc(d.filterLabel)}` : ''}</div>
    <div class="meta">تاريخ الإصدار: ${new Date().toISOString().slice(0, 10)}</div>
    <table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th>طريقة الدفع</th><th>مدين</th><th>دائن</th><th>الرصيد الجاري</th></tr></thead>
      <tbody>
        <tr class="open"><td>${esc(d.dateFrom || '—')}</td><td colspan="4">الرصيد الافتتاحي</td><td class="num bal" style="color:${color(d.opening)}">${balText(d.opening)}</td></tr>
        ${rows}
        <tr class="total"><td colspan="3">الإجمالي</td><td class="num">${formatMoney(d.totalDebit)}</td><td class="num">${formatMoney(d.totalCredit)}</td><td class="num" style="color:${color(d.closing)}">${balText(d.closing)}</td></tr>
      </tbody>
    </table>
    <div class="sum">الرصيد الختامي: <b style="color:${color(d.closing)}">${balText(d.closing)}${d.closing > 0.005 ? ' (مستحق لنا)' : d.closing < -0.005 ? ' (مستحق له)' : ''}</b></div>
  </div>`;
};

// ========== Excel ==========
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim() || 'حساب';

export const exportStatementExcel = (d: ExportInput) => {
  const aoa: (string | number)[][] = [
    [`كشف حساب — ${d.name}`],
    ['الهاتف', d.phone || ''],
    ['الفترة', periodText(d)],
    ['العرض', d.filterLabel],
    [],
  ];
  const headerRow = aoa.length; // index of header row (0-based)
  const lvl: DetailLevel = d.detailLevel || 'brief';
  const det = lvl !== 'brief';
  const detCell = (r: ExportRow) => (r.lines || []).map(l => detailLineText(l, lvl) + (lvl === 'full' && l.serials.length ? ` [${l.serials.join(', ')}]` : '')).join(' | ');
  const header = ['التاريخ', 'البيان', ...(det ? ['تفاصيل الأصناف'] : []), 'طريقة الدفع', 'ملاحظات', 'مدين', 'دائن', 'الرصيد الجاري', 'لنا / له'];
  const mk = (date: string, text: string, detail: string, method: string, notes: string, debit: number | string, credit: number | string, bal: number, sd: string) =>
    [date, text, ...(det ? [detail] : []), method, notes, debit, credit, bal, sd];
  aoa.push(header);
  aoa.push(mk(d.dateFrom || '', 'الرصيد الافتتاحي', '', '', '', '', '', Math.abs(d.opening), side(d.opening)));
  d.rows.forEach(r => aoa.push(mk(r.date, baseText(r), detCell(r), methodText(r), r.notes || '', r.debit || '', r.credit || '', Math.abs(r.balanceAfter), side(r.balanceAfter))));
  aoa.push(mk('', 'الإجمالي / الرصيد الختامي', '', '', '', d.totalDebit, d.totalCredit, Math.abs(d.closing), side(d.closing)));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const nCols = header.length;
  ws['!cols'] = [{ wch: 12 }, { wch: 28 }, ...(det ? [{ wch: 48 }] : []), { wch: 20 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 9 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  // تنسيق الأرقام (آلاف + خانتين عشريتين): مدين / دائن / الرصيد
  const numCols = [nCols - 4, nCols - 3, nCols - 2];
  const lastRow = aoa.length - 1;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    numCols.forEach(c => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    });
  }
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'كشف الحساب');
  const range = d.dateFrom || d.dateTo ? `-${d.dateFrom || 'start'}_${d.dateTo || 'today'}` : '';
  XLSX.writeFile(wb, `كشف-حساب-${safeName(d.name)}${range}.xlsx`);
};
