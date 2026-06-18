import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Lock, Download, PackageCheck, CheckCircle2, Database, MailCheck } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { vaultApi } from '@/api/vault';
import { propertiesApi } from '@/api/properties';
import { brand } from '@/config/brand.config';
import { getApiError } from '@/api/client';
import { formatDate } from '@/utils/format';

const SIMULATION_PROPERTY_NAME = 'Karlsruhe Simulation Estate';

const BACKED_UP_ITEMS = ['Plots', 'Documents', 'Photos', 'Tenant records', 'Payment history'];

const PHYSICAL_VAULT_ITEMS = [
  'Printed annual property report',
  'All boundary and plot certificates',
  'Full tenant register',
  'Sealed and stored in a secure facility',
  'Delivered to your registered address',
];

function RequestPhysicalVaultModal({
  open,
  onClose,
  propertyId,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
}) {
  const [name, setName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const requestMutation = useMutation({
    mutationFn: () => vaultApi.requestPhysicalVault(propertyId, { name, deliveryAddress, contactNumber }),
  });

  const handleClose = () => {
    requestMutation.reset();
    setName('');
    setDeliveryAddress('');
    setContactNumber('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Request Physical Vault" size="sm">
      {requestMutation.isSuccess ? (
        <div className="flex flex-col items-center text-center py-4">
          <div className="p-3 rounded-full bg-emerald-50 text-emerald-600 mb-3">
            <MailCheck size={22} />
          </div>
          <p className="text-sm font-medium text-slate-900">
            Request sent — {brand.name} will contact you within 2 business days
          </p>
          <Button className="mt-5" size="sm" onClick={handleClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {requestMutation.error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {getApiError(requestMutation.error)}
            </div>
          )}
          <p className="text-sm text-slate-500">
            Tell us where to send your physical vault and our team will be in touch to arrange delivery.
          </p>
          <Input label="Name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Delivery address"
            placeholder="e.g. P.O. Box 123, Accra, Ghana"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
          />
          <Input
            label="Contact number"
            type="tel"
            placeholder="e.g. +233 24 000 0000"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={handleClose} disabled={requestMutation.isPending}>
              Cancel
            </Button>
            <Button
              loading={requestMutation.isPending}
              disabled={!name || !deliveryAddress || !contactNumber}
              onClick={() => requestMutation.mutate()}
            >
              Send Request
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function VaultPage() {
  const [requestOpen, setRequestOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ['simulation-property'],
    queryFn: async () => {
      const result = await propertiesApi.list({ search: SIMULATION_PROPERTY_NAME, limit: 1 });
      return result.data[0] ?? null;
    },
  });

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['vault-status', property?.id],
    queryFn: () => vaultApi.getStatus(property!.id),
    enabled: !!property?.id,
  });

  const generatePackMutation = useMutation({
    mutationFn: () => vaultApi.generatePack(property!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-status', property?.id] });
    },
  });

  const isLoading = propertyLoading || (!!property && statusLoading);

  return (
    <div>
      <Header title="Document Vault" subtitle="Digital and physical backup of your land records" />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : !property ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">
                No simulation estate found. Run{' '}
                <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">npm run prisma:seed:simulation</code>{' '}
                in <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">apps/api</code> to generate it.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TIER 1 — DIGITAL BACKUP (included) */}
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2.5">
                    <span className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                      <ShieldCheck size={18} />
                    </span>
                    Digital Backup
                  </span>
                }
                action={<Badge variant="green">Included</Badge>}
              />
              <CardBody className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Cloud backup status</span>
                    <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                      <CheckCircle2 size={15} />
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Last backup</span>
                    <span className="font-medium text-slate-900">{formatDate(status?.lastPackGenerated)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Triple-redundant storage</span>
                    <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                      <CheckCircle2 size={15} />
                      Active
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Database size={14} className="text-slate-400" />
                    What is backed up
                  </p>
                  <ul className="space-y-1.5">
                    {BACKED_UP_ITEMS.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                        <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {generatePackMutation.error && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {getApiError(generatePackMutation.error)}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100">
                  {generatePackMutation.isPending ? (
                    <Button disabled loading>
                      Generating pack…
                    </Button>
                  ) : generatePackMutation.data ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={generatePackMutation.data.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg font-medium transition-colors bg-brand-600 text-white hover:bg-brand-700 px-4 py-2 text-sm"
                      >
                        <Download size={15} />
                        Download Pack ({generatePackMutation.data.fileCount} files)
                      </a>
                      <Button variant="secondary" size="sm" onClick={() => generatePackMutation.mutate()}>
                        Regenerate
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => generatePackMutation.mutate()}>
                      <PackageCheck size={15} />
                      Generate Annual Digital Pack
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* TIER 2 — PHYSICAL VAULT (premium add-on) */}
            <Card className="bg-slate-50/60">
              <CardHeader
                title={
                  <span className="flex items-center gap-2.5 text-slate-500">
                    <span className="p-1.5 bg-slate-200 rounded-lg text-slate-500">
                      <Lock size={18} />
                    </span>
                    Physical Vault
                  </span>
                }
                action={<Badge variant="slate">Premium Add-On</Badge>}
              />
              <CardBody className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Your land records, physically secured</p>
                </div>
                <ul className="space-y-1.5">
                  {PHYSICAL_VAULT_ITEMS.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-500">
                      <Lock size={13} className="text-slate-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="pt-2 border-t border-slate-200">
                  <Button variant="secondary" size="sm" onClick={() => setRequestOpen(true)}>
                    Request Physical Vault
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {property && (
        <RequestPhysicalVaultModal open={requestOpen} onClose={() => setRequestOpen(false)} propertyId={property.id} />
      )}
    </div>
  );
}
