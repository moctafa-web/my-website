import React, { useState, useRef } from 'react';
import { AppState } from '../types';
import { Save, Download, Upload, RefreshCw, AlertCircle, CheckCircle, HardDrive } from 'lucide-react';
import { BackupService } from '../services/backupService';
import PasswordConfirmModal from '../components/PasswordConfirmModal';

interface Props {
  state: AppState;
  onRestoreBackup: (state: AppState) => void | Promise<void>;
}

export default function Backup({ state, onRestoreBackup }: Props) {
  const [backups, setBackups] = useState<Array<{ id: string; date: string; size: string; type: string }>>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<AppState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = BackupService.getBackupStats(state);
  const lastBackupDate = BackupService.getLastBackupDate();
  const backupStale = BackupService.isBackupStale(7);

  const handleCreateBackup = () => {
    const { backup, backupInfo } = BackupService.createBackup(state, 'manual', 'نسخة احتياطية يدوية');
    
    setBackups(prev => [{
      id: backupInfo.id,
      date: new Date(backupInfo.date).toLocaleString('ar-EG'),
      size: BackupService.formatBackupSize(backupInfo.size),
      type: 'يدوية',
    }, ...prev]);

    BackupService.downloadBackup(backup, `backup-${new Date().toISOString().split('T')[0]}.json`);
    
    setMessage({
      type: 'success',
      text: 'تم إنشاء النسخة الاحتياطية بنجاح وتم تحميلها',
    });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = BackupService.restoreBackup(content);

      if (result.success && result.data) {
        // ما نطبقش الاستعادة على طول - نستنى تأكيد كلمة السر الأول
        // لأن العملية دي هتمسح وتكتب فوق كل بيانات النظام الحالية على كل الأجهزة
        setPendingRestoreData(result.data);
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'خطأ في قراءة ملف النسخة الاحتياطية',
        });
        setTimeout(() => setMessage(null), 5000);
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreData) return;
    setIsRestoring(true);
    try {
      await onRestoreBackup(pendingRestoreData);
      setMessage({
        type: 'success',
        text: 'تم استعادة البيانات بنجاح من النسخة الاحتياطية',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'حصل خطأ أثناء استعادة البيانات، حاول تاني',
      });
    } finally {
      setIsRestoring(false);
      setPendingRestoreData(null);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <HardDrive size={24} className="text-violet-400" />
            النسخ الاحتياطية
          </h2>
          <p className="text-gray-400 text-sm mt-1">إنشاء واستعادة نسخ احتياطية من بياناتك</p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-900/30 border border-green-700/30'
            : 'bg-red-900/30 border border-red-700/30'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <p className={message.type === 'success' ? 'text-green-300' : 'text-red-300'}>
            {message.text}
          </p>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-elevated border border-violet-700/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-400 text-sm uppercase">إجمالي البيانات</h3>
            <Save size={18} className="text-violet-400" />
          </div>
          <div className="text-3xl font-bold text-violet-400">{stats.totalItems}</div>
          <p className="text-gray-500 text-xs mt-2">عنصر تم حفظه</p>
        </div>

        <div className="bg-elevated border border-blue-700/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-400 text-sm uppercase">حجم النسخة</h3>
            <HardDrive size={18} className="text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-blue-400">{stats.backupSize}</div>
          <p className="text-gray-500 text-xs mt-2">حجم النسخة الاحتياطية المتوقع</p>
        </div>

        <div className="bg-elevated border border-green-700/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-400 text-sm uppercase">النسخ المحفوظة</h3>
            <RefreshCw size={18} className="text-green-400" />
          </div>
          <div className="text-3xl font-bold text-green-400">{backups.length}</div>
          <p className="text-gray-500 text-xs mt-2">نسخة محفوظة محلياً</p>
        </div>
      </div>

      {backupStale && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle size={20} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-300 font-medium">⚠️ آخر نسخة احتياطية أقدم من 7 أيام أو لا توجد نسخة مسجلة</p>
            <p className="text-orange-400 text-sm mt-1">آخر نسخة: {lastBackupDate ? new Date(lastBackupDate).toLocaleString('ar-EG') : 'لا توجد'} — أنشئ نسخة قبل التقفيل.</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={handleCreateBackup}
          className="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          <Save size={20} />
          إنشاء نسخة احتياطية الآن
        </button>

        <label className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer">
          <Upload size={20} />
          استعادة من ملف
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isRestoring || !!pendingRestoreData}
          />
        </label>
      </div>

      {/* Information */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-300 font-medium">معلومات النسخ الاحتياطية</p>
          <ul className="text-blue-400 text-sm mt-2 space-y-1">
            <li>• يتم حفظ النسخ الاحتياطية محلياً في متصفحك</li>
            <li>• يمكنك تحميل النسخة الاحتياطية كملف JSON واحتفظ بها بأمان</li>
            <li>• سيتم حذف النسخ الاحتياطية إذا مسحت بيانات المتصفح</li>
            <li>• قم بإنشاء نسخة احتياطية أسبوعية على الأقل</li>
          </ul>
        </div>
      </div>

      {/* Backups List */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">النسخ الاحتياطية المحفوظة</h3>
        {backups.length === 0 ? (
          <div className="bg-elevated border border-violet-900/30 rounded-xl p-8 text-center">
            <HardDrive size={48} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">لا توجد نسخ احتياطية محفوظة بعد</p>
            <p className="text-gray-500 text-sm mt-1">قم بإنشاء نسخة احتياطية أولى لبدء الحفاظ على البيانات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((backup, idx) => (
              <div
                key={idx}
                className="bg-elevated border border-violet-700/30 rounded-xl p-4 flex items-center justify-between hover:border-violet-500/50 transition-colors"
              >
                <div>
                  <p className="text-white font-medium">{backup.date}</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {backup.type} • {backup.size}
                  </p>
                </div>
                <button
                  className="px-4 py-2 bg-violet-700/30 border border-violet-500/40 rounded-lg text-violet-300 hover:bg-violet-700/50 text-sm font-medium transition-colors"
                >
                  تحميل
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl px-4 py-3">
        <h4 className="text-orange-300 font-medium mb-2">التوصيات:</h4>
        <ul className="text-orange-400 text-sm space-y-1">
          <li>✓ قم بإنشاء نسخة احتياطية أسبوعية على الأقل</li>
          <li>✓ احفظ النسخ الاحتياطية في أماكن آمنة (مثل Google Drive أو Dropbox)</li>
          <li>✓ اختبر استعادة النسخة الاحتياطية بشكل دوري</li>
          <li>✓ احتفظ بنسخ احتياطية متعددة من فترات مختلفة</li>
        </ul>
      </div>

      {/* تأكيد استعادة النسخة الاحتياطية بكلمة سر - العملية هتمسح وتكتب فوق البيانات الحالية على كل الأجهزة */}
      {pendingRestoreData && (
        <PasswordConfirmModal
          title="استعادة نسخة احتياطية"
          message="سيتم مسح البيانات الحالية (المنتجات، السيريالات، العملاء، الموردين، فواتير البيع والشراء، المدفوعات، المصروفات، أوردرات نون، دفتر اليومية) واستبدالها ببيانات الملف المختار، على كل الأجهزة المتصلة بالنظام. هذا الإجراء نهائي ولا يمكن التراجع عنه."
          confirmLabel={isRestoring ? 'جاري الاستعادة...' : 'استعادة البيانات'}
          onConfirm={handleConfirmRestore}
          onCancel={() => setPendingRestoreData(null)}
        />
      )}
    </div>
  );
}
