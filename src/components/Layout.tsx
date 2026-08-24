import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  DollarSign,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Truck,
  ShoppingBag,
  Store,
  CreditCard,
  Boxes,
  Search,
  BookOpen,
  Banknote,
  Landmark,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "الرئيسية", icon: <LayoutDashboard size={18} /> },
  { id: "sales", label: "المبيعات", icon: <ShoppingCart size={18} /> },
  { id: "purchases", label: "المشتريات", icon: <ShoppingBag size={18} /> },
  { id: "inventory", label: "المخزون", icon: <Package size={18} /> },
  { id: "products", label: "المنتجات", icon: <Boxes size={18} /> },
  { id: "customers", label: "العملاء", icon: <Users size={18} /> },
  { id: "suppliers", label: "الموردون", icon: <Truck size={18} /> },
  { id: "noon", label: "نون / أمازون", icon: <Store size={18} /> },
  { id: "finance", label: "المالية", icon: <DollarSign size={18} /> },
  { id: "expenses", label: "المصروفات", icon: <CreditCard size={18} /> },
  { id: "journal", label: "اليومية", icon: <BookOpen size={18} /> },
  { id: "reports", label: "التقارير", icon: <BarChart3 size={18} /> },
  { id: "settings", label: "الإعدادات", icon: <Settings size={18} /> },
];

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  cashBalance: number;
  bankBalance: number;
  onOpenSearch?: () => void;
  companyName?: string;
}

export default function Layout({
  currentPage,
  onNavigate,
  children,
  cashBalance,
  bankBalance,
  onOpenSearch,
  companyName = "ONE",
}: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentNav = navItems.find((n) => n.id === currentPage);

  return (
    <div className="flex h-dvh bg-bg text-fg overflow-hidden" dir="rtl">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          w-64 shrink-0 bg-surface border-l border-border flex-col
          ${collapsed ? "lg:w-[72px]" : "lg:w-64"}
          ${mobileOpen ? "flex" : "hidden"}
          lg:flex
          max-lg:fixed max-lg:right-0 max-lg:top-0 max-lg:bottom-0 max-lg:z-50
          lg:relative
          transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]
        `}
      >
        <div
          className={`flex items-center ${
            collapsed ? "justify-center" : "justify-between"
          } px-3 py-4 border-b border-border`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-md bg-accent text-accent-fg flex items-center justify-center font-semibold text-sm tracking-tight shrink-0">
                1
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-fg text-[15px] leading-none truncate">
                  {companyName}
                </div>
                <div className="text-subtle text-[11px] mt-1">نظام المبيعات والمحاسبة</div>
              </div>
            </div>
          )}

          {collapsed && (
            <div className="w-9 h-9 rounded-md bg-accent text-accent-fg flex items-center justify-center font-semibold text-sm">
              1
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-sm text-muted hover:bg-elevated hover:text-fg transition-colors"
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-sm text-muted hover:bg-elevated"
            aria-label="إغلاق القائمة"
          >
            <X size={16} />
          </button>
        </div>

        {!collapsed && (
          <div className="px-3 py-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between bg-elevated border border-border rounded-md px-3 py-2">
              <span className="text-[11px] text-muted flex items-center gap-1.5">
                <Banknote size={12} />
                كاش
              </span>
              <span className="text-xs font-semibold text-good-fg tabular-nums">
                {cashBalance.toLocaleString("ar-EG")} ج.م
              </span>
            </div>
            <div className="flex items-center justify-between bg-elevated border border-border rounded-md px-3 py-2">
              <span className="text-[11px] text-muted flex items-center gap-1.5">
                <Landmark size={12} />
                بنك
              </span>
              <span className="text-xs font-semibold text-info-fg tabular-nums">
                {bankBalance.toLocaleString("ar-EG")} ج.م
              </span>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 rounded-md transition-colors duration-150
                  ${collapsed ? "justify-center p-3" : "px-3 py-2.5"}
                  ${
                    active
                      ? "bg-elevated text-fg border border-border"
                      : "text-muted hover:bg-elevated/70 hover:text-fg border border-transparent"
                  }
                `}
                title={collapsed ? item.label : undefined}
              >
                <span className={active ? "text-accent" : ""}>{item.icon}</span>
                {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          {!collapsed ? (
            <div className="text-[11px] text-subtle text-center">ONE ERP</div>
          ) : (
            <div className="h-4" />
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-surface/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-md text-muted hover:bg-elevated"
              aria-label="فتح القائمة"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-fg text-base truncate">
                {currentNav?.label || companyName}
              </h1>
              <p className="text-[11px] text-subtle truncate">
                {new Date().toLocaleDateString("ar-EG", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 bg-elevated hover:bg-muted-bg border border-border rounded-md px-3 py-2 text-muted transition-colors min-h-11"
            >
              <Search size={16} />
              <span className="hidden md:inline text-sm">بحث شامل</span>
              <kbd className="hidden md:inline text-[10px] bg-muted-bg px-1.5 py-0.5 rounded-sm text-subtle">
                Ctrl+K
              </kbd>
            </button>

            <div className="hidden md:flex items-center gap-2">
              <div className="bg-elevated border border-border rounded-md px-3 py-1.5 text-xs">
                <span className="text-muted">كاش</span>
                <span className="text-good-fg font-semibold mr-1.5 tabular-nums">
                  {cashBalance.toLocaleString("ar-EG")}
                </span>
              </div>
              <div className="bg-elevated border border-border rounded-md px-3 py-1.5 text-xs">
                <span className="text-muted">بنك</span>
                <span className="text-info-fg font-semibold mr-1.5 tabular-nums">
                  {bankBalance.toLocaleString("ar-EG")}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
      </div>
    </div>
  );
}
