import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Pencil } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { tenantsApi } from '@/api/tenants';
import { formatDate } from '@/utils/format';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

const ID_TYPES = ['Ghana Card', 'Passport', 'Voter ID'] as const;

const schema = z.object({
  nationalIdType: z.enum(ID_TYPES),
  nationalIdNumber: z.string().min(5, 'Must be at least 5 characters').max(50),
  dateOfBirth: z.string().optional(),
  occupation: z.string().max(100).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: () => tenantsApi.getMyProfile(user!.id),
    enabled: !!user,
    retry: false,
  });

  const notFound = axios.isAxiosError(error) && error.response?.status === 404;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nationalIdType: 'Ghana Card' },
  });

  useEffect(() => {
    if (profile) {
      const ec = profile.emergencyContact as { name?: string; phone?: string; relationship?: string } | null;
      reset({
        nationalIdType: profile.nationalIdType as (typeof ID_TYPES)[number],
        nationalIdNumber: profile.nationalIdNumber,
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
        occupation: profile.occupation ?? '',
        emergencyContactName: ec?.name ?? '',
        emergencyContactPhone: ec?.phone ?? '',
        emergencyContactRelationship: ec?.relationship ?? '',
      });
    }
  }, [profile, reset]);

  const toBody = (data: FormData) => {
    const emergencyContact =
      data.emergencyContactName || data.emergencyContactPhone || data.emergencyContactRelationship
        ? {
            name: data.emergencyContactName ?? '',
            phone: data.emergencyContactPhone ?? '',
            relationship: data.emergencyContactRelationship ?? '',
          }
        : undefined;
    return {
      nationalIdType: data.nationalIdType,
      nationalIdNumber: data.nationalIdNumber,
      dateOfBirth: data.dateOfBirth || undefined,
      occupation: data.occupation || undefined,
      emergencyContact,
    };
  };

  const createMutation = useMutation({
    mutationFn: (data: FormData) => tenantsApi.createProfile(user!.id, toBody(data)),
    onSuccess: () => {
      setFormError('');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.id] });
    },
    onError: (err) => setFormError(getApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => tenantsApi.updateProfile(user!.id, toBody(data)),
    onSuccess: () => {
      setFormError('');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.id] });
    },
    onError: (err) => setFormError(getApiError(err)),
  });

  const onSubmit = (data: FormData) => {
    if (profile) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error && !notFound) {
    return <div className="p-6 text-sm text-red-600">{getApiError(error)}</div>;
  }

  const showForm = editing || (!profile && notFound);

  return (
    <div>
      <Header
        title="My Profile"
        subtitle="Personal details and KYC information"
        actions={
          profile && !editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 max-w-3xl space-y-6">
        {formError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {formError}
          </div>
        )}

        {!showForm && profile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Personal Details" />
              <CardBody>
                <dl className="space-y-3 text-sm">
                  {[
                    ['Full Name', `${profile.user.firstName} ${profile.user.lastName}`],
                    ['Email', profile.user.email],
                    ['Phone', profile.user.phone ?? '—'],
                    ['ID Type', profile.nationalIdType],
                    ['ID Number', profile.nationalIdNumber],
                    ['Date of Birth', formatDate(profile.dateOfBirth)],
                    ['Occupation', profile.occupation ?? '—'],
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
              <CardHeader title="Emergency Contact" />
              <CardBody>
                {profile.emergencyContact ? (
                  <dl className="space-y-3 text-sm">
                    {(() => {
                      const ec = profile.emergencyContact as { name?: string; phone?: string; relationship?: string };
                      return [
                        ['Name', ec.name ?? '—'],
                        ['Phone', ec.phone ?? '—'],
                        ['Relationship', ec.relationship ?? '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="font-medium text-slate-900">{value}</dd>
                        </div>
                      ));
                    })()}
                  </dl>
                ) : (
                  <p className="text-sm text-slate-400">No emergency contact on file</p>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {showForm && (
          <Card>
            <CardHeader
              title={profile ? 'Update KYC Profile' : 'Complete Your KYC Profile'}
              subtitle={profile ? undefined : 'We need a few details to verify your identity'}
            />
            <CardBody>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="form-label">ID Type</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    {...register('nationalIdType')}
                  >
                    {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors.nationalIdType && <p className="form-error">{errors.nationalIdType.message}</p>}
                </div>

                <Input
                  label="ID Number"
                  placeholder="GHA-XXXXXXXXX-X"
                  error={errors.nationalIdNumber?.message}
                  {...register('nationalIdNumber')}
                />

                <Input
                  label="Date of Birth"
                  type="date"
                  error={errors.dateOfBirth?.message}
                  {...register('dateOfBirth')}
                />

                <Input
                  label="Occupation"
                  placeholder="e.g. Trader, Civil Servant"
                  error={errors.occupation?.message}
                  {...register('occupation')}
                />

                <div className="pt-2 border-t border-slate-100">
                  <p className="text-sm font-medium text-slate-700 mb-3">Emergency Contact (optional)</p>
                  <div className="space-y-3">
                    <Input label="Name" {...register('emergencyContactName')} />
                    <Input label="Phone" {...register('emergencyContactPhone')} />
                    <Input label="Relationship" placeholder="e.g. Sibling, Spouse" {...register('emergencyContactRelationship')} />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
                    {profile ? 'Save Changes' : 'Submit Profile'}
                  </Button>
                  {profile && (
                    <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
