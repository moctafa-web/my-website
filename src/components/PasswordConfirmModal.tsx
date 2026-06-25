import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';

// كلمة السر المطلوبة لتأكيد العمليات الخطيرة (حذف نهائي / إعادة تعيين).
// ملاحظة أمنية: هذا تأكيد بسيط على مستوى الواجهة لمنع الحذف بالخطأ، وليس حماية أمنية حقيقية
// (لأن أي كود في المتصفح يمكن قراءته من المصدر)، لكنه كافٍ لمنع الحذف العرضي أو غير المقصود من أي شخص يستخدم الجهاز.
const CONFIRM_PASSWORD = 'ONE2024DELETE';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function PasswordConfirmModal({ title, message, confirmLabel = 'تأكيد الحذف', onConfirm, onCancel }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (password !== CONFIRM_PASSWORD) {
      setError('كلمة السر غير صحيحة');
      return;
    }
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4">
      <div className="bg-[#1a1a35] border border-red-700/50 rounded-2xl p-6 w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto mb-3">
          <ShieldAlert className="text-red-400" size={26} />
        </div>
        <h3 className="font-bold text-white text-lg mb-2">{title}</h3>
        <p className="text-gray-400 text-sm mb-4">{message}</p>

        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          placeholder="اكتب كلمة السر للتأكيد"
          className="input-dark w-full text-center mb-2"
          autoFocus
        />
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={loading || !password}
            className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium disabled:opacity-50"
          >
            {loading ? '⏳ جاري التنفيذ...' : `🗑️ ${confirmLabel}`}
          </button>
          <button onClick={onCancel} className="btn-secondary flex-1" disabled={loading}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
