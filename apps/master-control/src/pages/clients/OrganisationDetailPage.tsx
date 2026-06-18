import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, MapPin, DollarSign, Percent, LogIn, Clock, ArrowUpRight, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { platformApi, type UpdateOrganisationBody } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { canAnyPlatform, DEFAULT_GRANTED_ACCESS_SCOPES, PlatformCapability } from '@geolandpro/rbac';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { getApiError } from '@/api/client';
import type { AccessRequestStatus } from '@/types';

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'http://localhost:5173';

const TERMINAL_ACCESS_REQUEST_STATUSES = new Set<AccessRequestStatus>(['DENIED', 'EXPIRED', 'REVOKED', 'ENDED']);

export function OrganisationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [form, setForm] = useState<UpdateOrganisationBody | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');

  const canRequestAccess = canAnyPlatform(user?.platformRole, [PlatformCapability.ORG_IMPERSONATE]);

  const { data: org, isLoading } = useQuery({
    queryKey: ['platform-organisation', id],
    queryFn: () => platformApi.getOrganisation(id as string),
    enabled: !!id,
  });

  const { data: myAccessRequests } = useQuery({
    queryKey: ['my-access-requests'],
    queryFn: () => platformApi.listMyAccessRequests({ limit: 100 }),
    enabled: canRequestAccess,
  });

  // Latest non-terminal access request for this organisation, for the status-aware control.
  const accessRequest = (myAccessRequests?.data ?? [])
    .filter((req) => req.organisationId === id && !TERMINAL_ACCESS_REQUEST_STATUSES.has(req.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  useEffect(() => {
    if (org && !form) {
      setForm({
        name: org.name,
        slug: org.slug,
        country: org.country,
        currency: org.currency,
        timezone: org.timezone,
        subscriptionTier: org.subscriptionTier,
        commissionRate: org.commissionRate,
        maxProperties: org.maxProperties,
        maxUsers: org.maxUsers,
      });
    }
  }, [org, form]);

  const updateMutation = useMutation({
    mutationFn: (body: UpdateOrganisationBody) => platformApi.updateOrganisation(id as string, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-organisation', id] }),
    onError: (err) => setError(getApiError(err)),
  });

  const suspendMutation = useMutation({
    mutationFn: () => platformApi.suspendOrganisation(id as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-organisation', id] }),
    onError: (err) => setError(getApiError(err)),
  });

  const activateMutation = useMutation({
    mutationFn: () => platformApi.activateOrganisation(id as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-organisation', id] }),
    onError: (err) => setError(getApiError(err)),
  });

  const requestAccessMutation = useMutation({
    // Lightweight-now: request the landowner's default grant; the landowner
    // narrows scopes to least privilege at Accept time (ApproveModal,
    // apps/web). Per-request scope selection in Master Control is a future
    // enhancement.
    mutationFn: () =>
      platformApi.createAccessRequest(id as string, {
        requestedScopes: [...DEFAULT_GRANTED_ACCESS_SCOPES],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-access-requests'] }),
    onError: (err) => setError(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (token?: string) => platformApi.deleteOrganisation(id as string, token),
    onSuccess: (result) => {
      setDeleteMessage(result.message);
      if (result.status === 'confirmation_required') {
        setConfirmationToken(result.confirmationToken ?? null);
        setTokenExpiresAt(result.expiresAt ?? null);
      } else {
        setConfirmationToken(null);
        navigate('/clients');
      }
    },
    onError: (err) => setError(getApiError(err)),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form) updateMutation.mutate(form);
  };

  const handleRequestDelete = () => {
    setError('');
    setDeleteMessage('');
    deleteMutation.mutate(undefined);
  };

  const handleConfirmDelete = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    deleteMutation.mutate(tokenInput);
  };

  if (isLoading || !org || !form) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <Header
        title={org.name}
        subtitle={org.slug}
        actions={
          <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back to Client Management
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Users" value={`${org.userCount} / ${org.maxUsers}`} icon={<Users size={20} />} />
          <StatCard label="Properties" value={`${org.propertyCount} / ${org.maxProperties}`} icon={<MapPin size={20} />} />
          <StatCard label="Revenue This Month" value={formatCurrency(org.revenueThisMonthGHS)} icon={<DollarSign size={20} />} />
          <StatCard label="Commission Earned" value={formatCurrency(org.totalCommissionEarnedGHS)} icon={<Percent size={20} />} />
        </div>

        <Card>
          <CardHeader
            title="Status"
            subtitle={`Created ${formatDate(org.createdAt)}`}
            action={
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  org.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                }`}>
                  {org.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
            }
          />
          <CardBody className="flex flex-wrap gap-3">
            <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_IMPERSONATE]}>
              {accessRequest?.status === 'PENDING' ? (
                <Badge variant="yellow">
                  <Clock size={14} className="mr-1" /> Pending — waiting for landowner to accept
                </Badge>
              ) : accessRequest?.status === 'APPROVED' || accessRequest?.status === 'ACTIVE' ? (
                <a
                  href={`${WEB_APP_URL}/access-requests`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  Continue in app <ArrowUpRight size={16} />
                </a>
              ) : (
                <Button variant="secondary" loading={requestAccessMutation.isPending} onClick={() => requestAccessMutation.mutate()}>
                  <LogIn size={16} /> Request Access
                </Button>
              )}
            </PlatformCapabilityGate>
            <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_MANAGE]}>
              {org.isActive ? (
                <Button variant="danger" loading={suspendMutation.isPending} onClick={() => suspendMutation.mutate()}>
                  <Ban size={16} /> Suspend Organisation
                </Button>
              ) : (
                <Button variant="primary" loading={activateMutation.isPending} onClick={() => activateMutation.mutate()}>
                  <CheckCircle2 size={16} /> Activate Organisation
                </Button>
              )}
            </PlatformCapabilityGate>
          </CardBody>
        </Card>

        <form onSubmit={handleSave}>
          <Card>
            <CardHeader title="Settings & Limits" subtitle="Subscription, branding and usage limits for this organisation" />
            <CardBody className="space-y-4">
              <fieldset disabled={!form} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  <Input label="Currency" value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="form-label">Subscription Tier</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={form.subscriptionTier}
                      onChange={(e) => setForm({ ...form, subscriptionTier: e.target.value })}
                    >
                      <option value="STANDARD">Standard</option>
                      <option value="PROFESSIONAL">Professional</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                  <Input
                    label="Commission Rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={form.commissionRate}
                    onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })}
                    hint="0.10 = 10%"
                  />
                  <Input
                    label="Max Properties"
                    type="number"
                    min="1"
                    value={form.maxProperties}
                    onChange={(e) => setForm({ ...form, maxProperties: Number(e.target.value) })}
                  />
                </div>
                <Input
                  label="Max Users"
                  type="number"
                  min="1"
                  value={form.maxUsers}
                  onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
                  className="max-w-[12rem]"
                />
              </fieldset>
              <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_MANAGE]}>
                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
                </div>
              </PlatformCapabilityGate>
            </CardBody>
          </Card>
        </form>

        <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_DELETE]}>
          <Card className="border-red-200">
            <CardHeader title="Delete Organisation" subtitle="Permanently removes this organisation and all of its data" />
            <CardBody className="space-y-4">
              <p className="text-sm text-slate-600">
                Deletion requires confirmation from <strong>two different platform directors</strong>. Requesting
                deletion generates a one-time token here; a second director must enter that token below within
                10 minutes to permanently delete <strong>{org.name}</strong> and all associated properties, leases,
                users and records.
              </p>

              {deleteMessage && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
                  <p>{deleteMessage}</p>
                  {confirmationToken && (
                    <p className="font-mono text-xs break-all">
                      Confirmation token: <span className="font-semibold">{confirmationToken}</span>
                    </p>
                  )}
                  {tokenExpiresAt && (
                    <p className="text-xs text-amber-600">Expires at {formatDateTime(tokenExpiresAt)}</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <Button
                  variant="danger"
                  loading={deleteMutation.isPending && !tokenInput}
                  onClick={handleRequestDelete}
                >
                  <Trash2 size={16} /> Request Deletion
                </Button>

                <form onSubmit={handleConfirmDelete} className="flex items-end gap-2">
                  <Input
                    label="Confirmation token (from a different director)"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="w-72"
                    placeholder="Paste confirmation token"
                  />
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={!tokenInput}
                    loading={deleteMutation.isPending && !!tokenInput}
                  >
                    Confirm Deletion
                  </Button>
                </form>
              </div>
            </CardBody>
          </Card>
        </PlatformCapabilityGate>
      </div>
    </div>
  );
}
