import { Bell } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { RoleBadge } from '@/components/ui/Badge';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: Props) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <Bell size={18} />
        </button>
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <RoleBadge role={user.role} />
          </div>
        )}
      </div>
    </header>
  );
}
