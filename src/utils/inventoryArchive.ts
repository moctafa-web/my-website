// src/utils/inventoryArchive.ts
// أرشيف المخزون اليومي: لقطة كاملة (منتج بمنتج + السيريالات المتاحة) لكل يوم، محفوظة في Firebase
// (collection: inventorySnapshots، الـ id = التاريخ). اللقطة بتتحدّث مع كل حركة مخزون جوه اليوم،
// فآخر نسخة محفوظة في اليوم = مخزون نهاية اليوم.
import { Product, SerialItem } from '../types';

export interface InventorySnapshotItem {
  productId: string;
  name: string;
  sku: string;
  type: 'serial' | 'normal';
  qty: number;
  cost: number;   // قيمة بسعر الشراء
  sale: number;   // قيمة بسعر البيع
  minStock: number;
  serials?: string[]; // السيريالات المتاحة وقت اللقطة (لمنتجات السيريال)
}

export interface InventorySnapshotDoc {
  id: string;        // = date
  date: string;      // YYYY-MM-DD بتوقيت الجهاز (القاهرة)
  savedAt: string;
  totalQty: number;
  totalCost: number;
  totalSale: number;
  productCount: number;
  items: InventorySnapshotItem[];
}

// تاريخ اليوم بتوقيت الجهاز (مش UTC) علشان اللقطة بعد 12 بالليل ما تتحسبش على اليوم اللي فات
export const localDateStr = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const buildInventorySnapshot = (products: Product[], serials: SerialItem[], date: string): InventorySnapshotDoc => {
  const availableByProduct = new Map<string, SerialItem[]>();
  serials.forEach(s => {
    if (s.status !== 'available') return;
    const arr = availableByProduct.get(s.productId);
    if (arr) arr.push(s); else availableByProduct.set(s.productId, [s]);
  });

  const items: InventorySnapshotItem[] = [];
  products.forEach(p => {
    if (p.productType === 'serial') {
      const list = availableByProduct.get(p.id) || [];
      if (!list.length) return;
      items.push({
        productId: p.id, name: p.name, sku: p.sku || '', type: 'serial', qty: list.length,
        cost: list.reduce((sum, s) => sum + (Number(s.costPrice) || 0), 0),
        sale: list.length * (Number(p.salePrice) || 0),
        minStock: p.minStock || 0,
        serials: list.map(s => s.serial),
      });
    } else {
      const qty = Number(p.stock) || 0;
      if (qty <= 0) return;
      items.push({
        productId: p.id, name: p.name, sku: p.sku || '', type: 'normal', qty,
        cost: qty * (Number(p.costPrice) || 0),
        sale: qty * (Number(p.salePrice) || 0),
        minStock: p.minStock || 0,
      });
    }
  });
  items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  return {
    id: date, date, savedAt: new Date().toISOString(),
    totalQty: items.reduce((s, i) => s + i.qty, 0),
    totalCost: items.reduce((s, i) => s + i.cost, 0),
    totalSale: items.reduce((s, i) => s + i.sale, 0),
    productCount: items.length,
    items,
  };
};

// بصمة بسيطة للمحتوى: بنحفظ لقطة جديدة بس لو المخزون اتغيّر فعلاً
export const snapshotSignature = (doc: InventorySnapshotDoc): string =>
  `${doc.totalQty}|${Math.round(doc.totalCost)}|${Math.round(doc.totalSale)}|` +
  doc.items.map(i => `${i.productId}:${i.qty}:${i.serials ? i.serials.join(',') : ''}`).join(';');

// حد أمان: مستند Firestore أقصاه 1MB، لو اللقطة كبرت نشيل قايمة السيريالات (الأعداد بتفضل)
export const trimSnapshotForStorage = (doc: InventorySnapshotDoc): InventorySnapshotDoc => {
  if (JSON.stringify(doc).length < 800_000) return doc;
  return { ...doc, items: doc.items.map(({ serials: _s, ...rest }) => rest) };
};
