import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { platformApi } from '@/api/platform';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { PlatformCapability } from '@geolandpro/rbac';
import { formatDate } from '@/utils/format';
import { getApiError } from '@/api/client';
import { useState } from 'react';
import type { OnboardingOrganisation } from '@/types';

interface Stage {
  number: number;
  title: string;
  description: string;
}

// Mirrors the binding mapping for `Organisation.onboardingStage`:
// 1-3 = isActive=false + no admin users yet, 4-5 = isActive=false + credentials sent,
// 6 = isActive=true (live). Admins move cards forward/back as work progresses.
const STAGES: Stage[] = [
  { number: 1, title: 'Lead Captured', description: 'Agreement signed, account not yet created' },
  { number: 2, title: 'Account Setup', description: 'Organisation record created' },
  { number: 3, title: 'Configuration', description: 'Branding, limits and plan configured' },
  { number: 4, title: 'Credentials Sent', description: 'Admin login sent to the client' },
  { number: 5, title: 'Training & Verification', description: 'Client onboarding call and checks' },
  { number: 6, title: 'Live', description: 'Organisation activated' },
];

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-onboarding'],
    queryFn: () => platformApi.listOnboarding(),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: number }) => platformApi.updateOnboardingStage(id, stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-onboarding'] }),
    onError: (err) => setError(getApiError(err)),
  });

  const handleMove = (org: OnboardingOrganisation, direction: -1 | 1) => {
    const nextStage = org.onboardingStage + direction;
    if (nextStage < 1 || nextStage > 6) return;
    setError('');
    moveMutation.mutate({ id: org.id, stage: nextStage });
  };

  return (
    <div>
      <Header title="Onboarding Pipeline" subtitle="New organisation rollout, stages 1-6" />

      <div className="p-6 space-y-4">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {isLoading || !data ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            {STAGES.map((stage) => {
              const orgs = data.filter((org) => org.onboardingStage === stage.number);
              return (
                <div key={stage.number} className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase">Stage {stage.number}</p>
                    <h3 className="text-sm font-semibold text-slate-900">{stage.title}</h3>
                    <p className="text-xs text-slate-500">{stage.description}</p>
                  </div>
                  <div className="space-y-2 min-h-[4rem]">
                    {orgs.length === 0 && (
                      <p className="text-xs text-slate-300 italic">No organisations</p>
                    )}
                    {orgs.map((org) => (
                      <Card key={org.id} className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Building2 size={16} className="text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{org.name}</p>
                            <p className="text-xs text-slate-400">{formatDate(org.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={org.isActive ? 'green' : 'slate'}>
                            {org.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="blue">{org.userCount} user{org.userCount === 1 ? '' : 's'}</Badge>
                        </div>
                        <PlatformCapabilityGate capabilities={[PlatformCapability.ONBOARDING_MANAGE]}>
                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              title="Move to previous stage"
                              disabled={stage.number === 1 || moveMutation.isPending}
                              onClick={() => handleMove(org, -1)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowLeft size={14} />
                            </button>
                            <button
                              type="button"
                              title="Move to next stage"
                              disabled={stage.number === 6 || moveMutation.isPending}
                              onClick={() => handleMove(org, 1)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </PlatformCapabilityGate>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
