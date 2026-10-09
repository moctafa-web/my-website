import React, { useState, useEffect, useRef, useCallback } from "react";
import { Zap } from "lucide-react";
import Layout from "./components/Layout";
import GlobalSearch from "./components/GlobalSearch";
import QuickEntry from "./components/QuickEntry";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Customers from "./pages/Customers";
import Parties from "./pages/Parties";
import Suppliers from "./pages/Suppliers";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import NoonOrders from "./pages/NoonOrders";
import Settings from "./pages/Settings";
import DailyJournal from "./pages/DailyJournal";
import HealthCheck from "./pages/HealthCheck";
import PendingPurchasePrices from "./pages/PendingPurchasePrices";
import { useStore } from "./store/useStore";
import { getTodayStr } from "./utils/helpers";
import { useAuth } from "./auth";
import Login from "./pages/Login";

export default function ErpApp() {
  const { user, loading: authLoading } = useAuth();
  const [currentPage, setCurrentPageRaw] = useState("dashboard");
  // ===== سجل التنقل: زرار رجوع + زرار الرجوع في المتصفح/الموبايل =====
  // backStack[k] = الصفحة اللي كنا فيها قبل الانتقال رقم k+1 (ومعاها كشف الحساب لو كان مفتوح)
  const pageRef = useRef("dashboard");
  const idxRef = useRef(0);
  const backStack = useRef<{ page: string; stmtId?: string }[]>([]);
  const returnStmtRef = useRef<string | undefined>(undefined);
  const [backPage, setBackPage] = useState<string | null>(null);
  const [pendingCustomerStatementId, setPendingCustomerStatementId] = useState<string | null>(null);
  const [pendingSupplierStatementId, setPendingSupplierStatementId] = useState<string | null>(null);

  const syncBack = () => {
    const st = backStack.current;
    setBackPage(st.length ? st[st.length - 1].page : null);
  };

  const setCurrentPage = useCallback((page: string) => {
    if (page === pageRef.current) return;
    backStack.current.push({ page: pageRef.current, stmtId: returnStmtRef.current });
    if (backStack.current.length > 40) backStack.current.shift();
    returnStmtRef.current = undefined;
    pageRef.current = page;
    idxRef.current = backStack.current.length;
    try { window.history.pushState({ ...(window.history.state || {}), one: true, idx: idxRef.current, page }, ""); } catch { /* ignore */ }
    setCurrentPageRaw(page);
    syncBack();
  }, []);

  useEffect(() => {
    try { window.history.replaceState({ ...(window.history.state || {}), one: true, idx: 0, page: "dashboard" }, ""); } catch { /* ignore */ }
    const onPop = (e: PopStateEvent) => {
      const st = e.state;
      if (!st || !st.one) return;
      const newIdx: number = typeof st.idx === "number" ? st.idx : 0;
      if (newIdx < idxRef.current) {
        const entry = backStack.current[newIdx];
        backStack.current.length = newIdx;
        const target = entry?.page ?? st.page ?? "dashboard";
        if (entry?.stmtId) setPendingCustomerStatementId(entry.stmtId);
        pageRef.current = target;
        setCurrentPageRaw(target);
      } else if (newIdx > idxRef.current) {
        backStack.current.push({ page: pageRef.current });
        pageRef.current = st.page ?? pageRef.current;
        setCurrentPageRaw(pageRef.current);
      }
      idxRef.current = newIdx;
      syncBack();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goBack = () => { if (backStack.current.length) window.history.back(); };
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [pendingSerialId, setPendingSerialId] = useState<string | null>(null);
  const [pendingSalesDateFilter, setPendingSalesDateFilter] = useState<string | null>(null);
  const [pendingPurchasesDateFilter, setPendingPurchasesDateFilter] = useState<string | null>(null);
  const [pendingSaleInvoiceId, setPendingSaleInvoiceId] = useState<string | null>(null);
  const [pendingPurchaseInvoiceId, setPendingPurchaseInvoiceId] = useState<string | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  const store = useStore();
  const { state, isLoading, loadError } = store;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-gray-300">جاري التحقق من تسجيل الدخول...</div>;
  }

  if (!user) return <Login />;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-gray-300">جاري تحميل بيانات Firebase...</div>;
  }

  if (loadError) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-6 text-center text-gray-300"><div><h1 className="text-xl font-semibold">تعذر تحميل بيانات Firebase</h1><p className="mt-3 text-gray-400">{loadError}</p><p className="mt-4 text-xs text-gray-500">Build: firebase-auth-guard-2026-09-06</p><button className="mt-6 rounded-lg bg-violet-600 px-5 py-2 text-white" onClick={() => window.location.reload()}>إعادة المحاولة</button></div></div>;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            state={state}
            onNavigate={setCurrentPage}
            onNewSale={() => setCurrentPage("sales")}
            onNewPurchase={() => setCurrentPage("purchases")}
            adjustTreasury={store.adjustTreasury}
            onAddPayment={store.addPayment}
            onCompletePendingSerial={() => setCurrentPage("pending-prices")}
            onOpenStatement={(type, id) => {
              if (type === "customer") {
                setPendingCustomerStatementId(id);
                setCurrentPage("parties");
              } else {
                setPendingSupplierStatementId(id);
                setCurrentPage("parties");
              }
            }}
            onViewTodayInvoices={(kind) => {
              const today = getTodayStr();
              if (kind === "sales") {
                setPendingSalesDateFilter(today);
                setCurrentPage("sales");
              } else {
                setPendingPurchasesDateFilter(today);
                setCurrentPage("purchases");
              }
            }}
          />
        );
      case "parties":
        return (
          <Parties
            parties={state.parties}
            saleInvoices={state.saleInvoices}
            purchaseInvoices={state.purchaseInvoices}
            payments={state.payments}
            onAddParty={store.addParty}
            onUpdateParty={store.updateParty}
            onDeleteParty={store.deleteParty}
            onAddPayment={store.addPayment}
            onDeletePayment={store.deletePayment}
            onUpdatePayment={store.updatePayment}
            onUpdatePaymentDate={store.updatePaymentDate}
            onUpdateSaleInvoiceDate={store.updateSaleInvoiceDate}
            onUpdatePurchaseInvoiceDate={store.updatePurchaseInvoiceDate}
            onNavigateToSales={(id) => { setPendingCustomerId(id); setCurrentPage("sales"); }}
            onNavigateToPurchases={(id) => { setPendingSupplierId(id); setCurrentPage("purchases"); }}
            onOpenInvoice={(type, id, partyId) => {
              returnStmtRef.current = partyId; // عشان نرجع لنفس كشف الحساب
              if (type === "sale") {
                setPendingSaleInvoiceId(id);
                setCurrentPage("sales");
              } else {
                setPendingPurchaseInvoiceId(id);
                setCurrentPage("purchases");
              }
            }}
            preselectedStatementId={pendingCustomerStatementId || pendingSupplierStatementId}
            onPreselectedStatementHandled={() => { setPendingCustomerStatementId(null); setPendingSupplierStatementId(null); }}
          />
        );

      case "customers":
        return (
          <Customers
            customers={state.customers}
            saleInvoices={state.saleInvoices}
            purchaseInvoices={state.purchaseInvoices}
            payments={state.payments}
            cashBalance={state.cashBalance}
            bankBalance={state.bankBalance}
            onAddCustomer={store.addCustomer}
            onUpdateCustomer={store.updateCustomer}
            onDeleteCustomer={store.deleteCustomer}
            onAddPayment={store.addPayment}
            onUpdateSaleInvoice={store.updateSaleInvoice}
            onNavigateToSales={(customerId) => {
              setPendingCustomerId(customerId);
              setCurrentPage("sales");
            }}
            preselectedStatementCustomerId={pendingCustomerStatementId}
            onPreselectedStatementHandled={() => setPendingCustomerStatementId(null)}
          />
        );
      case "sales":
        return (
          <Sales
            saleInvoices={state.saleInvoices}
            customers={state.customers}
            products={state.products}
            serials={state.serials}
            brands={state.brands}
            settings={state.settings}
            suppliers={state.suppliers}
            onAddSaleInvoice={store.addSaleInvoice}
            onAddCustomer={store.addCustomer}
            onUpdateSaleInvoice={store.updateSaleInvoice}
            onDeleteSaleInvoice={store.deleteSaleInvoice}
            preselectedCustomerId={pendingCustomerId}
            onPreselectedHandled={() => setPendingCustomerId(null)}
            onAddProduct={store.addProduct}
            onAddSupplier={store.addSupplier}
            onAddPurchaseInvoice={store.addPurchaseInvoice}
            onAddSerials={store.addSerials}
            preselectedDateFilter={pendingSalesDateFilter}
            onPreselectedDateFilterHandled={() => setPendingSalesDateFilter(null)}
            preselectedInvoiceId={pendingSaleInvoiceId}
            onPreselectedInvoiceHandled={() => setPendingSaleInvoiceId(null)}
          />
        );
      case "purchases":
        return (
          <Purchases
            purchaseInvoices={state.purchaseInvoices}
            suppliers={state.suppliers}
            customers={state.customers}
            products={state.products}
            serials={state.serials}
            brands={state.brands}
            settings={state.settings}
            onAddPurchaseInvoice={store.addPurchaseInvoice}
            onAddSupplier={store.addSupplier}
            onAddProduct={store.addProduct}
            onAddSerials={store.addSerials}
            onUpdatePurchaseInvoice={store.updatePurchaseInvoice}
            onDeletePurchaseInvoice={store.deletePurchaseInvoice}
            onCompletePendingPurchase={store.completePendingPurchase}
            preselectedSupplierId={pendingSupplierId}
            onPreselectedHandled={() => setPendingSupplierId(null)}
            preselectedPendingSerialId={pendingSerialId}
            onPreselectedPendingSerialHandled={() => setPendingSerialId(null)}
            preselectedDateFilter={pendingPurchasesDateFilter}
            onPreselectedDateFilterHandled={() => setPendingPurchasesDateFilter(null)}
            preselectedInvoiceId={pendingPurchaseInvoiceId}
            onPreselectedInvoiceHandled={() => setPendingPurchaseInvoiceId(null)}
          />
        );
      case "pending-prices":
        return (
          <PendingPurchasePrices
            serials={state.serials}
            purchaseInvoices={state.purchaseInvoices}
            suppliers={state.suppliers}
            settings={state.settings}
            onCompletePendingPurchase={store.completePendingPurchase}
            onNavigate={setCurrentPage}
          />
        );
      case "inventory":
        return (
          <Inventory
            products={state.products}
            serials={state.serials}
            saleInvoices={state.saleInvoices}
            purchaseInvoices={state.purchaseInvoices}
            noonOrders={state.noonOrders}
            customers={state.customers}
            onUpdateProduct={store.updateProduct}
            weeklyInventoryCounts={state.weeklyInventoryCounts}
            onAddCount={store.addWeeklyInventoryCount}
            onUpdateCount={store.updateWeeklyInventoryCount}
            onApproveCount={store.approveWeeklyInventoryCount}
            stockTransfers={state.stockTransfers}
            onAddTransfer={store.addStockTransfer}
            onUpdateTransfer={store.updateStockTransfer}
            dailyOperations={state.dailyOperations}
            dailyInventoryScans={state.dailyInventoryScans}
            onAddDailyInventoryScan={store.addDailyInventoryScan}
            onUpdateDailyInventoryScan={store.updateDailyInventoryScan}
          />
        );
      case "suppliers":
        return (
          <Suppliers
            suppliers={state.suppliers}
            purchaseInvoices={state.purchaseInvoices}
            saleInvoices={state.saleInvoices}
            payments={state.payments}
            onAddSupplier={store.addSupplier}
            onUpdateSupplier={store.updateSupplier}
            onDeleteSupplier={store.deleteSupplier}
            onAddPayment={store.addPayment}
            onUpdatePurchaseInvoice={store.updatePurchaseInvoice}
            onNavigateToPurchases={(supplierId) => {
              setPendingSupplierId(supplierId);
              setCurrentPage("purchases");
            }}
            preselectedStatementSupplierId={pendingSupplierStatementId}
            onPreselectedStatementHandled={() => setPendingSupplierStatementId(null)}
          />
        );
      case "noon":
        return (
          <NoonOrders
            noonOrders={state.noonOrders}
            products={state.products}
            serials={state.serials}
            onAddNoonOrder={store.addNoonOrder}
            onUpdateNoonOrder={store.updateNoonOrder}
            onAddNoonOrders={store.addNoonOrders}
            onSettleNoonOrders={store.settleNoonOrders}
            onReturnNoonOrders={store.returnNoonOrders}
          />
        );
      case "finance":
        return (
          <Finance
            cashBalance={state.cashBalance}
            bankBalance={state.bankBalance}
            transactions={state.treasuryTransactions}
            dailyClosings={state.dailyClosings}
            adjustTreasury={store.adjustTreasury}
            partners={state.partners}
            onAddPartner={store.addPartner}
            onUpdatePartner={store.updatePartner}
            onDeletePartner={store.deletePartner}
            employees={state.employees}
            onAddEmployee={store.addEmployee}
            onUpdateEmployee={store.updateEmployee}
            onDeleteEmployee={store.deleteEmployee}
            onAddPartyMoneyMovement={store.addPartyMoneyMovement}
            profitDistributions={state.profitDistributions}
            onSaveDistribution={store.saveDistribution}
            onDeleteDistribution={store.deleteDistribution}
            saleInvoices={state.saleInvoices}
            purchaseInvoices={state.purchaseInvoices}
            expenses={state.expenses}
            noonOrders={state.noonOrders}
          />
        );
      case "reports":
        return <Reports state={state} />;
      case "health":
        return <HealthCheck state={state} />;
      case "expenses":
        return <Expenses expenses={state.expenses} onAddExpense={store.addExpense} />;
      case "products":
        return (
          <Products
            products={state.products}
            serials={state.serials}
            brands={state.brands}
            onAddProduct={store.addProduct}
            onUpdateProduct={store.updateProduct}
            onDeleteProduct={store.deleteProduct}
            onAddBrand={store.addBrand}
          />
        );
      case "settings":
        return (
          <Settings
            settings={state.settings}
            onUpdateSettings={store.updateSettings}
            cashBalance={state.cashBalance}
            bankBalance={state.bankBalance}
            onResetData={store.resetAllData}
            onDeleteAllNoonOrders={store.deleteAllNoonOrders}
            noonOrdersCount={state.noonOrders.length}
            fullState={state}
            onBackfillPaymentRecords={store.backfillPaymentRecords}
            onRecalculatePartyTotals={store.recalculatePartyTotals}
            onRestoreBackup={store.restoreFullState}
          />
        );
      case "journal":
        return (
          <DailyJournal
            journals={state.dailyJournals}
            treasuryTransactions={state.treasuryTransactions}
            onSaveJournal={store.saveDailyJournal}
          />
        );
      default:
        return <div className="p-8 text-center text-muted">الصفحة قيد التطوير...</div>;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      backPage={backPage}
      onBack={goBack}
      cashBalance={state.cashBalance}
      bankBalance={state.bankBalance}
      onOpenSearch={() => setShowGlobalSearch(true)}
      companyName={state.settings.companyName}
    >
      {renderPage()}
      {showGlobalSearch && (
        <GlobalSearch
          state={state}
          onNavigate={setCurrentPage}
          onClose={() => setShowGlobalSearch(false)}
        />
      )}

      <button
        onClick={() => setShowQuickEntry(true)}
        title="إدخال سريع"
        className="fixed bottom-6 left-6 z-[90] w-14 h-14 rounded-full bg-accent text-accent-fg shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform border border-border-strong"
      >
        <Zap size={22} />
      </button>

      {showQuickEntry && (
        <QuickEntry
          products={state.products}
          customers={state.customers}
          suppliers={state.suppliers}
          parties={state.parties}
          payments={state.payments}
          serials={state.serials}
          saleInvoices={state.saleInvoices}
          purchaseInvoices={state.purchaseInvoices}
          settings={state.settings}
          onAddSaleInvoice={store.addSaleInvoice}
          onAddPurchaseInvoice={store.addPurchaseInvoice}
          onAddNoonOrder={store.addNoonOrder}
          onAddCustomer={store.addCustomer}
          onAddSupplier={store.addSupplier}
          onAddSerials={store.addSerials}
          onAddPayment={store.addPayment}
          expenses={state.expenses}
          partners={state.partners}
          employees={state.employees}
          cashBalance={state.cashBalance}
          bankBalance={state.bankBalance}
          onAddExpense={store.addExpense}
          onAddTreasuryTransfer={store.addTreasuryTransfer}
          onAddTreasuryAdjustment={store.addTreasuryAdjustment}
          onAddPartyMoneyMovement={store.addPartyMoneyMovement}
          onClose={() => setShowQuickEntry(false)}
        />
      )}
    </Layout>
  );
}
