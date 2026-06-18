import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ClientsPage } from '@/pages/clients/ClientsPage';
import { OrganisationDetailPage } from '@/pages/clients/OrganisationDetailPage';
import { CreateOrganisationPage } from '@/pages/clients/CreateOrganisationPage';
import { RevenuePage } from '@/pages/revenue/RevenuePage';
import { HealthPage } from '@/pages/health/HealthPage';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { AuditPage } from '@/pages/audit/AuditPage';
import { SupportPage } from '@/pages/support/SupportPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — platform staff only */}
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
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/new" element={<CreateOrganisationPage />} />
        <Route path="clients/:id" element={<OrganisationDetailPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
