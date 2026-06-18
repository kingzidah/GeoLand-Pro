import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Server, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { platformApi } from '@/api/platform';
import { formatDateTime } from '@/utils/format';

function statusBadge(status: string) {
  const ok = status === 'connected' || status === 'ok' || status === 'ready';
  return <Badge variant={ok ? 'green' : 'red'}>{status}</Badge>;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function HealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-health'],
    queryFn: () => platformApi.getHealth(),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <Header title="Platform Health" subtitle="Infrastructure monitoring — configuring" />

      <div className="p-6 space-y-4">
        {isLoading || !data ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="API" value={data.api.status} icon={<Activity size={20} />} />
              <StatCard label="Database" value={data.database.status} icon={<Database size={20} />} />
              <StatCard label="Redis" value={data.redis.status} icon={<Server size={20} />} />
              <StatCard label="API Uptime" value={formatUptime(data.api.uptimeSeconds)} icon={<Clock size={20} />} />
            </div>

            <Card>
              <CardHeader title="Background Jobs" subtitle="Scheduled jobs and their Redis queue connection status" />
              <CardBody className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Job</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Schedule</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Queue</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.jobs.map((job) => (
                      <tr key={job.queueName} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{job.name}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{job.schedule}</td>
                        <td className="px-4 py-3 text-slate-500">{job.description}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{job.queueName}</td>
                        <td className="px-4 py-3">{statusBadge(job.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <p className="text-xs text-slate-400">As of {formatDateTime(data.api.timestamp)} — refreshes every 30s</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader title="Error Tracking" subtitle="Sentry" />
                <CardBody>
                  <p className="text-sm text-slate-500">Sentry integration is configuring — error tracking will appear here.</p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Database Console" subtitle="Query & schema tools" />
                <CardBody>
                  <p className="text-sm text-slate-500">Database console access is configuring for platform staff.</p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Deploys" subtitle="Release pipeline" />
                <CardBody>
                  <p className="text-sm text-slate-500">Deploy triggers and release history are configuring.</p>
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// TODO(Sentry): wire up Sentry project API to surface recent error rates here.
// TODO(DB console): expose a read-only query console for platform staff (HEALTH_VIEW_DETAIL).
// TODO(Deploys): integrate with the hosting platform's deploy API for release history and triggers.
