import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, DollarSign, AlertTriangle, Bell, ArrowRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCard, Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { leasesApi } from '@/api/leases';
import { notificationsApi } from '@/api/notifications';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { useAuth } from '@/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['my-leases'],
    queryFn: () => leasesApi.list({ limit: 5 }),
  });

  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ['my-notifications-preview'],
    queryFn: () => notificationsApi.list({ limit: 5 }),
  });

  const isLoading = leasesLoading || notificationsLoading;
  const activeLease = leases?.data.find((l) => l.status === 'ACTIVE') ?? leases?.data[0];

  return (
    <div>
      <Header
        title={`Welcome back, ${user?.firstName}`}
        subtitle="Here's an overview of your tenancy"
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Lease Status"
                value={activeLease ? activeLease.status.replace('_', ' ') : '—'}
                icon={<FileText size={20} />}
              />
              <StatCard
                label="Monthly Rent"
                value={activeLease ? formatCurrency(activeLease.monthlyRentGHS) : '—'}
                icon={<DollarSign size={20} />}
              />
              <StatCard
                label="Total Paid"
                value={activeLease ? formatCurrency(activeLease.totalPaidGHS) : '—'}
                icon={<DollarSign size={20} />}
              />
              <StatCard
                label="Arrears"
                value={activeLease ? formatCurrency(activeLease.arrearsGHS) : '—'}
                icon={<AlertTriangle size={20} />}
                trend={
                  activeLease && activeLease.arrearsGHS > 0
                    ? { value: 'Payment due', positive: false }
                    : { value: 'All clear', positive: true }
                }
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Lease summary */}
              <Card>
                <CardHeader
                  title="My Lease"
                  subtitle={activeLease?.leaseNumber}
                  action={
                    activeLease && (
                      <Link to="/lease" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
                        View details <ArrowRight size={14} />
                      </Link>
                    )
                  }
                />
                <CardBody>
                  {activeLease ? (
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Status</dt>
                        <dd><LeaseStatusBadge status={activeLease.status} /></dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Property</dt>
                        <dd className="font-medium text-slate-900 text-right">
                          {activeLease.plot ? `${activeLease.plot.property.name} / ${activeLease.plot.plotNumber}` : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Period</dt>
                        <dd className="font-medium text-slate-900">
                          {formatDate(activeLease.startDate)} → {formatDate(activeLease.endDate)}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-slate-400">No lease on file yet.</p>
                  )}
                </CardBody>
              </Card>

              {/* Recent notifications */}
              <Card>
                <CardHeader
                  title="Recent Notifications"
                  action={
                    <Link to="/notifications" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
                      View all <ArrowRight size={14} />
                    </Link>
                  }
                />
                <CardBody>
                  {notifications && notifications.data.length > 0 ? (
                    <ul className="space-y-3">
                      {notifications.data.map((n) => (
                        <li key={n.id} className="flex items-start gap-3 text-sm">
                          <div className="mt-0.5 p-1.5 rounded-lg bg-brand-50 text-brand-600">
                            <Bell size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-900 truncate">{n.subject ?? n.body}</p>
                            <p className="text-xs text-slate-400">{formatDateTime(n.sentAt ?? n.createdAt)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">No notifications yet.</p>
                  )}
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
