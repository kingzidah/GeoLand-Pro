import { useAuth } from '@/auth/AuthContext';
import { ApproverAccessRequestsPage } from './ApproverAccessRequestsPage';
import { StaffAccessRequestsPage } from './StaffAccessRequestsPage';

/**
 * Single route serving two audiences: platform-admin staff requesting access
 * to client organisations, and org admins approving/managing those requests.
 */
export function AccessRequestsPage() {
  const { user } = useAuth();
  return user?.isPlatformAdmin ? <StaffAccessRequestsPage /> : <ApproverAccessRequestsPage />;
}
