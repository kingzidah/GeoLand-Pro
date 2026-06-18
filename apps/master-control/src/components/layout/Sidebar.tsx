import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, DollarSign, Activity,
  GitBranch, ShieldCheck, LifeBuoy, Settings, LogOut, MapPin, KeyRound,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/auth/AuthContext';
import { brand } from '@/config/brand.config';
import { canAnyPlatform, PlatformCapability } from '@geolandpro/rbac';
import type { PlatformRole } from '@/types';

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'http://localhost:5173';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  capabilities?: PlatformCapability[];
  external?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',         icon: <LayoutDashboard size={18} /> },
  { to: '/clients',    label: 'Client Management', icon: <Building2 size={18} />,  capabilities: [PlatformCapability.ORG_VIEW] },
  { to: `${WEB_APP_URL}/access-requests`, label: 'Access Requests', icon: <KeyRound size={18} />, capabilities: [PlatformCapability.ORG_IMPERSONATE], external: true },
  { to: '/revenue',    label: 'Revenue & Commission', icon: <DollarSign size={18} />, capabilities: [PlatformCapability.REVENUE_VIEW] },
  { to: '/health',     label: 'Platform Health',   icon: <Activity size={18} />,   capabilities: [PlatformCapability.HEALTH_VIEW_SUMMARY] },
  { to: '/onboarding', label: 'Onboarding Pipeline', icon: <GitBranch size={18} />, capabilities: [PlatformCapability.ONBOARDING_VIEW] },
  { to: '/audit',      label: 'Audit & Security',  icon: <ShieldCheck size={18} />, capabilities: [PlatformCapability.AUDIT_VIEW] },
  { to: '/support',    label: 'Support Centre',    icon: <LifeBuoy size={18} />,    capabilities: [PlatformCapability.SUPPORT_VIEW] },
  { to: '/settings',   label: 'Platform Settings', icon: <Settings size={18} />,    capabilities: [PlatformCapability.SETTINGS_VIEW] },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  const visibleItems = NAV.filter((item) => {
    if (!item.capabilities) return true;
    return canAnyPlatform(user?.platformRole as PlatformRole | null | undefined, item.capabilities);
  });

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-2.5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <MapPin size={16} className="text-white" />
        </div>
        <div className="leading-tight">
          <span className="text-white font-bold text-lg tracking-tight block">{brand.name}</span>
          <span className="text-slate-400 text-[11px] uppercase tracking-wider">Master Control</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) =>
          item.external ? (
            <a
              key={item.to}
              href={item.to}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-white/10"
            >
              {item.icon}
              {item.label}
            </a>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* User + logout */}
      {user && (
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-sm font-medium truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-slate-400 text-xs truncate">{user.email}</p>
            {user.platformRole && (
              <p className="text-slate-500 text-[11px] mt-0.5 truncate">{user.platformRole.replace(/_/g, ' ')}</p>
            )}
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
