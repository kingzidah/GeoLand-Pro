import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { canAnyPlatform, type PlatformCapability } from '@geolandpro/rbac';

interface Props {
  /** Renders children if the user's platform role holds ANY of these capabilities. */
  capabilities: PlatformCapability[];
  children: ReactNode;
  /** Optional fallback rendered when the user lacks access (defaults to nothing). */
  fallback?: ReactNode;
}

/**
 * Conditionally renders UI based on the current user's Master Control
 * (Layer 1) platform capabilities. Use to hide/show buttons, panels, and
 * sections within a module page that the route itself already allows
 * access to (e.g. a Board Observer can see the Revenue module but not the
 * "edit commission rate" action).
 */
export function PlatformCapabilityGate({ capabilities, children, fallback = null }: Props) {
  const { user } = useAuth();

  if (!user || !canAnyPlatform(user.platformRole, capabilities)) return <>{fallback}</>;

  return <>{children}</>;
}
