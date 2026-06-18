import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { tenantsApi } from '@/api/tenants';
import { formatDate, formatCurrency } from '@/utils/format';

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantsApi.getById(tenantId!),
    enabled: !!tenantId,
  });

  const { data: leases } = useQuery({
    queryKey: ['tenant-leases', tenantId],
    queryFn: () => tenantsApi.getLeases(tenantId!),
    enabled: !!tenantId,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!tenant) return <div className="p-6 text-slate-500">Tenant not found.</div>;

  const ec = tenant.emergencyContact as { name?: string; phone?: string; relationship?: string } | null;

  return (
    <div>
      <Header
        title={`${tenant.user.firstName} ${tenant.user.lastName}`}
        subtitle="Tenant profile"
        actions={
          <Link to="/tenants" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back
          </Link>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile */}
        <Card>
          <CardHeader title="Personal Details" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              {[
                ['Full Name', `${tenant.user.firstName} ${tenant.user.lastName}`],
                ['Email', tenant.user.email],
                ['Phone', tenant.user.phone ?? '—'],
                ['ID Type', tenant.nationalIdType],
                ['ID Number', tenant.nationalIdNumber],
                ['Date of Birth', formatDate(tenant.dateOfBirth)],
                ['Occupation', tenant.occupation ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader title="Emergency Contact" />
          <CardBody>
            {ec ? (
              <dl className="space-y-3 text-sm">
                {[
                  ['Name', ec.name ?? '—'],
                  ['Phone', ec.phone ?? '—'],
                  ['Relationship', ec.relationship ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No emergency contact on file</p>
            )}
          </CardBody>
        </Card>

        {/* Lease history */}
        {leases && leases.length > 0 && (
          <div className="lg:col-span-2">
            <Card>
              <CardHeader title="Lease History" subtitle={`${leases.length} lease(s)`} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Lease #</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Property / Plot</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Monthly Rent</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Period</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {leases.map((lease) => (
                      <tr key={lease.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-mono text-xs text-slate-700">{lease.leaseNumber}</td>
                        <td className="px-6 py-3 text-slate-600">
                          {lease.plot ? `${lease.plot.property.name} / ${lease.plot.plotNumber}` : '—'}
                        </td>
                        <td className="px-6 py-3"><LeaseStatusBadge status={lease.status} /></td>
                        <td className="px-6 py-3">{formatCurrency(lease.monthlyRentGHS)}</td>
                        <td className="px-6 py-3 text-slate-500 text-xs">
                          {formatDate(lease.startDate)} → {formatDate(lease.endDate)}
                        </td>
                        <td className="px-6 py-3">
                          <Link to={`/leases/${lease.id}`} className="text-brand-600 hover:underline text-xs font-medium">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
