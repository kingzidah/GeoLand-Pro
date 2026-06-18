import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, FileText, DollarSign,
  FolderOpen, Bell, ShieldCheck, LogOut, MapPin, Map, Lock, Upload, KeyRound,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/auth/AuthContext';
import { brand } from '@/config/brand.config';
import { isRouteInScope } from '@/utils/impersonation';
import { canAny, Capability, type Role as RbacRole } from '@geolandpro/rbac';
import type { Role } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  capabilities?: Capability[];
}

const NAV: NavItem[] = [
  { to: '/dashboard',   label: 'Dashboard',   icon: <LayoutDashboard size={18} /> },
  { to: '/properties',  label: 'Properties',  icon: <Building2 size={18} />,    capabilities: [Capability.PLOT_VIEW] },
  { to: '/map',         label: 'Property Map', icon: <Map size={18} />,         capabilities: [Capability.MAP_VIEW_FULL] },
  { to: '/survey',      label: 'Survey Import', icon: <Upload size={18} />,     capabilities: [Capability.SURVEY_IMPORT] },
  { to: '/vault',       label: 'Vault',       icon: <Lock size={18} />,          capabilities: [Capability.VAULT_MANAGE] },
  { to: '/tenants',     label: 'Tenants',     icon: <Users size={18} />,         capabilities: [Capability.TENANT_MANAGE] },
  { to: '/leases',      label: 'Leases',      icon: <FileText size={18} />,      capabilities: [Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN] },
  { to: '/finance',     label: 'Finance',     icon: <DollarSign size={18} />,    capabilities: [Capability.FINANCE_DASHBOARD_FULL, Capability.FINANCE_DASHBOARD_VIEW] },
  { to: '/documents',   label: 'Documents',   icon: <FolderOpen size={18} />,    capabilities: [Capability.DOCUMENT_GENERATE_ALL, Capability.DOCUMENT_GENERATE_RECEIPTS, Capability.DOCUMENT_VIEW_OWN] },
  { to: '/admin',       label: 'Admin',       icon: <ShieldCheck size={18} />,   capabilities: [Capability.ADMIN_PANEL_VIEW] },
  { to: '/access-requests', label: 'Access Requests', icon: <KeyRound size={18} />, capabilities: [Capability.ORG_SETTINGS] },
];

export function Sidebar() {
  const { user, impersonation, logout } = useAuth();

  const visibleItems = NAV.filter((item) => {
    if (!user) return false;
    if (item.capabilities && !canAny(user.role as unknown as RbacRole, item.capabilities)) return false;
    // During a read-only impersonation session, only show routes covered by
    // the granted scopes (plus the always-safe Access Requests route).
    if (impersonation && !isRouteInScope(item.to, impersonation.grantedScopes)) return false;
    return true;
  });

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-2.5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <MapPin size={16} className="text-white" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">{brand.name}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
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
        ))}
      </nav>

      {/* User + logout */}
      {user && (
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-sm font-medium truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-slate-400 text-xs truncate">{user.email}</p>
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
