import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Loader } from "./components/ui/Surfaces";

import AuthLayout from "./layouts/AuthLayout";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SKUList from "./pages/skus/SKUList";
import SKUForm from "./pages/skus/SKUForm";
import VendorList from "./pages/vendors/VendorList";
import PartyList from "./pages/parties/PartyList";
import PurchaseEntry from "./pages/purchases/PurchaseEntry";
import PurchaseList from "./pages/purchases/PurchaseList";
import OrderEntry from "./pages/orders/OrderEntry";
import BulkOrderGrid from "./pages/orders/BulkOrderGrid";
import OrderList from "./pages/orders/OrderList";
import ReturnEntry from "./pages/returns/ReturnEntry";
import ReceivablesList from "./pages/receivables/ReceivablesList";
import ReceivablesAging from "./pages/receivables/ReceivablesAging";
import ChannelPnL from "./pages/reports/ChannelPnL";
import SkuPnL from "./pages/reports/SkuPnL";
import InventoryValuation from "./pages/reports/InventoryValuation";
import DeadStock from "./pages/reports/DeadStock";
import Performance from "./pages/reports/Performance";
import AuditLog from "./pages/reports/AuditLog";
import SystemSettings from "./pages/settings/SystemSettings";

function ProtectedRoute({ children }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <Loader label="Checking your session…" />
      </div>
    );
  }
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { status } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          status === "authenticated" ? (
            <Navigate to="/" replace />
          ) : (
            <AuthLayout>
              <Login />
            </AuthLayout>
          )
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="skus" element={<SKUList />} />
        <Route path="skus/new" element={<SKUForm />} />
        <Route path="skus/:skuId" element={<SKUForm />} />

        <Route path="vendors" element={<VendorList />} />
        <Route path="parties" element={<PartyList />} />

        <Route path="purchases" element={<PurchaseList />} />
        <Route path="purchases/new" element={<PurchaseEntry />} />

        <Route path="orders" element={<OrderList />} />
        <Route path="orders/new" element={<OrderEntry />} />
        <Route path="orders/bulk" element={<BulkOrderGrid />} />

        <Route path="returns" element={<ReturnEntry />} />

        <Route path="receivables" element={<ReceivablesList />} />
        <Route path="receivables/aging" element={<ReceivablesAging />} />

        <Route path="reports/channel-pnl" element={<ChannelPnL />} />
        <Route path="reports/sku-pnl" element={<SkuPnL />} />
        <Route path="reports/inventory-valuation" element={<InventoryValuation />} />
        <Route path="reports/dead-stock" element={<DeadStock />} />
        <Route path="reports/performance" element={<Performance />} />
        <Route path="reports/audit-log" element={<AuditLog />} />

        <Route path="settings" element={<SystemSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
