import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Mail, MessageSquare, MessageCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { NotificationStatusBadge } from '@/components/ui/Badge';
import { notificationsApi } from '@/api/notifications';
import { formatDateTime } from '@/utils/format';
import type { NotificationChannel } from '@/types';

const CHANNEL_ICONS: Record<NotificationChannel, React.ReactNode> = {
  EMAIL: <Mail size={15} />,
  SMS: <MessageSquare size={15} />,
  WHATSAPP: <MessageCircle size={15} />,
};

export function NotificationsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-notifications', page],
    queryFn: () => notificationsApi.list({ page, limit: 15 }),
  });

  return (
    <div>
      <Header title="Notifications" subtitle={`${data?.meta.total ?? 0} messages`} />

      <div className="p-6">
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <Bell size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No notifications yet</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-50">
                {data.data.map((n) => (
                  <li key={n.id} className="flex items-start gap-4 px-6 py-4">
                    <div className="mt-0.5 p-2 rounded-lg bg-brand-50 text-brand-600">
                      {CHANNEL_ICONS[n.channel]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900 truncate">{n.subject ?? n.channel}</p>
                        <NotificationStatusBadge status={n.status} />
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDateTime(n.sentAt ?? n.createdAt)} · {n.recipient}
                      </p>
                      {n.failureReason && (
                        <p className="text-xs text-red-500 mt-1">Failed: {n.failureReason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-center p-4">
                <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
