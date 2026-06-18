import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Copy } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { platformApi, type CreateOrganisationResult } from '@/api/platform';
import { getApiError } from '@/api/client';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreateOrganisationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [country, setCountry] = useState('Ghana');
  const [currency, setCurrency] = useState('GHS');
  const [timezone, setTimezone] = useState('Africa/Accra');
  const [subscriptionTier, setSubscriptionTier] = useState('STANDARD');
  const [commissionRate, setCommissionRate] = useState('0.10');
  const [maxProperties, setMaxProperties] = useState('10');
  const [maxUsers, setMaxUsers] = useState('50');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateOrganisationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: platformApi.createOrganisation,
    onSuccess: (data) => setResult(data),
    onError: (err) => setError(getApiError(err)),
  });

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    createMutation.mutate({
      name,
      slug: slug || undefined,
      country,
      currency,
      timezone,
      subscriptionTier,
      commissionRate: Number(commissionRate),
      maxProperties: Number(maxProperties),
      maxUsers: Number(maxUsers),
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPhone: adminPhone || undefined,
    });
  };

  const copyPassword = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result) {
    return (
      <div>
        <Header title="Organisation Created" subtitle={result.organisation.name} />
        <div className="p-6 max-w-xl">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-600">
                <CheckCircle2 size={24} />
                <p className="font-semibold text-slate-900">
                  {result.organisation.name} was created successfully
                </p>
              </div>
              <p className="text-sm text-slate-600">
                A SUPER_ADMIN account has been created for{' '}
                <span className="font-medium">{result.adminUser.email}</span>. Share these
                temporary credentials securely — the password will not be shown again.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Email</span>
                  <span className="text-sm font-medium text-slate-900">{result.adminUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Temporary password</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-medium text-slate-900">{result.temporaryPassword}</code>
                    <button onClick={copyPassword} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="Copy password">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                {copied && <p className="text-xs text-emerald-600 text-right">Copied to clipboard</p>}
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="secondary" onClick={() => navigate('/clients')}>Back to Client Management</Button>
                <Button onClick={() => navigate(`/clients/${result.organisation.id}`)}>View Organisation</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="New Organisation"
        subtitle="Create a new client organisation and its first SUPER_ADMIN"
        actions={
          <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="p-6 max-w-2xl space-y-4">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          <CardHeader title="Organisation Details" />
          <CardBody className="space-y-4">
            <Input label="Organisation Name" required value={name} onChange={(e) => handleNameChange(e.target.value)} />
            <Input
              label="Slug"
              required
              value={slug}
              onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
              hint="Used in URLs and invite links. Lowercase letters, numbers and hyphens only."
            />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
              <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
            <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="form-label" htmlFor="subscription-tier">Subscription Tier</label>
                <select
                  id="subscription-tier"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={subscriptionTier}
                  onChange={(e) => setSubscriptionTier(e.target.value)}
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
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                hint="0.10 = 10%"
              />
              <Input label="Max Properties" type="number" min="1" value={maxProperties} onChange={(e) => setMaxProperties(e.target.value)} />
            </div>
            <Input label="Max Users" type="number" min="1" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className="max-w-[12rem]" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="First Super Admin" subtitle="This account will have full SUPER_ADMIN access within the new organisation" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
              <Input label="Last Name" required value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
            </div>
            <Input label="Email" type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            <Input label="Phone" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} hint="Optional" />
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/clients')}>Cancel</Button>
          <Button type="submit" loading={createMutation.isPending}>Create Organisation</Button>
        </div>
      </form>
    </div>
  );
}
