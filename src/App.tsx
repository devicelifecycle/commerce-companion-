import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// Eagerly loaded — always needed on first paint
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazily loaded — only fetched when the user navigates to that route
const Home             = lazy(() => import("./pages/Home"));
const Dashboard        = lazy(() => import("./pages/Dashboard"));
const Inventory        = lazy(() => import("./pages/Inventory"));
const Import           = lazy(() => import("./pages/Import"));
const Sales            = lazy(() => import("./pages/Sales"));
const Suppliers        = lazy(() => import("./pages/Suppliers"));
const Settings         = lazy(() => import("./pages/Settings"));
const Expenses         = lazy(() => import("./pages/Expenses"));
const Invoices         = lazy(() => import("./pages/Invoices"));
const Financials       = lazy(() => import("./pages/Financials"));
const Forecasting      = lazy(() => import("./pages/Forecasting"));
const HelpAndGuides    = lazy(() => import("./pages/HelpAndGuides"));
const PurchaseOrders   = lazy(() => import("./pages/PurchaseOrders"));
const Returns          = lazy(() => import("./pages/Returns"));
const IntegrationHealth = lazy(() => import("./pages/IntegrationHealth"));
const Customers        = lazy(() => import("./pages/Customers"));
const ActivityLogPage  = lazy(() => import("./pages/ActivityLogPage"));
const Partners             = lazy(() => import("./pages/Partners"));
const PartnerDetail        = lazy(() => import("./pages/PartnerDetail"));
const PartnerDeviceDetail  = lazy(() => import("./pages/PartnerDeviceDetail"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx — those are permanent failures (auth, not found)
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && /4\d\d/.test(error.message)) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,      // 30s before background refetch
      gcTime: 5 * 60_000,     // 5min before cache eviction
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, guardPending } = useAuth();

  if (loading || guardPending) {
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

  return (
    <ErrorBoundary fallbackTitle="This page encountered an error">
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
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
              <Route path="/" element={<Index />} />
              <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
              <Route path="/import" element={<ProtectedRoute><Import /></ProtectedRoute>} />
              <Route path="/refurbishment" element={<Navigate to="/inventory?tab=refurbishment" replace />} />
              <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
              <Route path="/goods-received" element={<Navigate to="/purchase-orders" replace />} />
              <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
              <Route path="/financials" element={<ProtectedRoute><Financials /></ProtectedRoute>} />
              <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
              <Route path="/cost-ledger" element={<Navigate to="/financials" replace />} />
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
              <Route path="/audit-logs" element={<Navigate to="/activity" replace />} />
              <Route path="/activity" element={<ProtectedRoute><ActivityLogPage /></ProtectedRoute>} />
              <Route path="/suspense" element={<Navigate to="/orders?tab=pending" replace />} />
              <Route path="/integration-health" element={<ProtectedRoute><IntegrationHealth /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/help" element={<ProtectedRoute><HelpAndGuides /></ProtectedRoute>} />
              <Route path="/guides" element={<Navigate to="/help" replace />} />
              <Route path="/accounting-guides" element={<Navigate to="/help" replace />} />
              {/* Redirects for old routes */}
              <Route path="/sales" element={<Navigate to="/orders" replace />} />
              <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/partners" element={<ProtectedRoute><Partners /></ProtectedRoute>} />
              <Route path="/partners/:id" element={<ProtectedRoute><PartnerDetail /></ProtectedRoute>} />
              <Route path="/partners/:partnerId/devices/:deviceId" element={<ProtectedRoute><PartnerDeviceDetail /></ProtectedRoute>} />
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
