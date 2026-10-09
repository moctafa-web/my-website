import * as XLSX from 'xlsx';
import { NoonOrder, OrderStatus } from '../types';

export interface SheetRow {
  awb: string;
  status: string; // حالة نون الخام (lowercase)
  createdAt?: string;
  expectedDate?: string;
  itemsCount?: number;
  lostBy?: string;
}

// تحويل حالات نون لحالات النظام. أي حالة مش معروفة بتتعرض للمراجعة ومش بتتغير لوحدها.
const STATUS_MAP: Record<string, OrderStatus> = {
  delivered: 'delivered',
  shipped: 'shipped',
  in_transit: 'shipped',
  out_for_delivery: 'shipped',
  dispatched: 'shipped',
  cancelled: 'canceled',
  canceled: 'canceled',
  returned: 'returned',
  return: 'returned',
  rto: 'returned',
  returned_to_seller: 'returned',
  pending: 'pending',
  created: 'pending',
};

export const mapNoonStatus = (raw: string): OrderStatus | null => STATUS_MAP[raw.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const pick = (row: Record<string, any>, names: string[]) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find(x => norm(x).replace(/^\ufeff/, '') === n);
    if (k !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
};

// قراءة ملف نون (CSV أو Excel) والتعرف على الأعمدة تلقائياً
export const parseNoonSheet = (data: string | ArrayBuffer, isText: boolean): { rows: SheetRow[]; error?: string } => {
  const wb = isText ? XLSX.read(data as string, { type: 'string' }) : XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
  const rows: SheetRow[] = [];
  raw.forEach(r => {
    const awb = pick(r, ['awb_nr', 'awb', 'awb_number', 'shipment_number', 'shipment_nr', 'shipment', 'order_nr', 'order_number']);
    const status = pick(r, ['status', 'shipment_status']);
    if (!awb) return;
    rows.push({
      awb,
      status: status.toLowerCase(),
      createdAt: pick(r, ['created_at']),
      expectedDate: pick(r, ['nearest_esd', 'esd']),
      itemsCount: Number(pick(r, ['items_count'])) || undefined,
      lostBy: pick(r, ['lost_by']),
    });
  });
  if (!rows.length) return { rows, error: 'مفيش صفوف مفهومة في الملف. لازم يكون فيه عمود رقم الشحنة (awb_nr) وعمود الحالة (status).' };
  return { rows };
};

export type ChangeKind = 'forward' | 'cancel' | 'conflict' | 'protected' | 'same' | 'unknown';

export interface SyncItem {
  row: SheetRow;
  order: NoonOrder;
  from: OrderStatus;
  to: OrderStatus | null;
  kind: ChangeKind;
  reason: string;
  defaultChecked: boolean;
}

export interface SyncPreview {
  items: SyncItem[];
  changes: SyncItem[]; // اللي فيه تغيير فعلي (forward/cancel/conflict)
  unchanged: number;
  protectedCount: number;
  unknownStatus: SyncItem[];
  notFound: SheetRow[]; // في الشيت ومش في النظام
  missingFromSheet: NoonOrder[]; // في النظام (شحن/معلق) ومش في الشيت
  lost: SheetRow[];
}

const RANK: Record<string, number> = { pending: 0, shipped: 1, delivered: 2 };
const PROTECTED: OrderStatus[] = ['settled', 'paid']; // حالات مالية: المزامنة ماتلمسهاش

export const buildSyncPreview = (rows: SheetRow[], orders: NoonOrder[]): SyncPreview => {
  const byKey = new Map<string, NoonOrder>();
  orders.forEach(o => {
    [o.shipmentNumber, o.orderNumber].forEach(k => { if (k && !byKey.has(norm(k))) byKey.set(norm(k), o); });
  });

  const items: SyncItem[] = [];
  const notFound: SheetRow[] = [];
  const seenOrders = new Set<string>();

  // لو نفس الشحنة اتكررت في الملف نعتمد آخر ظهور
  const lastByAwb = new Map<string, SheetRow>();
  rows.forEach(r => lastByAwb.set(norm(r.awb), r));

  lastByAwb.forEach(row => {
    const order = byKey.get(norm(row.awb));
    if (!order) { notFound.push(row); return; }
    seenOrders.add(order.id);
    const to = mapNoonStatus(row.status);
    const from = order.status;
    let kind: ChangeKind; let reason = ''; let checked = false;
    if (to === null) { kind = 'unknown'; reason = `حالة نون "${row.status || 'فارغة'}" غير معروفة`; }
    else if (PROTECTED.includes(from)) { kind = 'protected'; reason = 'حالة مالية (مدفوع/محوّل) ماتتغيرش'; }
    else if (to === from) { kind = 'same'; }
    else if (to === 'canceled') { kind = 'cancel'; reason = 'هيتلغي ويرجّع الجهاز للمخزون'; checked = true; }
    else if (from === 'canceled' || from === 'returned') { kind = 'conflict'; reason = `النظام عنده "${from === 'canceled' ? 'ملغي' : 'مرتجع'}" ونون بتقول غير كده، راجعها`; }
    else if (to === 'returned') { kind = 'forward'; reason = 'مرتجع'; checked = true; }
    else if ((RANK[to] ?? -1) > (RANK[from] ?? -1)) { kind = 'forward'; checked = true; }
    else { kind = 'conflict'; reason = 'نون بتقول حالة أقدم من اللي في النظام، راجعها'; }
    items.push({ row, order, from, to, kind, reason, defaultChecked: checked });
  });

  const changes = items.filter(i => ['forward', 'cancel', 'conflict'].includes(i.kind));
  return {
    items,
    changes,
    unchanged: items.filter(i => i.kind === 'same').length,
    protectedCount: items.filter(i => i.kind === 'protected').length,
    unknownStatus: items.filter(i => i.kind === 'unknown'),
    notFound,
    missingFromSheet: orders.filter(o => !seenOrders.has(o.id) && (o.status === 'pending' || o.status === 'shipped')),
    lost: rows.filter(r => r.lostBy),
  };
};
