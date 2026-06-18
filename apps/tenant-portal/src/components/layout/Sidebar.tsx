import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, UserCircle, FolderOpen, Bell, LogOut, MapPin, Map, Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/auth/AuthContext';
import { brand } from '@/config/brand.config';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { to: '/dashboard',     label: 'Dashboard',     icon: <LayoutDashboard size={18} /> },
  { to: '/lease',         label: 'My Lease',      icon: <FileText size={18} /> },
  { to: '/me/plot',       label: 'My Plot',       icon: <Map size={18} /> },
  { to: '/me/payments',   label: 'My Payments',   icon: <Wallet size={18} /> },
  { to: '/profile',       label: 'My Profile',    icon: <UserCircle size={18} /> },
  { to: '/documents',     label: 'Documents',     icon: <FolderOpen size={18} /> },
  { to: '/notifications', label: 'Notifications', icon: <Bell size={18} /> },
];

export function Sidebar() {
  const { user, logout } = useAuth();

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
        {NAV.map((item) => (
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
