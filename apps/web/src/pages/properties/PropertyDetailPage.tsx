import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LayoutGrid, MapPin, Trash2, Users } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { PlotStatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlotMap } from '@/components/map/PlotMap';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { CapabilityGate } from '@/auth/CapabilityGate';
import { Capability } from '@geolandpro/rbac';
import { propertiesApi } from '@/api/properties';
import { documentsApi } from '@/api/documents';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { formatArea, formatDate } from '@/utils/format';

function DeletePropertyModal({
  open,
  onClose,
  propertyId,
  propertyName,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  propertyName: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => propertiesApi.deactivate(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      navigate('/properties');
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Delete Property" size="sm">
      <div className="space-y-4">
        {deleteMutation.error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {getApiError(deleteMutation.error)}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <strong>{propertyName}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function PropertyDetailPage() {
  const { impersonation } = useAuth();
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const [plotPage, setPlotPage] = useState(1);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: property, isLoading: propLoading } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => propertiesApi.getById(propertyId!),
    enabled: !!propertyId,
  });

  const { data: plotsData, isLoading: plotsLoading } = useQuery({
    queryKey: ['plots', propertyId, plotPage],
    queryFn: () => propertiesApi.listPlots(propertyId!, { page: plotPage, limit: 10 }),
    enabled: !!propertyId,
  });

  if (propLoading) {
    return (
      <div className="flex justify-center py-20"><Spinner size="lg" /></div>
    );
  }

  if (!property) {
    return (
      <div className="p-6 text-center text-slate-500">Property not found.</div>
    );
  }

  return (
    <div>
      <Header
        title={property.name}
        subtitle={`${property.region} · ${property.district}`}
        actions={
          <div className="flex items-center gap-3">
            {!impersonation && (
              <CapabilityGate capabilities={[Capability.DOCUMENT_GENERATE_ALL]}>
                <GenerateDocumentButton
                  label="Annual Report"
                  generate={() => documentsApi.generateAnnualReport(property.id)}
                />
              </CapabilityGate>
            )}
            {!impersonation && (
              <CapabilityGate capabilities={[Capability.PROPERTY_CREATE_DELETE]}>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} />
                  Delete
                </Button>
              </CapabilityGate>
            )}
            <Link to="/properties" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft size={16} /> Back
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Property overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Property Details" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">Address</dt>
                  <dd className="font-medium text-slate-900 mt-0.5 flex items-center gap-1">
                    <MapPin size={13} className="text-slate-400" />
                    {property.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Total Area</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{formatArea(property.totalAreaSqm)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Region</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{property.region}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">District</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{property.district}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Plots</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{property._count.plots}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="mt-0.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      property.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {property.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </dd>
                </div>
              </dl>
              {property.description && (
                <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100">
                  {property.description}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Managers" />
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100">
                {property.managers.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                    </div>
                  </li>
                ))}
                {property.managers.length === 0 && (
                  <li className="px-6 py-4 text-sm text-slate-400">
                    <Users size={16} className="inline mr-1" />
                    No managers assigned
                  </li>
                )}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Map */}
        {plotsData?.data && plotsData.data.length > 0 && (
          <Card>
            <CardHeader title="Plot Map" subtitle="Boundary overview for all plots in this property" />
            <CardBody>
              <PlotMap plots={plotsData.data} className="h-80 w-full rounded-lg" />
            </CardBody>
          </Card>
        )}

        {/* Plots table */}
        <Card>
          <CardHeader
            title="Plots"
            subtitle={`${plotsData?.meta.total ?? 0} plots total`}
          />
          {plotsLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : !plotsData?.data.length ? (
            <EmptyState
              icon={<LayoutGrid size={22} />}
              title="No plots mapped yet"
              description="Import GPS survey data or draw plots manually on the Property Map to get started"
              actionLabel="Go to Property Map"
              onAction={() => navigate(`/map?property=${property.id}`)}
              secondaryActionLabel="Import Survey Data"
              onSecondaryAction={() => navigate(`/survey?property=${property.id}`)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plot No.</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Area</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Created</th>
                    <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {plotsData?.data.map((plot) => (
                    <tr
                      key={plot.id}
                      onClick={() => navigate(`/plots/${plot.id}`)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-medium">
                        <Link to={`/plots/${plot.id}`} className="text-brand-600 hover:text-brand-700">
                          {plot.plotNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3"><PlotStatusBadge status={plot.status} /></td>
                      <td className="px-6 py-3 text-slate-600">{formatArea(plot.areaSqm)}</td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(plot.createdAt)}</td>
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        <CapabilityGate capabilities={[Capability.DOCUMENT_GENERATE_ALL]}>
                          <GenerateDocumentButton
                            label="Lands Commission Package"
                            generate={() => documentsApi.generateLCSubmissionPackage(plot.id)}
                          />
                        </CapabilityGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-center p-4">
                <Pagination
                  page={plotPage}
                  totalPages={plotsData?.meta.totalPages ?? 1}
                  onPageChange={setPlotPage}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <DeletePropertyModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        propertyId={property.id}
        propertyName={property.name}
      />
    </div>
  );
}
