import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppState } from '../types';
import { runHealthCheck } from '../store/domains/accounting.store';

interface Props { state: AppState; }

export default function HealthCheck({ state }: Props) {
  const issues = useMemo(() => runHealthCheck(state), [state]);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck size={24} className="text-violet-400" /> فحص صحة الحسابات</h2>
          <p className="text-sm text-gray-500 mt-1">فحص مستقل للفواتير والخزينة والأرصدة والمشاكل المعروفة قبل التقفيل.</p>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw size={13} /> يتم الفحص تلقائياً مع كل تحديث</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-elevated border border-white/10 rounded-xl p-4"><div className="text-gray-500 text-xs">إجمالي المشاكل</div><div className="text-2xl font-black text-white mt-1">{issues.length}</div></div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4"><div className="text-gray-500 text-xs">أخطاء</div><div className="text-2xl font-black text-red-300 mt-1">{errors.length}</div></div>
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4"><div className="text-gray-500 text-xs">تنبيهات</div><div className="text-2xl font-black text-yellow-300 mt-1">{warnings.length}</div></div>
      </div>

      {issues.length === 0 ? (
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl p-8 text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-400 mb-3" />
          <div className="text-xl font-bold text-white">الحسابات سليمة</div>
          <div className="text-sm text-gray-400 mt-1">لم يتم العثور على تضارب في الفواتير أو حركة الخزينة أو البيانات الحرجة.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map(issue => (
            <div key={issue.id} className={`rounded-2xl border p-4 ${issue.severity === 'error' ? 'bg-red-900/10 border-red-700/30' : issue.severity === 'warning' ? 'bg-yellow-900/10 border-yellow-700/30' : 'bg-blue-900/10 border-blue-700/30'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className={issue.severity === 'error' ? 'text-red-400' : issue.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'} />
                <div className="min-w-0">
                  <div className="font-bold text-white">{issue.title}</div>
                  <div className="text-sm text-gray-400 mt-1">{issue.details}</div>
                  {issue.referenceId && <div className="text-[11px] text-gray-600 font-mono mt-2">مرجع: {issue.referenceId}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-elevated border border-white/10 rounded-2xl p-4 text-sm text-gray-400">
        <div className="font-semibold text-gray-200 mb-2">ما الذي يتم فحصه؟</div>
        <div>• إجمالي الفاتورة = المدفوع + المتبقي.</div>
        <div>• المدفوع لا يتجاوز إجمالي الفاتورة ولا يقل عن صفر.</div>
        <div>• صافي حركات الكاش والبنك يطابق الرصيد المسجل.</div>
        <div>• سيريالات سعر الشراء المعلّق والفواتير القديمة غير المسددة تظهر كتنبيهات.</div>
      </div>
    </div>
  );
}
