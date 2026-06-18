import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { accessScopeLabel } from '@/utils/format';
import { IMPERSONATION_SAFE_ROUTE } from '@/utils/impersonation';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Persistent, unmissable banner shown for the duration of a scoped access-request impersonation session. */
export function ImpersonationBanner() {
  const { impersonation, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!impersonation) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [impersonation]);

  if (!impersonation) return null;

  const remainingMs = new Date(impersonation.expiresAt).getTime() - now;
  const isExpired = remainingMs <= 0;
  const orgName = impersonation.organisation?.name ?? 'Unknown organisation';

  async function handleExit() {
    setExiting(true);
    try {
      await exitImpersonation();
    } catch {
      // Local session state is cleared regardless — see AuthContext.exitImpersonation
    } finally {
      setExiting(false);
      navigate(IMPERSONATION_SAFE_ROUTE);
    }
  }

  return (
    <div
      data-testid="impersonation-banner"
      className={cn(
        'flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm',
        isExpired ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      )}
    >
      <ShieldAlert size={18} className="shrink-0" />
      <span className="font-semibold">Viewing {orgName} — Read-only session</span>

      <div className="flex flex-wrap items-center gap-1.5">
        {impersonation.grantedScopes.map((scope) => (
          <span key={scope} className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">
            {accessScopeLabel(scope)}
          </span>
        ))}
      </div>

      <span className="ml-auto flex items-center gap-1 whitespace-nowrap">
        <Clock size={14} />
        {isExpired ? 'Session expired' : `Expires in ${formatRemaining(remainingMs)}`}
      </span>

      <Button variant="secondary" size="sm" loading={exiting} onClick={handleExit}>
        <LogOut size={14} /> Exit session
      </Button>
    </div>
  );
}
