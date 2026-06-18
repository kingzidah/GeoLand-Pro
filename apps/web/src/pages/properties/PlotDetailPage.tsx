import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { PlotStatusBadge, LeaseStatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { CapabilityGate } from '@/auth/CapabilityGate';
import { Capability } from '@geolandpro/rbac';
import { plotsApi } from '@/api/plots';
import { documentsApi } from '@/api/documents';
import { formatArea, formatCurrency, formatDate } from '@/utils/format';

export function PlotDetailPage() {
  const { plotId } = useParams<{ plotId: string }>();

  const { data: plot, isLoading } = useQuery({
    queryKey: ['plot', plotId],
    queryFn: () => plotsApi.getById(plotId!),
    enabled: !!plotId,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!plot) return <div className="p-6 text-slate-500">Plot not found.</div>;

  return (
    <div>
      <Header
        title={`Plot ${plot.plotNumber}`}
        subtitle={plot.property.name}
        actions={
          <Link to="/estate-simulator" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back to Map
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <PlotStatusBadge status={plot.status} />
          <CapabilityGate capabilities={[Capability.DOCUMENT_GENERATE_ALL]}>
            <GenerateDocumentButton
              label="Boundary Certificate"
              generate={() => documentsApi.generateBoundaryCertificate(plot.id)}
            />
            <GenerateDocumentButton
              label="Plot Certificate"
              generate={() => documentsApi.generatePlotCertificate(plot.id)}
            />
          </CapabilityGate>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Plot Details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ['Plot ID', plot.plotNumber],
                  ['Property', plot.property.name],
                  ['Address', plot.property.address],
                  ['Region', plot.property.region],
                  ['Area', formatArea(plot.areaSqm)],
                  ['Status', undefined],
                  ['Description', plot.description ?? '—'],
                  ['Created', formatDate(plot.createdAt)],
                  ['Created By', `${plot.createdBy.firstName} ${plot.createdBy.lastName}`],
                  ['Geotagged Photos', plot._count.geotaggedPhotos.toLocaleString()],
                ].map(([label, value]) =>
                  label === 'Status' ? (
                    <div key={label} className="flex justify-between items-center">
                      <dt className="text-slate-500">{label}</dt>
                      <dd><PlotStatusBadge status={plot.status} /></dd>
                    </div>
                  ) : (
                    <div key={label} className="flex justify-between">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-medium text-slate-900 text-right">{value}</dd>
                    </div>
                  )
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Location" />
            <CardBody>
              {plot.centroidLat != null && plot.centroidLng != null ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Latitude</dt>
                    <dd className="font-medium text-slate-900">{plot.centroidLat.toFixed(6)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Longitude</dt>
                    <dd className="font-medium text-slate-900">{plot.centroidLng.toFixed(6)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">No centroid recorded for this plot.</p>
              )}
              <Link
                to={`/estate-simulator?plot=${plot.id}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View on 3D Map →
              </Link>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Lease History"
            subtitle={`${plot._count.leaseAgreements} lease${plot._count.leaseAgreements === 1 ? '' : 's'}`}
          />
          {plot.leaseAgreements.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">No leases recorded for this plot.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Lease</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tenant</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Start</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">End</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Monthly Rent</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Arrears</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {plot.leaseAgreements.map((lease) => (
                    <tr key={lease.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <Link to={`/leases/${lease.id}`} className="font-medium text-brand-600 hover:text-brand-700">
                          {lease.leaseNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {lease.tenant.user.firstName} {lease.tenant.user.lastName}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(lease.startDate)}</td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(lease.endDate)}</td>
                      <td className="px-6 py-3 text-slate-700">{formatCurrency(lease.monthlyRentGHS)}</td>
                      <td className="px-6 py-3">
                        {lease.arrearsGHS > 0 ? (
                          <span className="text-red-600 font-medium">{formatCurrency(lease.arrearsGHS)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3"><LeaseStatusBadge status={lease.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {plot._count.geotaggedPhotos > 0 && (
          <Card>
            <CardBody className="flex items-center gap-3 text-sm text-slate-500">
              <Camera size={16} className="text-slate-400" />
              {plot._count.geotaggedPhotos} geotagged photo{plot._count.geotaggedPhotos === 1 ? '' : 's'} on file for this plot.
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
