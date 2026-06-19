import React, { useState } from 'react';
import { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  cashBalance: number;
  bankBalance: number;
  onResetData: () => void;
}

export default function Settings({ settings, onUpdateSettings, cashBalance, bankBalance, onResetData }: Props) {
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleSave = () => {
    onUpdateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div><h2 className="text-xl font-bold text-white">⚙️ الإعدادات</h2></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">🏢 بيانات الشركة</h3>
          <div className="space-y-3">
            <div>
              <label className="form-label">اسم الشركة</label>
              <input type="text" value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} className="input-dark w-full" />
            </div>
            <div>
              <label className="form-label">رقم الهاتف</label>
              <input type="text" value={form.companyPhone || ''} onChange={e => setForm(p => ({ ...p, companyPhone: e.target.value }))} className="input-dark w-full" />
            </div>
            <div>
              <label className="form-label">العنوان</label>
              <input type="text" value={form.companyAddress || ''} onChange={e => setForm(p => ({ ...p, companyAddress: e.target.value }))} className="input-dark w-full" />
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">📄 إعدادات الفواتير</h3>
          <div className="space-y-3">
            <div>
              <label className="form-label">بادئة فواتير البيع</label>
              <input type="text" value={form.invoicePrefix} onChange={e => setForm(p => ({ ...p, invoicePrefix: e.target.value }))} className="input-dark w-full" placeholder="INV" />
            </div>
            <div>
              <label className="form-label">بادئة فواتير الشراء</label>
              <input type="text" value={form.purchasePrefix} onChange={e => setForm(p => ({ ...p, purchasePrefix: e.target.value }))} className="input-dark w-full" placeholder="PUR" />
            </div>
            <div>
              <label className="form-label">نسبة الضريبة الافتراضية (%)</label>
              <input type="number" value={form.taxRate} onChange={e => setForm(p => ({ ...p, taxRate: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">💰 الأرصدة الحالية</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-green-900/20 border border-green-700/30 rounded-xl px-4 py-3">
              <span className="text-green-400">💵 خزنة الكاش</span>
              <span className="text-xl font-black text-white">{cashBalance.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex items-center justify-between bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-3">
              <span className="text-blue-400">🏦 خزنة البنك</span>
              <span className="text-xl font-black text-white">{bankBalance.toLocaleString('ar-EG')} ج.م</span>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">🔧 النظام</h3>
          <div className="space-y-3">
            <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl p-4">
              <div className="text-sm text-violet-300 font-medium mb-2">ONE ERP System v1.0</div>
              <div className="text-xs text-gray-500">النظام يعمل بالكامل على المتصفح (Offline)</div>
              <div className="text-xs text-gray-500 mt-1">البيانات محفوظة في LocalStorage</div>
            </div>

            <div>
              <div className="text-sm text-gray-400 mb-2">تصدير البيانات</div>
              <button onClick={() => {
                const data = localStorage.getItem('one_erp_data');
                if (data) {
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `one_erp_backup_${new Date().toISOString().split('T')[0]}.json`;
                  a.click(); URL.revokeObjectURL(url);
                }
              }} className="btn-secondary text-sm w-full">📥 تصدير نسخة احتياطية (JSON)</button>
            </div>

            <div>
              <div className="text-sm text-gray-400 mb-2">استيراد البيانات</div>
              <label className="btn-secondary text-sm w-full block text-center cursor-pointer">
                📤 استيراد من نسخة احتياطية
                <input type="file" accept=".json" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const data = JSON.parse(ev.target?.result as string);
                      localStorage.setItem('one_erp_data', JSON.stringify(data));
                      window.location.reload();
                    } catch { alert('خطأ في ملف البيانات'); }
                  };
                  reader.readAsText(file);
                }} />
              </label>
            </div>

            <button onClick={() => setShowReset(true)} className="w-full py-2 text-sm border border-red-700/40 text-red-400 rounded-xl hover:bg-red-900/20 transition-colors">
              ⚠️ إعادة تعيين النظام
            </button>
          </div>
        </div>
      </div>

      <button onClick={handleSave} className={`btn-primary px-8 ${saved ? 'opacity-50' : ''}`}>
        {saved ? '✅ تم الحفظ!' : '💾 حفظ الإعدادات'}
      </button>

      {showReset && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="font-bold text-white mb-2">تحذير!</h3>
            <p className="text-gray-400 text-sm mb-4">سيتم حذف جميع البيانات وإعادة تعيين النظام. هل أنت متأكد؟</p>
            <div className="flex gap-2">
              <button onClick={() => { onResetData(); setShowReset(false); }} className="flex-1 py-2 bg-red-700/30 border border-red-500/40 rounded-xl text-red-300 text-sm">نعم، إعادة التعيين</button>
              <button onClick={() => setShowReset(false)} className="flex-1 py-2 btn-secondary text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
