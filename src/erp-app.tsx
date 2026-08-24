import React, { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import Layout from "./components/Layout";
import GlobalSearch from "./components/GlobalSearch";
import QuickEntry from "./components/QuickEntry";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import NoonOrders from "./pages/NoonOrders";
import Settings from "./pages/Settings";
import DailyJournal from "./pages/DailyJournal";
import HealthCheck from "./pages/HealthCheck";
import { useStore } from "./store/useStore";
import { getTodayStr } from "./utils/helpers";

export default function ErpApp() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [pendingSerialId, setPendingSerialId] = useState<string | null>(null);
  const [pendingCustomerStatementId, setPendingCustomerStatementId] = useState<string | null>(null);
  const [pendingSupplierStatementId, setPendingSupplierStatementId] = useState<string | null>(null);
  const [pendingSalesDateFilter, setPendingSalesDateFilter] = useState<string | null>(null);
  const [pendingPurchasesDateFilter, setPendingPurchasesDateFilter] = useState<string | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  const store = useStore();
  const { state } = store;

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
            onCompletePendingSerial={(serialId) => {
              setPendingSerialId(serialId);
              setCurrentPage("purchases");
            }}
            onOpenStatement={(type, id) => {
              if (type === "customer") {
                setPendingCustomerStatementId(id);
                setCurrentPage("customers");
              } else {
                setPendingSupplierStatementId(id);
                setCurrentPage("suppliers");
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
      case "customers":
        return (
          <Customers
            customers={state.customers}
            saleInvoices={state.saleInvoices}
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
          />
        );
      case "purchases":
        return (
          <Purchases
            purchaseInvoices={state.purchaseInvoices}
            suppliers={state.suppliers}
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
          onClose={() => setShowQuickEntry(false)}
        />
      )}
    </Layout>
  );
}
