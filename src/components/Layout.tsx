import React, { useState } from 'react';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Warehouse,
  DollarSign, BookOpen, BarChart3, Settings, UserCog, Shield,
  ChevronLeft, ChevronRight, Menu, X, Truck, ShoppingBag,
  Store, CreditCard, TrendingUp, FileText
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: <LayoutDashboard size={20} /> },
  { id: 'customers', label: 'العملاء', icon: <Users size={20} /> },
  { id: 'sales', label: 'المبيعات', icon: <ShoppingCart size={20} /> },
  { id: 'purchases', label: 'المشتريات', icon: <ShoppingBag size={20} /> },
  { id: 'inventory', label: 'المخزون', icon: <Package size={20} /> },
  { id: 'suppliers', label: 'الموردون', icon: <Truck size={20} /> },
  { id: 'noon', label: 'نون / أمازون', icon: <Store size={20} /> },
  { id: 'finance', label: 'المالية', icon: <DollarSign size={20} /> },
  { id: 'accounting', label: 'الحسابات العامة', icon: <BookOpen size={20} /> },
  { id: 'reports', label: 'التقارير', icon: <BarChart3 size={20} /> },
  { id: 'expenses', label: 'المصروفات', icon: <CreditCard size={20} /> },
  { id: 'products', label: 'المنتجات', icon: <TrendingUp size={20} /> },
  { id: 'settings', label: 'الإعدادات', icon: <Settings size={20} /> },
];

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  cashBalance: number;
  bankBalance: number;
}

export default function Layout({ currentPage, onNavigate, children, cashBalance, bankBalance }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = navItems.find(n => n.id === currentPage);

  return (
    <div className="flex h-screen bg-[#0f0f1a] text-white overflow-hidden" dir="rtl">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        ${collapsed ? 'w-16' : 'w-64'} 
        ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        fixed lg:relative right-0 top-0 bottom-0 z-50
        bg-[#12122a] border-l border-violet-900/30
        flex flex-col transition-all duration-300 ease-in-out
        shadow-2xl
      `}>
        {/* Logo */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-4 border-b border-violet-900/30`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-violet-900/50">
                ONE
              </div>
              <div>
                <div className="font-black text-white text-lg leading-none">ONE</div>
                <div className="text-violet-400 text-xs">نظام الإدارة</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center font-black text-white text-xs shadow-lg">
              O
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-violet-400 hover:bg-violet-900/30 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-violet-400 hover:bg-violet-900/30"
          >
            <X size={16} />
          </button>
        </div>

        {/* Balance Pills */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-violet-900/20 space-y-2">
            <div className="flex items-center justify-between bg-green-900/20 border border-green-700/30 rounded-xl px-3 py-2">
              <span className="text-xs text-green-400 font-medium">💵 كاش</span>
              <span className="text-xs font-bold text-green-300">{cashBalance.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex items-center justify-between bg-blue-900/20 border border-blue-700/30 rounded-xl px-3 py-2">
              <span className="text-xs text-blue-400 font-medium">🏦 بنك</span>
              <span className="text-xs font-bold text-blue-300">{bankBalance.toLocaleString('ar-EG')} ج.م</span>
            </div>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
              className={`
                w-full flex items-center gap-3 rounded-xl transition-all duration-200
                ${collapsed ? 'justify-center p-3' : 'px-3 py-2.5'}
                ${currentPage === item.id
                  ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40 shadow-lg shadow-violet-900/20'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
              `}
              title={collapsed ? item.label : ''}
            >
              <span className={currentPage === item.id ? 'text-violet-400' : ''}>{item.icon}</span>
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="mr-auto bg-violet-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-3 border-t border-violet-900/30">
            <div className="text-center text-xs text-gray-600">ONE ERP v1.0</div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-[#12122a]/80 backdrop-blur border-b border-violet-900/30 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-400 hover:bg-white/10"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="font-bold text-white text-lg">{currentNav?.label || 'ONE'}</h1>
              <p className="text-xs text-gray-500">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-green-900/30 border border-green-700/40 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-green-400">💵</span>
                <span className="text-green-300 font-bold mr-1">{cashBalance.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-blue-400">🏦</span>
                <span className="text-blue-300 font-bold mr-1">{bankBalance.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-violet-700 flex items-center justify-center text-sm font-bold">
              O
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-[#0f0f1a]">
          {children}
        </main>
      </div>
    </div>
  );
}
