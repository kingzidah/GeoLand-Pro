import { Link } from 'react-router-dom';
import {
  Building2, DollarSign, Activity, GitBranch, ShieldCheck, LifeBuoy, Settings,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/auth/AuthContext';
import { brand } from '@/config/brand.config';
import { canAnyPlatform, PlatformCapability } from '@geolandpro/rbac';
import type { PlatformRole } from '@/types';

interface ModuleLink {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  capabilities: PlatformCapability[];
}

const MODULES: ModuleLink[] = [
  {
    to: '/clients',
    label: 'Client Management',
    description: 'Organisations, accounts, and onboarding status',
    icon: <Building2 size={20} />,
    capabilities: [PlatformCapability.ORG_VIEW],
  },
  {
    to: '/revenue',
    label: 'Revenue & Commission',
    description: 'Platform-wide commission performance',
    icon: <DollarSign size={20} />,
    capabilities: [PlatformCapability.REVENUE_VIEW],
  },
  {
    to: '/health',
    label: 'Platform Health',
    description: 'Background jobs and API status',
    icon: <Activity size={20} />,
    capabilities: [PlatformCapability.HEALTH_VIEW_SUMMARY],
  },
  {
    to: '/onboarding',
    label: 'Onboarding Pipeline',
    description: 'New organisation rollout progress',
    icon: <GitBranch size={20} />,
    capabilities: [PlatformCapability.ONBOARDING_VIEW],
  },
  {
    to: '/audit',
    label: 'Audit & Security',
    description: 'Platform activity log and exports',
    icon: <ShieldCheck size={20} />,
    capabilities: [PlatformCapability.AUDIT_VIEW],
  },
  {
    to: '/support',
    label: 'Support Centre',
    description: 'Organisation support tickets',
    icon: <LifeBuoy size={20} />,
    capabilities: [PlatformCapability.SUPPORT_VIEW],
  },
  {
    to: '/settings',
    label: 'Platform Settings',
    description: 'Defaults and maintenance mode',
    icon: <Settings size={20} />,
    capabilities: [PlatformCapability.SETTINGS_VIEW],
  },
];

export function DashboardPage() {
  const { user } = useAuth();

  const visibleModules = MODULES.filter((m) =>
    canAnyPlatform(user?.platformRole as PlatformRole | null | undefined, m.capabilities)
  );

  return (
    <div>
      <Header
        title="Master Control"
        subtitle={`${brand.name} — platform administration`}
      />

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Welcome{user ? `, ${user.firstName}` : ''}
          </h2>
          {user?.platformRole && (
            <p className="text-sm text-slate-500 mt-1">
              Signed in as {user.platformRole.replace(/_/g, ' ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((m) => (
            <Link key={m.to} to={m.to}>
              <Card className="p-5 h-full hover:border-brand-300 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-brand-50 rounded-lg text-brand-600">{m.icon}</div>
                  <div>
                    <p className="font-semibold text-slate-900">{m.label}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{m.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
