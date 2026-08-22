import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { PageLoader } from "@/components/shared/PageLoader";
import { PwaUpdater } from "@/components/shared/PwaUpdater";

// Auth pages — small, always needed, keep eager
import { LoginPage } from "@/features/auth/LoginPage";
import { MfaChallengePage } from "@/features/auth/MfaChallengePage";

// Layouts — needed before any page renders, keep eager
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { PortalLayout } from "@/layouts/PortalLayout";
import { SupplierPortalLayout } from "@/layouts/SupplierPortalLayout";
import { DriverLayout } from "@/layouts/DriverLayout";

// All page components — lazy-loaded so each becomes its own JS chunk
const UsersPage = lazy(() => import("@/features/auth/UsersPage").then((m) => ({ default: m.UsersPage })));
const DashboardPage = lazy(() => import("@/features/analytics/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const CategoriesPage = lazy(() => import("@/features/inventory/CategoriesPage").then((m) => ({ default: m.CategoriesPage })));
const ProductsPage = lazy(() => import("@/features/inventory/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const ProductDetailPage = lazy(() => import("@/features/inventory/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })));
const StocktakePage = lazy(() => import("@/features/inventory/StocktakePage").then((m) => ({ default: m.StocktakePage })));
const StocktakeSessionPage = lazy(() => import("@/features/inventory/StocktakeSessionPage").then((m) => ({ default: m.StocktakeSessionPage })));
const POSPage = lazy(() => import("@/features/sales/POSPage").then((m) => ({ default: m.POSPage })));
const SalesOrdersPage = lazy(() => import("@/features/sales/SalesOrdersPage").then((m) => ({ default: m.SalesOrdersPage })));
const SalesOrderDetailPage = lazy(() => import("@/features/sales/SalesOrderDetailPage").then((m) => ({ default: m.SalesOrderDetailPage })));
const DiscountsPage = lazy(() => import("@/features/sales/DiscountsPage").then((m) => ({ default: m.DiscountsPage })));
const TaxRatesPage = lazy(() => import("@/features/sales/TaxRatesPage").then((m) => ({ default: m.TaxRatesPage })));
const CustomerDashboardPage = lazy(() => import("@/features/customer-portal/CustomerDashboardPage").then((m) => ({ default: m.CustomerDashboardPage })));
const OrdersPage = lazy(() => import("@/features/customer-portal/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("@/features/customer-portal/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const WalletPage = lazy(() => import("@/features/customer-portal/WalletPage").then((m) => ({ default: m.WalletPage })));
const SupplierStockPage = lazy(() => import("@/features/suppliers/SupplierStockPage").then((m) => ({ default: m.SupplierStockPage })));
const CustomersPage = lazy(() => import("@/features/customers/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const SupplierDashboardPage = lazy(() => import("@/features/supplier-portal/SupplierDashboardPage").then((m) => ({ default: m.SupplierDashboardPage })));
const SupplierCompaniesPage = lazy(() => import("@/features/supplier-portal/SupplierCompaniesPage").then((m) => ({ default: m.SupplierCompaniesPage })));
const SupplierProductsPage = lazy(() => import("@/features/supplier-portal/SupplierProductsPage").then((m) => ({ default: m.SupplierProductsPage })));
const StockRequestsPage = lazy(() => import("@/features/supplier-portal/StockRequestsPage").then((m) => ({ default: m.StockRequestsPage })));
const SupplierCategoriesPage = lazy(() => import("@/features/supplier-portal/SupplierCategoriesPage").then((m) => ({ default: m.SupplierCategoriesPage })));
const DispatchBoardPage = lazy(() => import("@/features/delivery/DispatchBoardPage").then((m) => ({ default: m.DispatchBoardPage })));
const DeliveryDetailPage = lazy(() => import("@/features/delivery/DeliveryDetailPage").then((m) => ({ default: m.DeliveryDetailPage })));
const DeliveryIssuesPage = lazy(() => import("@/features/delivery/DeliveryIssuesPage").then((m) => ({ default: m.DeliveryIssuesPage })));
const DriverActivePage = lazy(() => import("@/features/driver-portal/DriverActivePage").then((m) => ({ default: m.DriverActivePage })));
const DriverHistoryPage = lazy(() => import("@/features/driver-portal/DriverHistoryPage").then((m) => ({ default: m.DriverHistoryPage })));
const ExpensesPage = lazy(() => import("@/features/finance/ExpensesPage").then((m) => ({ default: m.ExpensesPage })));
const FinancialReportsPage = lazy(() => import("@/features/finance/FinancialReportsPage").then((m) => ({ default: m.FinancialReportsPage })));
const LoansPage = lazy(() => import("@/features/finance/LoansPage").then((m) => ({ default: m.LoansPage })));
const CustomerLoanDetailsPage = lazy(() => import("@/features/finance/CustomerLoanDetailsPage").then((m) => ({ default: m.CustomerLoanDetailsPage })));
const StaffSalariesPage = lazy(() => import("@/features/hr/StaffSalariesPage").then((m) => ({ default: m.StaffSalariesPage })));
const AttendancePage = lazy(() => import("@/features/hr/AttendancePage").then((m) => ({ default: m.AttendancePage })));
const MyAttendancePage = lazy(() => import("@/features/hr/MyAttendancePage").then((m) => ({ default: m.MyAttendancePage })));
const FaceEnrollmentPage = lazy(() => import("@/features/hr/FaceEnrollmentPage").then((m) => ({ default: m.FaceEnrollmentPage })));
const FaceCheckInPage = lazy(() => import("@/features/hr/FaceCheckInPage").then((m) => ({ default: m.FaceCheckInPage })));
const AuditLogsPage = lazy(() => import("@/features/security/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })));
const ActivityLogsPage = lazy(() => import("@/features/security/ActivityLogsPage").then((m) => ({ default: m.ActivityLogsPage })));
const SystemResetPage = lazy(() => import("@/features/security/SystemResetPage").then((m) => ({ default: m.SystemResetPage })));
const SalesReportPage = lazy(() => import("@/features/reports/SalesReportPage").then((m) => ({ default: m.SalesReportPage })));
const InventoryReportPage = lazy(() => import("@/features/reports/InventoryReportPage").then((m) => ({ default: m.InventoryReportPage })));
const AccountSettingsPage = lazy(() => import("@/features/account/AccountSettingsPage").then((m) => ({ default: m.AccountSettingsPage })));
const MobileScannerPage = lazy(() => import("@/features/sales/MobileScannerPage").then((m) => ({ default: m.MobileScannerPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PwaUpdater />
      <LanguageProvider>
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/mfa-challenge" element={<MfaChallengePage />} />
              <Route path="/register" element={<Navigate to="/login" replace />} />

              {/* No dedicated home page — "/" only ever exists to send a
                  visitor somewhere else. With no allowed roles, ProtectedRoute
                  always falls through to its role-home redirect for anyone
                  signed in, and to /login for anyone who isn't — the same
                  session check every other route already gets, so landing on
                  the bare domain no longer skips it and looks like a logout. */}
              <Route element={<ProtectedRoute allowedRoles={[]} />}>
                <Route path="/" element={<PageLoader />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["admin", "manager", "staff"]} />}>
                <Route path="/app" element={<DashboardLayout />}>
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="inventory/products" element={<ProductsPage />} />
                  <Route path="inventory/products/:id" element={<ProductDetailPage />} />
                  <Route path="inventory/categories" element={<CategoriesPage />} />
                  <Route path="inventory/stocktake" element={<StocktakePage />} />
                  <Route path="inventory/stocktake/:id" element={<StocktakeSessionPage />} />
                  <Route path="sales/pos" element={<POSPage />} />
                  <Route path="sales/orders" element={<SalesOrdersPage />} />
                  <Route path="sales/orders/:id" element={<SalesOrderDetailPage />} />
                  <Route path="sales/discounts" element={<DiscountsPage />} />
                  <Route path="sales/tax-rates" element={<TaxRatesPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="suppliers/stock" element={<SupplierStockPage />} />
                  <Route path="delivery" element={<DispatchBoardPage />} />
                  <Route path="delivery/:id" element={<DeliveryDetailPage />} />
                  <Route path="delivery-issues" element={<DeliveryIssuesPage />} />
                  <Route path="finance/expenses" element={<ExpensesPage />} />
                  <Route path="finance/reports" element={<FinancialReportsPage />} />
                  <Route path="finance/loans" element={<LoansPage />} />
                  <Route path="finance/loans/:customerId" element={<CustomerLoanDetailsPage />} />
                  <Route path="hr/salaries" element={<StaffSalariesPage />} />
                  <Route path="hr/attendance" element={<AttendancePage />} />
                  <Route path="hr/my-attendance" element={<MyAttendancePage />} />
                  <Route path="hr/face-enrollment" element={<FaceEnrollmentPage />} />
                  <Route path="hr/face-checkin" element={<FaceCheckInPage />} />
                  <Route path="reports/sales" element={<SalesReportPage />} />
                  <Route path="reports/inventory" element={<InventoryReportPage />} />
                  <Route path="settings/users" element={<UsersPage />} />
                  <Route path="settings/audit-logs" element={<AuditLogsPage />} />
                  <Route path="settings/activity-logs" element={<ActivityLogsPage />} />
                  <Route path="settings/danger-zone" element={<SystemResetPage />} />
                  <Route path="account/settings" element={<AccountSettingsPage />} />
                </Route>
              </Route>

              {/* Standalone mobile "Scanner Mode" — deliberately outside
                  DashboardLayout since it is not another POS, just a
                  full-screen camera scanner that reports scans to the
                  existing desktop POS (see POSPage.tsx's pending-scans poll). */}
              <Route element={<ProtectedRoute allowedRoles={["admin", "manager", "staff"]} />}>
                <Route path="/scan" element={<MobileScannerPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["customer"]} />}>
                <Route path="/portal" element={<PortalLayout />}>
                  <Route path="dashboard" element={<CustomerDashboardPage />} />
                  <Route path="shop" element={<Navigate to="/portal/dashboard" replace />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="wallet" element={<WalletPage />} />
                  <Route path="account/settings" element={<AccountSettingsPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["supplier"]} />}>
                <Route path="/supplier" element={<SupplierPortalLayout />}>
                  <Route path="dashboard" element={<SupplierDashboardPage />} />
                  <Route path="companies" element={<SupplierCompaniesPage />} />
                  <Route path="products" element={<SupplierProductsPage />} />
                  <Route path="categories" element={<SupplierCategoriesPage />} />
                  <Route path="stock-requests" element={<StockRequestsPage />} />
                  <Route path="account/settings" element={<AccountSettingsPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["driver"]} />}>
                <Route path="/driver" element={<DriverLayout />}>
                  <Route path="active" element={<DriverActivePage />} />
                  <Route path="history" element={<DriverHistoryPage />} />
                  <Route path="account/settings" element={<AccountSettingsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      <Toaster />
      </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
