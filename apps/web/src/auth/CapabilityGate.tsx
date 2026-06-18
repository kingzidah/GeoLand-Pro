import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { canAny, isPlatformAdmin, type Capability, type Role as RbacRole } from '@geolandpro/rbac';

interface Props {
  /** Renders children if the user holds ANY of these capabilities (or is a platform admin). */
  capabilities: Capability[];
  children: ReactNode;
  /** Optional fallback rendered when the user lacks access (defaults to nothing). */
  fallback?: ReactNode;
}

/**
 * Conditionally renders UI based on the current user's capabilities.
 * Use to hide/show buttons, panels, and sections within a page that the
 * route itself already allows access to (e.g. an Admin can see the
 * Properties page but not the delete button).
 */
export function CapabilityGate({ capabilities, children, fallback = null }: Props) {
  const { user } = useAuth();

  if (!user) return <>{fallback}</>;
  if (isPlatformAdmin(user)) return <>{children}</>;
  if (!canAny(user.role as unknown as RbacRole, capabilities)) return <>{fallback}</>;

  return <>{children}</>;
}
