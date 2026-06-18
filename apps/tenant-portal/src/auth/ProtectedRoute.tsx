import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || user.role !== 'TENANT') return <Navigate to="/login" replace />;

  return <>{children}</>;
}
