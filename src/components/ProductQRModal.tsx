import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Product } from '../types';
import { X, Printer, Download } from 'lucide-react';

interface Props {
  product: Product;
  onClose: () => void;
}

// مودال طباعة ملصق Barcode/QR للمنتج - يحتوي على SKU لتسريع تسجيل المبيعات بالمسح
// بدل البحث اليدوي عن المنتج كل مرة.
export default function ProductQRModal({ product, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL(product.sku, { width: 240, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [product.sku]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>ملصق ${product.sku}</title>
          <style>
            @page { size: 50mm 30mm; margin: 0; }
            body { margin: 0; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
            .label { text-align: center; padding: 4px; }
            .label img { width: 110px; height: 110px; }
            .label .name { font-size: 9px; font-weight: bold; margin: 2px 0; max-width: 140px; overflow: hidden; }
            .label .sku { font-size: 11px; font-weight: bold; font-family: monospace; letter-spacing: 1px; }
            .label .price { font-size: 10px; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="label">
            <img src="${qrDataUrl}" />
            <div class="name">${product.name}</div>
            <div class="sku">${product.sku}</div>
            <div class="price">${product.salePrice.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr_${product.sku}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">🏷️ ملصق QR للمنتج</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
        </div>

        <div ref={labelRef} className="bg-white rounded-xl p-4 text-center mb-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-2" width={180} height={180} />
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">جاري التوليد...</div>
          )}
          <div className="text-black font-bold text-sm">{product.name}</div>
          <div className="text-black font-mono text-base mt-1 tracking-wider">{product.sku}</div>
          <div className="text-gray-600 text-sm mt-1">{product.salePrice.toLocaleString('ar-EG')} ج.م</div>
        </div>

        <p className="text-xs text-gray-500 mb-4 text-center">يحتوي الكود على رقم SKU، يمكن مسحه بقارئ الباركود أو كاميرا الموبايل لتسجيل المنتج فورًا بدل البحث اليدوي.</p>

        <div className="flex gap-2">
          <button onClick={handlePrint} disabled={!qrDataUrl} className="btn-primary flex-1 flex items-center justify-center gap-1 disabled:opacity-50"><Printer size={14} /> طباعة الملصق</button>
          <button onClick={handleDownload} disabled={!qrDataUrl} className="btn-secondary flex-1 flex items-center justify-center gap-1 disabled:opacity-50"><Download size={14} /> تحميل PNG</button>
        </div>
      </div>
    </div>
  );
}
