import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PropertiesPage } from '@/pages/properties/PropertiesPage';
import { PropertyDetailPage } from '@/pages/properties/PropertyDetailPage';
import { PlotDetailPage } from '@/pages/properties/PlotDetailPage';
import { SurveyPage } from '@/pages/survey/SurveyPage';
import { PropertyMapPage } from '@/pages/map/PropertyMapPage';
import { VaultPage } from '@/pages/vault/VaultPage';
import { TenantsPage } from '@/pages/tenants/TenantsPage';
import { TenantDetailPage } from '@/pages/tenants/TenantDetailPage';
import { LeasesPage } from '@/pages/leases/LeasesPage';
import { LeaseDetailPage } from '@/pages/leases/LeaseDetailPage';
import { FinancePage } from '@/pages/finance/FinancePage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { AccessRequestsPage } from '@/pages/access/AccessRequestsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — all authenticated users */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="properties/:propertyId" element={<PropertyDetailPage />} />
        <Route path="plots/:plotId" element={<PlotDetailPage />} />
        <Route
          path="survey"
          element={
            <ProtectedRoute minRole="FIELD_SURVEYOR">
              <SurveyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="map"
          element={
            <ProtectedRoute minRole="FIELD_SURVEYOR">
              <PropertyMapPage />
            </ProtectedRoute>
          }
        />
        <Route path="estate-simulator" element={<Navigate to="/map" replace />} />
        <Route path="satellite" element={<Navigate to="/map" replace />} />
        <Route
          path="vault"
          element={
            <ProtectedRoute minRole="ADMIN">
              <VaultPage />
            </ProtectedRoute>
          }
        />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
        <Route path="leases" element={<LeasesPage />} />
        <Route path="leases/:leaseId" element={<LeaseDetailPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="documents" element={<DocumentsPage />} />

        {/* SUPER_ADMIN only */}
        <Route
          path="admin"
          element={
            <ProtectedRoute minRole="SUPER_ADMIN">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-requests"
          element={
            <ProtectedRoute minRole="SUPER_ADMIN">
              <AccessRequestsPage />
            </ProtectedRoute>
          }
        />

      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
