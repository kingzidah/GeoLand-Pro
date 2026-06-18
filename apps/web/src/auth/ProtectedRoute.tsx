import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { ROLE_RANK } from '@geolandpro/rbac';
import type { Role } from '@/types';

interface Props {
  children: React.ReactNode;
  minRole?: Role;
}

export function ProtectedRoute({ children, minRole }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (minRole && ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
