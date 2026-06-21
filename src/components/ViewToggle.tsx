import React, { useState } from 'react';
import { ViewMode } from '../types';
import { Grid, List, AlignJustify } from 'lucide-react';

/**
 * Hook لإدارة طريقة العرض (Grid/List/Compact) مع الحفظ التلقائي في localStorage.
 * كل صفحة بتاخد مفتاح فريد (storageKey) عشان كل صفحة تحتفظ باختيارها بشكل مستقل.
 */
export function useViewMode(storageKey: string, defaultMode: ViewMode = 'grid') {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(`view_mode_${storageKey}`);
      if (saved === 'grid' || saved === 'list' || saved === 'compact') return saved;
    } catch { /* ignore */ }
    return defaultMode;
  });

  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try {
      localStorage.setItem(`view_mode_${storageKey}`, v);
    } catch { /* ignore */ }
  };

  return [viewMode, setViewMode] as const;
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** إخفاء بعض الخيارات لو الصفحة ما تدعمهاش (مثلاً compact فقط للجداول الكبيرة) */
  options?: ViewMode[];
}

/**
 * مكوّن بصري لعرض أزرار التبديل بين Grid / List / Compact.
 * يُستخدم في كل صفحة فيها عرض كروت (عملاء، موردين، منتجات...) بشكل موحّد.
 */
export default function ViewToggle({ value, onChange, options = ['grid', 'list', 'compact'] }: ViewToggleProps) {
  const icons: Record<ViewMode, React.ReactNode> = {
    grid: <Grid size={15} />,
    list: <List size={15} />,
    compact: <AlignJustify size={15} />,
  };
  const titles: Record<ViewMode, string> = {
    grid: 'عرض كروت',
    list: 'عرض قائمة',
    compact: 'عرض مدمج',
  };

  return (
    <div className="flex items-center gap-1 bg-[#252545] border border-violet-900/30 rounded-xl p-1">
      {options.map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={titles[v]}
          className={`p-2 rounded-lg transition-colors ${value === v ? 'bg-violet-700/40 text-violet-300' : 'text-gray-500 hover:text-gray-300'}`}
        >
          {icons[v]}
        </button>
      ))}
    </div>
  );
}
