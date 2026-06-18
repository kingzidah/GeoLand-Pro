import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ImpersonationBanner } from './ImpersonationBanner';
import { AIAssistantWidget } from '@/components/ai/AIAssistantWidget';
import { useAuth } from '@/auth/AuthContext';
import { firstGrantedRoute, isRouteInScope } from '@/utils/impersonation';

export function AppShell() {
  const { impersonation } = useAuth();
  const location = useLocation();

  // Defense-in-depth UX: the API already 403s routes outside the granted
  // scopes during impersonation — redirect before the user even gets there.
  if (impersonation && !isRouteInScope(location.pathname, impersonation.grantedScopes)) {
    return <Navigate to={firstGrantedRoute(impersonation.grantedScopes)} replace />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        {!impersonation && <AIAssistantWidget />}
      </div>
    </div>
  );
}
