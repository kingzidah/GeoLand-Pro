import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MapPin, LayoutGrid } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { leasesApi } from '@/api/leases';
import { formatArea } from '@/utils/format';

export function MyPlotPage() {
  const { data: leases, isLoading } = useQuery({
    queryKey: ['my-leases-plot'],
    queryFn: () => leasesApi.list({ limit: 1 }),
  });

  const lease = leases?.data[0];

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  if (!lease || !lease.plot) {
    return (
      <div>
        <Header title="My Plot" subtitle="Your plot details" />
        <div className="p-6 text-slate-500">You don't have a plot on file yet.</div>
      </div>
    );
  }

  const { plot } = lease;
  const hasCoordinates = lease.plotCentroidLat != null && lease.plotCentroidLng != null;
  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${lease.plotCentroidLat},${lease.plotCentroidLng}`
    : null;

  return (
    <div>
      <Header title={`Plot ${plot.plotNumber}`} subtitle={plot.property.name} />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Plot Details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ['Plot Number', plot.plotNumber],
                  ['Property', plot.property.name],
                  ['Address', plot.property.address],
                  ['Region', plot.property.region],
                  ['Area', formatArea(plot.areaSqm)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium text-slate-900 text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tenancy" />
            <CardBody>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <LayoutGrid size={15} className="text-slate-400" />
                    Lease status
                  </span>
                  <LeaseStatusBadge status={lease.status} />
                </div>
                {hasCoordinates && mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <MapPin size={15} className="text-slate-400" />
                      View location on map
                    </span>
                    <ExternalLink size={15} className="text-brand-600" />
                  </a>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
