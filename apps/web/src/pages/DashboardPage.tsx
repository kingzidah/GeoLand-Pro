import { useQuery } from '@tanstack/react-query';
import {
  Building2, Users, FileText, DollarSign,
  AlertTriangle, TrendingUp, Clock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { adminApi } from '@/api/admin';
import { financeApi } from '@/api/finance';
import { formatCurrency } from '@/utils/format';
import { useAuth } from '@/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => financeApi.getSummary(),
  });

  const isLoading = statsLoading || summaryLoading;

  return (
    <div>
      <Header
        title={`Welcome back, ${user?.firstName}`}
        subtitle="Here's an overview of your platform activity"
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Active Properties"
                value={stats?.properties.active ?? 0}
                icon={<Building2 size={20} />}
              />
              <StatCard
                label="Active Leases"
                value={stats?.leases?.ACTIVE ?? 0}
                icon={<FileText size={20} />}
              />
              <StatCard
                label="Revenue This Month"
                value={formatCurrency(stats?.revenue.thisMonthGHS ?? 0)}
                icon={<TrendingUp size={20} />}
              />
              <StatCard
                label="Total Arrears"
                value={formatCurrency(stats?.arrears.totalGHS ?? 0)}
                icon={<AlertTriangle size={20} />}
                trend={
                  (stats?.arrears.totalGHS ?? 0) > 0
                    ? { value: 'Requires attention', positive: false }
                    : { value: 'All clear', positive: true }
                }
              />
            </div>

            {/* Finance Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Total Collected"
                value={formatCurrency(summary?.totalCollectedGHS ?? 0)}
                icon={<DollarSign size={20} />}
              />
              <StatCard
                label="Total Deposits"
                value={formatCurrency(summary?.totalDepositsGHS ?? 0)}
                icon={<DollarSign size={20} />}
              />
              <StatCard
                label="Paid This Month"
                value={summary?.paidThisMonth ?? 0}
                icon={<Users size={20} />}
              />
              <StatCard
                label="Pending Transactions"
                value={stats?.pendingTransactions ?? 0}
                icon={<Clock size={20} />}
              />
            </div>

            {/* Plot Status Breakdown */}
            {stats?.plots && Object.keys(stats.plots).length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Plot Status Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {(Object.entries(stats.plots) as [string, number][]).map(([status, count]) => (
                    <div key={status} className="text-center p-3 bg-slate-50 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900">{count}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {status.replace('_', ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User breakdown — SUPER_ADMIN only */}
            {stats?.users && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Platform Users</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {(Object.entries(stats.users) as [string, number][]).map(([role, count]) => (
                    <div key={role} className="text-center p-3 bg-slate-50 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900">{count}</p>
                      <p className="text-xs text-slate-500 mt-1">{role.replace('_', ' ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
