import type { AccessScope } from '@geolandpro/rbac';

// ─── Enums (mirror Prisma enums) ──────────────────────────────────────────────

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FIELD_SURVEYOR' | 'TENANT';
// Master Control (Layer 1) roles — null for non-platform-admin users.
export type PlatformRole =
  | 'TECHNICAL_DIRECTOR'
  | 'MANAGING_DIRECTOR'
  | 'FINANCE_CONTROLLER'
  | 'OPERATIONS_LEAD'
  | 'BOARD_OBSERVER';
export type PlotStatus = 'VACANT' | 'OCCUPIED' | 'DISPUTED' | 'RESERVED' | 'UNDER_SURVEY';
export type LeaseStatus = 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
export type TransactionType = 'RENT_PAYMENT' | 'ARREARS_PAYMENT' | 'DEPOSIT' | 'REFUND';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
export type DocumentType =
  | 'BOUNDARY_CERTIFICATE'
  | 'TENANCY_AGREEMENT'
  | 'RENT_RECEIPT'
  | 'ARREARS_NOTICE'
  | 'PLOT_CERTIFICATE'
  | 'LC_SUBMISSION_PACKAGE'
  | 'ANNUAL_REPORT';
export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';
export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
export type AlertEventType = 'BOUNDARY_CROSSED' | 'BOUNDARY_EXITED' | 'SATELLITE_CHANGE';

// ─── Models ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  organisationId: string | null;
  isPlatformAdmin: boolean;
  platformRole: PlatformRole | null;
}

export interface InviteCode {
  id: string;
  code: string;
  organisationId: string;
  role: Role;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  link: string;
}

export interface Property {
  id: string;
  name: string;
  description: string | null;
  address: string;
  region: string;
  district: string;
  totalAreaSqm: number;
  totalAreaHa: number | null;
  boundaryGeoJSON: GeoJSON | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  managers: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>[];
  _count: { plots: number };
}

export interface Plot {
  id: string;
  plotNumber: string;
  propertyId: string;
  status: PlotStatus;
  areaSqm: number;
  centroidLat: number | null;
  centroidLng: number | null;
  boundaryGeoJSON: GeoJSON;
  description: string | null;
  createdAt: string;
  property?: Pick<Property, 'id' | 'name' | 'address'>;
}

export type GeoJSON = { type: string; coordinates: unknown };

/** Minimal plot shape returned by the unpaginated /plots/map endpoint, used for map rendering at scale. */
export type MapPlot = Pick<
  Plot,
  'id' | 'plotNumber' | 'status' | 'areaSqm' | 'centroidLat' | 'centroidLng' | 'boundaryGeoJSON'
>;

export interface TenantProfile {
  id: string;
  userId: string;
  nationalIdType: string;
  nationalIdNumber: string;
  dateOfBirth: string | null;
  occupation: string | null;
  emergencyContact: { name: string; phone: string; relationship: string } | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: Role;
    isActive: boolean;
    createdAt: string;
  };
}

export interface RentRecord {
  id: string;
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  amountDueGHS: number;
  amountPaidGHS: number;
  paidAt: string | null;
  isPaid: boolean;
  isArrears: boolean;
}

export interface Lease {
  id: string;
  leaseNumber: string;
  plotId: string;
  tenantProfileId: string;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  monthlyRentGHS: number;
  depositAmountGHS: number;
  plotCentroidLat: number;
  plotCentroidLng: number;
  tenantSignatureUrl: string | null;
  adminSignatureUrl: string | null;
  signedAt: string | null;
  totalPaidGHS: number;
  arrearsGHS: number;
  lastPaymentDate: string | null;
  notes: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
  plot?: {
    plotNumber: string;
    areaSqm: number;
    property: Pick<Property, 'id' | 'name' | 'address' | 'region'>;
  };
  tenant?: {
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
  };
  rentRecords?: RentRecord[];
}

export interface Transaction {
  id: string;
  leaseId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amountGHS: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  commission?: { amountGHS: number; isPaid: boolean };
}

export interface Document {
  id: string;
  type: DocumentType;
  title: string;
  s3Key: string;
  s3Url: string;
  mimeType: string;
  sizeBytes: number | null;
  plotId: string | null;
  leaseId: string | null;
  createdAt: string;
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
  plot?: { id: string; plotNumber: string; propertyId: string };
  lease?: { id: string; leaseNumber: string };
}

export interface FinanceSummary {
  totalCollectedGHS: number;
  totalArrearsGHS: number;
  totalDepositsGHS: number;
  activeLeases: number;
  paidThisMonth: number;
  unpaidThisMonth: number;
  totalCommissionsGHS: number;
  unpaidCommissionsGHS: number;
}

export interface ArrearsLease {
  id: string;
  leaseNumber: string;
  arrearsGHS: number;
  monthlyRentGHS: number;
  status: LeaseStatus;
  plot: { plotNumber: string; property: { name: string } };
  tenant: { user: { firstName: string; lastName: string; phone: string | null } };
  overdueRecords: { periodYear: number; periodMonth: number; amountDueGHS: number; amountPaidGHS: number }[];
}

