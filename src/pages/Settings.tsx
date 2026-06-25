import React, { useState } from 'react';
import { AppSettings, AppState } from '../types';
import PasswordConfirmModal from '../components/PasswordConfirmModal';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  cashBalance: number;
  bankBalance: number;
  onResetData: () => Promise<void>;
  onDeleteAllNoonOrders: () => Promise<void>;
  noonOrdersCount: number;
  fullState: AppState;
}

export default function Settings({ settings, onUpdateSettings, cashBalance, bankBalance, onResetData, onDeleteAllNoonOrders, noonOrdersCount, fullState }: Props) {
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showDeleteNoon, setShowDeleteNoon] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [noonDeleteDone, setNoonDeleteDone] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    await onResetData();
    setShowReset(false);
    setResetDone(true);
    setTimeout(() => { window.location.reload(); }, 1200);
  };

  const handleConfirmDeleteNoon = async () => {
    await onDeleteAllNoonOrders();
    setShowDeleteNoon(false);
    setNoonDeleteDone(true);
    setTimeout(() => setNoonDeleteDone(false), 2500);
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
              <div className="text-xs text-gray-500">جميع البيانات محفوظة ومتزامنة مباشرة مع Firebase (Cloud)</div>
            </div>

            <div>
              <div className="text-sm text-gray-400 mb-2">نسخة احتياطية</div>
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(fullState, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `one_erp_backup_${new Date().toISOString().split('T')[0]}.json`;
                a.click(); URL.revokeObjectURL(url);
              }} className="btn-secondary text-sm w-full">📥 تصدير نسخة احتياطية كاملة (JSON)</button>
              <p className="text-xs text-gray-500 mt-1">يصدّر كل البيانات الحالية من قاعدة البيانات السحابية كملف يمكن حفظه على جهازك</p>
            </div>

            {/* حذف أوردرات نون/أمازون فقط - مفيد أثناء مرحلة التجربة */}
            <div className="bg-orange-900/10 border border-orange-700/30 rounded-xl p-4">
              <div className="text-sm text-orange-300 font-medium mb-1">🏪 أوردرات نون/أمازون</div>
              <div className="text-xs text-gray-500 mb-3">يوجد حاليًا {noonOrdersCount} أوردر مسجل في النظام</div>
              {noonDeleteDone ? (
                <div className="text-center text-green-400 text-sm py-2">✅ تم حذف جميع أوردرات نون/أمازون بنجاح</div>
              ) : (
                <button onClick={() => setShowDeleteNoon(true)} disabled={noonOrdersCount === 0}
                  className="w-full py-2 text-sm border border-orange-700/40 text-orange-400 rounded-xl hover:bg-orange-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  🗑️ حذف جميع أوردرات نون/أمازون (مرحلة التجربة)
                </button>
              )}
            </div>

            <button onClick={() => setShowReset(true)} className="w-full py-2 text-sm border border-red-700/40 text-red-400 rounded-xl hover:bg-red-900/20 transition-colors">
              ⚠️ إعادة تعيين النظام (حذف كل البيانات)
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className={`btn-primary px-8 ${saved ? 'opacity-50' : ''} disabled:opacity-50`}>
          {saving ? '⏳ جاري الحفظ...' : saved ? '✅ تم الحفظ بنجاح!' : '💾 حفظ الإعدادات'}
        </button>
        {saved && <span className="text-xs text-gray-500">تم الحفظ في قاعدة البيانات وسيظهر على كل الأجهزة</span>}
      </div>

      {/* تأكيد حذف أوردرات نون/أمازون بكلمة سر */}
      {showDeleteNoon && (
        <PasswordConfirmModal
          title="حذف جميع أوردرات نون/أمازون"
          message={`سيتم حذف جميع أوردرات نون/أمازون (${noonOrdersCount} أوردر) نهائيًا من قاعدة البيانات على كل الأجهزة. لا تتأثر باقي بيانات النظام (المنتجات، الفواتير، العملاء...). لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف الأوردرات"
          onConfirm={handleConfirmDeleteNoon}
          onCancel={() => setShowDeleteNoon(false)}
        />
      )}

      {/* تأكيد إعادة تعيين النظام بكلمة سر */}
      {showReset && (
        <PasswordConfirmModal
          title="إعادة تعيين النظام بالكامل"
          message="سيتم حذف جميع البيانات نهائيًا من قاعدة البيانات (منتجات، فواتير، عملاء، موردين، أوردرات نون، مصروفات...) على كل الأجهزة المتصلة بالنظام. هذا الإجراء نهائي ولا يمكن التراجع عنه."
          confirmLabel="إعادة تعيين كل شيء"
          onConfirm={handleConfirmReset}
          onCancel={() => setShowReset(false)}
        />
      )}

      {resetDone && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-white">تم إعادة تعيين النظام، جاري إعادة تحميل الصفحة...</p>
          </div>
        </div>
      )}
    </div>
  );
}
