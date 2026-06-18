import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LeasePage } from '@/pages/LeasePage';
import { MyPlotPage } from '@/pages/MyPlotPage';
import { MyPaymentsPage } from '@/pages/MyPaymentsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — tenants only */}
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
        <Route path="lease" element={<LeasePage />} />
        <Route path="me/plot" element={<MyPlotPage />} />
        <Route path="me/payments" element={<MyPaymentsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