export interface AdminStats {
  users?: Record<Role, number>;
  properties: { active: number };
  plots: Partial<Record<PlotStatus, number>>;
  leases: Partial<Record<LeaseStatus, number>>;
  revenue: { thisMonthGHS: number };
  arrears: { totalGHS: number };
  pendingTransactions: number;
  commissionsUnpaidGHS?: number;
}

export interface PlotDetail extends Plot {
  property: Pick<Property, 'id' | 'name' | 'address' | 'region'>;
  leaseAgreements: {
    id: string;
    leaseNumber: string;
    status: LeaseStatus;
    startDate: string;
    endDate: string;
    monthlyRentGHS: number;
    arrearsGHS: number;
    tenant: { user: { firstName: string; lastName: string; phone: string | null } };
  }[];
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
  _count: { leaseAgreements: number; geotaggedPhotos: number };
}

// ─── Satellite ───────────────────────────────────────────────────────────────

export interface SatelliteImage {
  id: string;
  capturedAt: string;
  provider: string;
  tier: number;
  resolution: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  cloudCover: number | null;
  ndvi: number | null;
  changeScore: number | null;
  status: string;
  centerLat: number | null;
  centerLng: number | null;
  createdAt: string;
}

export interface SatelliteHealth {
  tier1: boolean;
  apiKeyPresent: boolean;
}

export interface SatelliteInfo {
  tileUrl: string;
  bbox: [number, number, number, number];
  centerLat: number;
  centerLng: number;
  zoom: number;
}

// ─── Vault ───────────────────────────────────────────────────────────────────

export interface VaultSubscription {
  id: string;
  propertyId: string;
  active: boolean;
  digitalBackup: boolean;
  physicalVault: boolean;
  lastPackGenerated: string | null;
  lastDeliveryConfirmed: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultStatus {
  subscription: VaultSubscription | null;
  lastPackGenerated: string | null;
}

export interface VaultPackResult {
  s3Key: string;
  downloadUrl: string;
  expiresIn: number;
  fileCount: number;
}

// ─── Alerts ────────────────────────────────────────────────────────────────────

export interface GeofenceAlert {
  id: string;
  name: string;
  plotId: string;
  propertyId: string;
  bufferMetres: number;
  isActive: boolean;
  notifyPhones: string[];
  notifyViaWhatsApp: boolean;
  notifyViaSMS: boolean;
  createdAt: string;
  updatedAt: string;
  plot: { plotNumber: string };
  property: { name: string };
  _count: { events: number };
}

export interface AlertEvent {
  id: string;
  eventType: AlertEventType;
  triggeredLat: number;
  triggeredLng: number;
  triggeredAt: string;
  deviceId: string | null;
  notified: boolean;
}

// ─── Survey (GPS data input) ──────────────────────────────────────────────────

export interface ManualSurveyPoint {
  lat: number;
  lng: number;
  elev?: number;
}

export interface ManualPlotInput {
  plotLabel?: string;
  points: ManualSurveyPoint[];
  status?: PlotStatus;
  notes?: string;
}

export type SurveyImportBody =
  | { format: 'GEOJSON'; data: GeoJSON }
  | { format: 'CSV'; data: string }
  | { format: 'MANUAL'; data: ManualPlotInput };

export interface SurveyValidateResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  calculatedAreaM2: number;
}

export interface SurveyPoint {
  id: string;
  propertyId: string;
  sessionId: string;
  pointIndex: number;
  latitude: number;
  longitude: number;
  elevation: number | null;
  accuracy: number | null;
  capturedAt: string;
  label: string | null;
  notes: string | null;
  closed: boolean;
  createdAt: string;
}

export interface SurveySession {
  sessionId: string;
  pointCount: number;
  startedAt: string;
  lastPointAt: string;
}

export interface SurveyImportRecord {
  id: string;
  propertyId: string;
  format: string;
  plotsCreated: number;
  plotIds: string[];
  createdAt: string;
  importedBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

export interface UpdatePropertyBoundaryBody {
  boundaryGeoJSON: GeoJSON;
  totalAreaHa?: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiListResponse<T> extends PaginatedResponse<T> {
  success: boolean;
}

// ─── Access Requests / Impersonation ──────────────────────────────────────────

export type AccessRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ENDED';

export interface OrgAccessRequest {
  id: string;
  organisationId: string;
  requestedById: string;
  reason: string | null;
  requestedScopes: AccessScope[];
  grantedScopes: AccessScope[];
  status: AccessRequestStatus;
  approvedById: string | null;
  expiresAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  endedAt: string | null;
  organisation?: { id: string; name: string; slug: string };
  requestedBy?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'platformRole'> | null;
}

/** Active impersonation session info, returned by /auth/me while a scoped grant is in use. */
export interface ImpersonationSession {
  requestId: string;
  organisation: { id: string; name: string; slug: string } | null;
  grantedScopes: AccessScope[];
  readOnly: boolean;
  expiresAt: string;
}

/** Minimal organisation shape for the staff-side target-org picker. */
export interface OrganisationLite {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}
