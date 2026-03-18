import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { useMfaGuard } from "@/hooks/useMfaGuard";
import Index from "./pages/Index";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import MfaEnroll from "./pages/MfaEnroll";
import MfaVerify from "./pages/MfaVerify";
import Inventory from "./pages/Inventory";
import Import from "./pages/Import";
import Sales from "./pages/Sales";
import Suppliers from "./pages/Suppliers";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import Expenses from "./pages/Expenses";
import Invoices from "./pages/Invoices";
import Reports from "./pages/Reports";
import Financials from "./pages/Financials";
import Forecasting from "./pages/Forecasting";
import NotFound from "./pages/NotFound";
import AuditLogs from "./pages/AuditLogs";
import Help from "./pages/Help";
import PurchaseOrders from "./pages/PurchaseOrders";
import GoodsReceived from "./pages/GoodsReceived";
import Returns from "./pages/Returns";
import IntegrationHealth from "./pages/IntegrationHealth";
import CostLedger from "./pages/CostLedger";
import Customers from "./pages/Customers";
import Guides from "./pages/Guides";
import AccountingKnowledge from "./pages/AccountingKnowledge";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { mfaRequired, mfaChecking } = useMfaGuard();

  if (loading || mfaChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (mfaRequired === 'enroll') {
    return <Navigate to="/mfa-enroll" replace />;
  }

  if (mfaRequired === 'verify') {
    return <Navigate to="/mfa-verify" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <CompanyProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/mfa-enroll" element={<MfaEnroll />} />
              <Route path="/mfa-verify" element={<MfaVerify />} />
              <Route path="/" element={<Index />} />
              <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
              <Route path="/import" element={<ProtectedRoute><Import /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
              <Route path="/goods-received" element={<Navigate to="/purchase-orders" replace />} />
              <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
              <Route path="/financials" element={<ProtectedRoute><Financials /></ProtectedRoute>} />
              <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
              <Route path="/cost-ledger" element={<ProtectedRoute><CostLedger /></ProtectedRoute>} />
              <Route path="/forecasting" element={<ProtectedRoute><Forecasting /></ProtectedRoute>} />
              {/* Redirects for old routes */}
              <Route path="/statements/profit-loss" element={<Navigate to="/financials" replace />} />
              <Route path="/statements/balance-sheet" element={<Navigate to="/financials" replace />} />
              <Route path="/statements/cash-flow" element={<Navigate to="/financials" replace />} />
              <Route path="/accounting/ap" element={<Navigate to="/financials" replace />} />
              <Route path="/accounting/ar" element={<Navigate to="/financials" replace />} />
              <Route path="/taxes" element={<Navigate to="/financials" replace />} />
              <Route path="/accounting/knowledge" element={<Navigate to="/financials" replace />} />
              <Route path="/team" element={<Navigate to="/settings" replace />} />
              <Route path="/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
              <Route path="/integration-health" element={<ProtectedRoute><IntegrationHealth /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
              <Route path="/guides" element={<ProtectedRoute><Guides /></ProtectedRoute>} />
              <Route path="/accounting-guides" element={<ProtectedRoute><AccountingKnowledge /></ProtectedRoute>} />
              {/* Redirects for old routes */}
              <Route path="/sales" element={<Navigate to="/orders" replace />} />
              <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/accounting" element={<Navigate to="/financials" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </CompanyProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
