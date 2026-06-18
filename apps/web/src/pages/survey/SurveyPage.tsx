import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Download, Plus, Trash2, CheckCircle, AlertTriangle, Navigation, FileText,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { surveyApi } from '@/api/survey';
import { propertiesApi } from '@/api/properties';
import { getApiError } from '@/api/client';
import { formatDateTime, plotStatusLabel } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { ManualSurveyPoint, SurveyImportBody, SurveyValidateResult, PlotStatus } from '@/types';

const PLOT_STATUSES: PlotStatus[] = ['VACANT', 'OCCUPIED', 'DISPUTED', 'RESERVED', 'UNDER_SURVEY'];

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

type ImportTab = 'upload' | 'manual' | 'gps';

const TABS: { key: ImportTab; label: string }[] = [
  { key: 'upload', label: 'Upload File' },
  { key: 'manual', label: 'Manual Entry' },
  { key: 'gps', label: 'GPS Session' },
];

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
      <CheckCircle size={15} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ValidationResultBox({ result }: { result: SurveyValidateResult }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 text-sm space-y-1.5',
        result.valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
      )}
    >
      <p className={cn('font-medium', result.valid ? 'text-emerald-700' : 'text-red-700')}>
        {result.valid ? 'Valid boundary' : 'Validation failed'} — calculated area:{' '}
        {result.calculatedAreaM2 >= 10_000
          ? `${(result.calculatedAreaM2 / 10_000).toFixed(2)} ha`
          : `${result.calculatedAreaM2.toLocaleString()} m²`}
      </p>
      {result.errors.map((e, i) => (
        <p key={`err-${i}`} className="text-red-600 text-xs">• {e}</p>
      ))}
      {result.warnings.map((w, i) => (
        <p key={`warn-${i}`} className="text-amber-600 text-xs">• {w}</p>
      ))}
    </div>
  );
}

// ─── Upload File tab ─────────────────────────────────────────────────────────

