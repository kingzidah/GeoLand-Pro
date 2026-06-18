import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageSquareText } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { platformApi } from '@/api/platform';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { PlatformCapability } from '@geolandpro/rbac';
import { formatDateTime } from '@/utils/format';
import { getApiError } from '@/api/client';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [commissionRateInput, setCommissionRateInput] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformApi.getSettings(),
  });

  useEffect(() => {
    if (settings) setCommissionRateInput(String(settings.defaultCommissionRate));
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: platformApi.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['platform-settings'], data);
      setError('');
      setSuccess('Settings updated');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => setError(getApiError(err)),
  });

  const handleSaveCommissionRate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const rate = Number(commissionRateInput);
    if (Number.isNaN(rate) || rate < 0 || rate > 1) {
      setError('Default commission rate must be a number between 0 and 1 (e.g. 0.10 for 10%)');
      return;
    }
    updateMutation.mutate({ defaultCommissionRate: rate });
  };

  const handleToggleMaintenanceMode = () => {
    if (!settings) return;
    setError('');
    updateMutation.mutate({ maintenanceMode: !settings.maintenanceMode });
  };

  if (isLoading || !settings) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <Header title="Platform Settings" subtitle="Defaults and maintenance" />

      <div className="p-6 space-y-4 max-w-3xl">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            {success}
          </div>
        )}

        <form onSubmit={handleSaveCommissionRate}>
          <Card>
            <CardHeader
              title="Default Commission Rate"
              subtitle="Applied to new organisations that don't specify their own rate"
            />
            <CardBody className="space-y-4">
              <fieldset disabled={updateMutation.isPending} className="flex items-end gap-3">
                <Input
                  label="Default Commission Rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={commissionRateInput}
                  onChange={(e) => setCommissionRateInput(e.target.value)}
                  hint="0.10 = 10%"
                  className="max-w-[12rem]"
                />
              </fieldset>
              {settings.updatedAt && (
                <p className="text-xs text-slate-400">Last updated {formatDateTime(settings.updatedAt)}</p>
              )}
              <PlatformCapabilityGate capabilities={[PlatformCapability.SETTINGS_MANAGE]}>
                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={updateMutation.isPending}>Save</Button>
                </div>
              </PlatformCapabilityGate>
            </CardBody>
          </Card>
        </form>

        <Card>
          <CardHeader title="Maintenance Mode" subtitle="Block sign-ins for non-platform-admin users" />
          <CardBody className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  className={settings.maintenanceMode ? 'text-amber-500 mt-0.5' : 'text-slate-300 mt-0.5'}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {settings.maintenanceMode ? 'Maintenance mode is ON' : 'Maintenance mode is OFF'}
                  </p>
                  <p className="text-sm text-slate-500">
                    When enabled, only platform admins can sign in. All organisation users will see a maintenance
                    message until this is turned off.
                  </p>
                </div>
              </div>
              <PlatformCapabilityGate capabilities={[PlatformCapability.SETTINGS_MANAGE]}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.maintenanceMode ? 'true' : 'false'}
                  aria-label="Toggle maintenance mode"
                  disabled={updateMutation.isPending}
                  onClick={handleToggleMaintenanceMode}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    settings.maintenanceMode ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </PlatformCapabilityGate>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Communication Templates" subtitle="Email, WhatsApp and PDF document templates" />
          <CardBody>
            <div className="flex items-center gap-3 text-slate-500">
              <MessageSquareText size={20} />
              <p className="text-sm">Template management is coming in a later sprint.</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
