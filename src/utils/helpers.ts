// src/utils/helpers.ts

export const formatCurrency = (amount: number, currency = 'EGP'): string => {
  return `${amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

export const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ar-EG');
  } catch {
    return dateStr;
  }
};

export const normalizeForCompare = (text: string): string => {
  return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
};

export const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const getTodayStr = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const categoryLabel = (cat: string): string => {
  const map: Record<string, string> = {
    phones: 'موبايلات',
    tablets: 'تابلت',
    laptops: 'لابتوب',
    accessories: 'إكسسوارات',
    other: 'أخرى',
  };
  return map[cat] || cat;
};

export const paymentMethodLabel = (method: string): string => {
  const map: Record<string, string> = {
    cash: 'كاش',
    bank: 'تحويل بنكي',
    instapay: 'انستا باي',
    credit: 'آجل',
  };
  return map[method] || method;
};

export const statusLabel = (status: string): string => {
  const map: Record<string, string> = {
    pending: 'معلق',
    shipped: 'تم الشحن',
    delivered: 'تم التوصيل',
    canceled: 'ملغي',
    settled: 'محول بنكيًا',
    paid: 'مدفوع',
    partial: 'جزئي',
    unpaid: 'غير مدفوع',
    draft: 'مسودة',
    available: 'متاح',
    sold: 'مباع',
    transferred: 'محول',
    returned: 'مرتجع',
  };
  return map[status] || status;
};

export const statusColor = (status: string): string => {
  const map: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    shipped: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    delivered: 'bg-green-500/20 text-green-400 border border-green-500/30',
    canceled: 'bg-red-500/20 text-red-400 border border-red-500/30',
    settled: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
    paid: 'bg-green-500/20 text-green-400 border border-green-500/30',
    partial: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    unpaid: 'bg-red-500/20 text-red-400 border border-red-500/30',
    draft: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
    available: 'bg-green-500/20 text-green-400 border border-green-500/30',
    sold: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    transferred: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    returned: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  };
  return map[status] || 'bg-gray-500/20 text-gray-400';
};

// ==================== توليد SKU تلقائي ====================
// مثال: ONE-1734567890123-A3X
export const generateSKU = (productName?: string): string => {
  const prefix = 'ONE';
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substr(2, 3).toUpperCase();
  // لو في اسم منتج، خد أول حرف من كل كلمة
  if (productName && productName.trim()) {
    const initials = productName
      .trim()
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0].toUpperCase())
      .join('')
      .substr(0, 4);
    return `${initials}-${timestamp.substr(-6)}-${random}`;
  }
  return `${prefix}-${timestamp.substr(-8)}-${random}`;
};

// ==================== توليد UPC/Barcode تلقائي ====================
// 12 رقم بدايتها 01 زي UPC-A
export const generateUPC = (): string => {
  const prefix = '01';
  const middle = Date.now().toString().substr(-7);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const raw = `${prefix}${middle}${random}`;               // 12 رقم
  // حساب check digit (خوارزمية UPC-A القياسية)
  const digits = raw.split('').map(Number);
  let sum = 0;
  digits.forEach((d, i) => { sum += i % 2 === 0 ? d * 3 : d; });
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${raw}${checkDigit}`;                            // 13 رقم (EAN-13 compatible)
};

// ==================== printElement ====================
export const printElement = (htmlContent: string, title = 'ONE - طباعة') => {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap" rel="stylesheet" />
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Tajawal', Arial, sans-serif; direction: rtl; background: #fff; color: #1a1a2e; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; font-size: 13px; }
        th { background: #1a1a2e; color: white; font-weight: 600; }
        tr:nth-child(even) { background: #f8f9fa; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 20px; }
        .company-name { font-size: 28px; font-weight: 800; color: #7c3aed; }
        .invoice-info { text-align: left; font-size: 13px; }
        .totals { margin-top: 15px; display: flex; justify-content: flex-start; }
        .totals table { width: 300px; }
        .total-row { font-weight: 700; background: #1a1a2e !important; color: white !important; }
        .total-row td { color: white !important; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
        .paid { background: #d1fae5; color: #065f46; }
        .partial { background: #fef3c7; color: #92400e; }
        .unpaid { background: #fee2e2; color: #991b1b; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};