function UploadTab({ propertyId, onImported }: { propertyId: string; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [body, setBody] = useState<SurveyImportBody | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<SurveyValidateResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: (b: SurveyImportBody) => surveyApi.validate(propertyId, b),
    onSuccess: (result) => setValidation(result),
  });

  const importMutation = useMutation({
    mutationFn: (b: SurveyImportBody) => surveyApi.import(propertyId, b),
    onSuccess: () => {
      setBody(null);
      setFileName('');
      setValidation(null);
      onImported();
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setValidation(null);
    setParseError(null);
    importMutation.reset();
    validateMutation.reset();
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.csv')) {
      setBody({ format: 'CSV', data: text });
      return;
    }
    try {
      const json = JSON.parse(text);
      setBody({ format: 'GEOJSON', data: json });
    } catch {
      setParseError('Could not parse file as JSON. Expected a GeoJSON (.geojson/.json) or .csv file.');
      setBody(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Survey file (.geojson, .json, or .csv)</label>
        <input
          type="file"
          accept=".geojson,.json,.csv"
          onChange={handleFile}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
        />
        {fileName && <p className="text-xs text-slate-500 mt-1">Selected: {fileName}</p>}
      </div>

      {parseError && <ErrorBox message={parseError} />}
      {(validateMutation.error || importMutation.error) && (
        <ErrorBox message={getApiError(validateMutation.error ?? importMutation.error)} />
      )}
      {validation && <ValidationResultBox result={validation} />}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!body}
          loading={validateMutation.isPending}
          onClick={() => body && validateMutation.mutate(body)}
        >
          Validate
        </Button>
        <Button disabled={!body} loading={importMutation.isPending} onClick={() => body && importMutation.mutate(body)}>
          <Upload size={15} />
          Import
        </Button>
      </div>

      {importMutation.isSuccess && (
        <SuccessBox message={`Imported ${importMutation.data?.length ?? 0} plot(s) successfully.`} />
      )}
    </div>
  );
}

// ─── Manual Entry tab ────────────────────────────────────────────────────────

function ManualTab({ propertyId, onImported }: { propertyId: string; onImported: () => void }) {
  const [plotLabel, setPlotLabel] = useState('');
  const [status, setStatus] = useState<PlotStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [points, setPoints] = useState<ManualSurveyPoint[]>([
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0 },
  ]);
  const [validation, setValidation] = useState<SurveyValidateResult | null>(null);

  const buildBody = (): SurveyImportBody => ({
    format: 'MANUAL',
    data: {
      plotLabel: plotLabel.trim() || undefined,
      status: status || undefined,
      notes: notes.trim() || undefined,
      points,
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => surveyApi.validate(propertyId, buildBody()),
    onSuccess: (result) => setValidation(result),
  });

  const importMutation = useMutation({
    mutationFn: () => surveyApi.import(propertyId, buildBody()),
    onSuccess: () => {
      setPlotLabel('');
      setStatus('');
      setNotes('');
      setPoints([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }]);
      setValidation(null);
      onImported();
    },
  });

  const updatePoint = (index: number, field: keyof ManualSurveyPoint, raw: string) => {
    const value = raw === '' ? (field === 'elev' ? undefined : 0) : parseFloat(raw);
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPoint = () => setPoints((prev) => [...prev, { lat: 0, lng: 0 }]);
  const removePoint = (index: number) => setPoints((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="form-label">Plot label (optional)</label>
          <input value={plotLabel} onChange={(e) => setPlotLabel(e.target.value)} placeholder="e.g. PLT-101" className={INPUT_CLASS} />
        </div>
        <div>
          <label className="form-label">Status (optional)</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as PlotStatus | '')} className={INPUT_CLASS}>
            <option value="">— Default —</option>
            {PLOT_STATUSES.map((s) => (
              <option key={s} value={s}>{plotStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT_CLASS} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Boundary points (minimum 3, in order)</label>
          <Button size="sm" variant="secondary" onClick={addPoint}>
            <Plus size={14} />
            Add Point
          </Button>
        </div>
        <div className="space-y-2">
          {points.map((pt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-5 shrink-0">{i + 1}</span>
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={pt.lat}
                onChange={(e) => updatePoint(i, 'lat', e.target.value)}
                className={INPUT_CLASS}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={pt.lng}
                onChange={(e) => updatePoint(i, 'lng', e.target.value)}
                className={INPUT_CLASS}
              />
              <input
                type="number"
                step="any"
                placeholder="Elevation (m, optional)"
                value={pt.elev ?? ''}
                onChange={(e) => updatePoint(i, 'elev', e.target.value)}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => removePoint(i)}
                disabled={points.length <= 3}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {(validateMutation.error || importMutation.error) && (
        <ErrorBox message={getApiError(validateMutation.error ?? importMutation.error)} />
      )}
      {validation && <ValidationResultBox result={validation} />}

      <div className="flex gap-2">
        <Button variant="secondary" loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
          Validate
        </Button>
        <Button loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
          <Upload size={15} />
          Create Plot
        </Button>
      </div>

      {importMutation.isSuccess && (
        <SuccessBox message={`Created ${importMutation.data?.length ?? 0} plot(s) successfully.`} />
      )}
    </div>
  );
}

// ─── GPS Session tab ─────────────────────────────────────────────────────────

function GpsSessionTab({ propertyId, onImported }: { propertyId: string; onImported: () => void }) {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [elev, setElev] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const [plotLabel, setPlotLabel] = useState('');
  const [closeStatus, setCloseStatus] = useState<PlotStatus | ''>('');

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['survey-sessions', propertyId],
    queryFn: () => surveyApi.listSessions(propertyId),
  });

  const { data: points, isLoading: pointsLoading } = useQuery({
    queryKey: ['survey-session-points', propertyId, sessionId],
    queryFn: () => surveyApi.getSessionPoints(propertyId, sessionId),
    enabled: !!sessionId,
  });

  const addPointMutation = useMutation({
    mutationFn: () =>
      surveyApi.addPoint(propertyId, {
        sessionId,
        pointIndex: points?.length ?? 0,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        elevation: elev === '' ? undefined : parseFloat(elev),
        accuracy: accuracy === '' ? undefined : parseFloat(accuracy),
      }),
    onSuccess: () => {
      setLat('');
      setLng('');
      setElev('');
      setAccuracy('');
      queryClient.invalidateQueries({ queryKey: ['survey-session-points', propertyId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ['survey-sessions', propertyId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      surveyApi.closeSession(propertyId, sessionId, {
        plotLabel: plotLabel.trim() || undefined,
        status: closeStatus || undefined,
      }),
    onSuccess: () => {
      setSessionId('');
      setPlotLabel('');
      setCloseStatus('');
      queryClient.invalidateQueries({ queryKey: ['survey-sessions', propertyId] });
      onImported();
    },
  });

  const startNewSession = () => setSessionId(`session-${Date.now()}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="form-label">Active session</label>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={INPUT_CLASS}>
            <option value="">— Select session —</option>
            {sessionsLoading && <option disabled>Loading…</option>}
            {sessions?.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionId} ({s.pointCount} point{s.pointCount === 1 ? '' : 's'})
              </option>
            ))}
            {sessionId && !sessions?.some((s) => s.sessionId === sessionId) && (
              <option value={sessionId}>{sessionId} (new)</option>
            )}
          </select>
        </div>
        <Button variant="secondary" size="sm" onClick={startNewSession}>
          <Navigation size={14} />
          Start New Session
        </Button>
      </div>

      {sessionId && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="form-label">Latitude</label>
              <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="form-label">Longitude</label>
              <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="form-label">Elevation (m)</label>
              <input type="number" step="any" value={elev} onChange={(e) => setElev(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="form-label">Accuracy (m)</label>
              <input type="number" step="any" value={accuracy} onChange={(e) => setAccuracy(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>

          {addPointMutation.error && <ErrorBox message={getApiError(addPointMutation.error)} />}

          <Button size="sm" loading={addPointMutation.isPending} disabled={lat === '' || lng === ''} onClick={() => addPointMutation.mutate()}>
            <Plus size={14} />
            Capture Point
          </Button>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Captured points ({points?.length ?? 0})</p>
            {pointsLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : !points?.length ? (
              <p className="text-sm text-slate-400">No points captured yet</p>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">#</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Latitude</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Longitude</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Elevation</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Captured</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {points.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-slate-500">{p.pointIndex}</td>
                        <td className="px-3 py-2 text-slate-700">{p.latitude.toFixed(6)}</td>
                        <td className="px-3 py-2 text-slate-700">{p.longitude.toFixed(6)}</td>
                        <td className="px-3 py-2 text-slate-500">{p.elevation != null ? `${p.elevation}m` : '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{formatDateTime(p.capturedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {(points?.length ?? 0) >= 3 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Close session and create plot</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Plot label (optional)</label>
                  <input value={plotLabel} onChange={(e) => setPlotLabel(e.target.value)} placeholder="e.g. PLT-102" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className="form-label">Status (optional)</label>
                  <select value={closeStatus} onChange={(e) => setCloseStatus(e.target.value as PlotStatus | '')} className={INPUT_CLASS}>
                    <option value="">— Default —</option>
                    {PLOT_STATUSES.map((s) => (
                      <option key={s} value={s}>{plotStatusLabel(s)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {closeMutation.error && <ErrorBox message={getApiError(closeMutation.error)} />}
              <Button loading={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                <CheckCircle size={15} />
                Close Session &amp; Create Plot
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SurveyPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ImportTab>('upload');

  const { data: propertiesList, isLoading: propertiesLoading } = useQuery({
    queryKey: ['survey-properties'],
    queryFn: () => propertiesApi.list({ limit: 100 }),
  });

  const properties = propertiesList?.data ?? [];
  const selectedPropertyId = searchParams.get('property');
  const propertyId = selectedPropertyId ?? properties[0]?.id ?? null;
  const property = properties.find((p) => p.id === propertyId) ?? null;

  const handlePropertyChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('property', id);
    setSearchParams(next, { replace: true });
  };

  const { data: imports, isLoading: importsLoading } = useQuery({
    queryKey: ['survey-imports', propertyId],
    queryFn: () => surveyApi.listImports(propertyId!),
    enabled: !!propertyId,
  });

  const handleDownloadTemplate = async () => {
    if (!propertyId) return;
    const blob = await surveyApi.getTemplate(propertyId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gps-survey-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImported = () => {
    if (!propertyId) return;
    queryClient.invalidateQueries({ queryKey: ['simulation-plots', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['survey-imports', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['survey-sessions', propertyId] });
  };

  return (
    <div>
      <Header
        title="GPS Survey Data Import"
        subtitle={
          property
            ? `${property.name} — import boundary surveys to populate the 3D map`
            : 'Import GPS survey data to generate plot boundaries'
        }
      />

      <div className="p-6 space-y-6">
        {properties.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="survey-property" className="text-sm font-medium text-slate-700">
              Property:
            </label>
            <select
              id="survey-property"
              value={propertyId ?? ''}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {propertiesLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : !propertyId ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">No properties found. Create a property first.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title="Import Survey Data"
                subtitle="Upload a file, enter coordinates manually, or capture points via GPS"
                action={
                  <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
                    <Download size={15} />
                    Download CSV Template
                  </Button>
                }
              />
              <CardBody>
                <div className="flex gap-1 border-b border-slate-100 mb-4 -mt-2">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                        tab === t.key
                          ? 'border-brand-600 text-brand-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'upload' && <UploadTab propertyId={propertyId} onImported={handleImported} />}
                {tab === 'manual' && <ManualTab propertyId={propertyId} onImported={handleImported} />}
                {tab === 'gps' && <GpsSessionTab propertyId={propertyId} onImported={handleImported} />}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Survey History" subtitle="Past imports for this property" />
              <CardBody className="p-0">
                {importsLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : !imports?.length ? (
                  <div className="text-center py-10">
                    <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No survey imports yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Format</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plots Created</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Imported By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {imports.map((imp) => (
                          <tr key={imp.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 text-slate-700">{formatDateTime(imp.createdAt)}</td>
                            <td className="px-6 py-3"><Badge variant="blue">{imp.format}</Badge></td>
                            <td className="px-6 py-3 text-slate-600">{imp.plotsCreated}</td>
                            <td className="px-6 py-3 text-slate-600">
                              {imp.importedBy.firstName} {imp.importedBy.lastName}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
