import { AppState } from '../types';
import { generateId } from '../utils/helpers';

export interface BackupFile {
  id: string;
  date: string;
  size: number;
  backupType: 'manual' | 'automatic';
  description?: string;
}

export const BACKUP_LAST_AT_KEY = 'one_erp_last_backup_at';

export const BackupService = {
  /**
   * إنشاء نسخة احتياطية من البيانات
   */
  createBackup(state: AppState, backupType: 'manual' | 'automatic' = 'manual', description?: string): { backup: string; backupInfo: BackupFile } {
    const backup = JSON.stringify(state);
    const size = new Blob([backup]).size;
    
    const backupInfo: BackupFile = {
      id: `backup-${generateId()}`,
      date: new Date().toISOString(),
      size,
      backupType,
      description,
    };

    try { localStorage.setItem(BACKUP_LAST_AT_KEY, backupInfo.date); } catch {}
    return { backup, backupInfo };
  },

  /**
   * تحميل النسخة الاحتياطية كملف JSON
   */
  downloadBackup(backup: string, filename: string = `backup-${new Date().toISOString().split('T')[0]}.json`): void {
    const blob = new Blob([backup], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * استعادة البيانات من نسخة احتياطية
   */
  restoreBackup(backupJson: string): { success: boolean; data?: AppState; error?: string } {
    try {
      const data = JSON.parse(backupJson) as AppState;
      
      // التحقق من أن البيانات تحتوي على الحقول الأساسية
      if (!data.products || !data.customers || !data.saleInvoices) {
        return {
          success: false,
          error: 'ملف النسخة الاحتياطية غير صحيح. البيانات مفقودة.',
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: `خطأ في قراءة الملف: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
      };
    }
  },

  /**
   * حساب حجم النسخة الاحتياطية
   */
  getLastBackupDate(): string | null {
    try { return localStorage.getItem(BACKUP_LAST_AT_KEY); } catch { return null; }
  },

  isBackupStale(maxAgeDays = 7): boolean {
    const last = this.getLastBackupDate();
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > maxAgeDays * 24 * 60 * 60 * 1000;
  },

  formatBackupSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * حساب عدد الأيام بين تاريخين
   */
  daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  /**
   * تحديد ما إذا كان يجب إجراء نسخة احتياطية أسبوعية (كل يوم جمعة مثلاً)
   */
  shouldDoWeeklyBackup(lastBackupDate?: string): boolean {
    if (!lastBackupDate) return true;
    const days = this.daysBetween(lastBackupDate, new Date().toISOString());
    return days >= 7;
  },

  /**
   * الحصول على إحصائيات الحالة للنسخة الاحتياطية
   */
  getBackupStats(state: AppState): {
    totalItems: number;
    backupSize: string;
    lastBackupDate?: string;
  } {
    const totalItems =
      state.products.length +
      state.customers.length +
      state.suppliers.length +
      state.saleInvoices.length +
      state.purchaseInvoices.length +
      state.noonOrders.length;

    const { backup } = this.createBackup(state);
    const size = new Blob([backup]).size;

    return {
      totalItems,
      backupSize: this.formatBackupSize(size),
      lastBackupDate: state.dailyClosings[0]?.date,
    };
  },
};
