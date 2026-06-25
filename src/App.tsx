import { useAuth } from './auth';
import Login from './pages/Login';
import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Inventory from './pages/Inventory';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Expenses from './pages/Expenses';
import NoonOrders from './pages/NoonOrders';
import Settings from './pages/Settings';
import DailyJournal from './pages/DailyJournal';
import { useStore } from './store/useStore';

export default function App() {
  const { user, loading } = useAuth();

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);

  const store = useStore();
  const { state } = store;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            state={state}
            onNavigate={setCurrentPage}
            onNewSale={() => setCurrentPage('sales')}
            onNewPurchase={() => setCurrentPage('purchases')}
            adjustTreasury={store.adjustTreasury}
          />
        );

      case 'customers':
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
              setCurrentPage('sales');
            }}
          />
        );

      case 'sales':
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
          />
        );

      case 'purchases':
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
            preselectedSupplierId={pendingSupplierId}
            onPreselectedHandled={() => setPendingSupplierId(null)}
          />
        );

      case 'inventory':
        return (
          <Inventory
            products={state.products}
            serials={state.serials}
            saleInvoices={state.saleInvoices}
            purchaseInvoices={state.purchaseInvoices}
            noonOrders={state.noonOrders}
          />
        );

      case 'suppliers':
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
              setCurrentPage('purchases');
            }}
          />
        );

      case 'noon':
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

      case 'finance':
        return (
          <Finance
            cashBalance={state.cashBalance}
            bankBalance={state.bankBalance}
            transactions={state.treasuryTransactions}
            dailyClosings={state.dailyClosings}
            adjustTreasury={store.adjustTreasury}
          />
        );

      case 'reports':
        return <Reports state={state} />;

      case 'expenses':
        return (
          <Expenses
            expenses={state.expenses}
            onAddExpense={store.addExpense}
          />
        );

      case 'products':
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

      case 'settings':
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
          />
        );

      case 'journal':
        return (
          <DailyJournal
            journals={state.dailyJournals}
            onSaveJournal={store.saveDailyJournal}
          />
        );

      default:
        return (
          <div className="p-8 text-center text-gray-500">الصفحة قيد التطوير...</div>
        );
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      cashBalance={state.cashBalance}
      bankBalance={state.bankBalance}
    >
      {renderPage()}
    </Layout>
  );
}