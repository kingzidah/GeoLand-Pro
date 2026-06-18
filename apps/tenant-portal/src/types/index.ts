// ─── Enums (mirror Prisma enums) ──────────────────────────────────────────────

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FIELD_SURVEYOR' | 'TENANT';
// Master Control (Layer 1) roles — always null in the tenant portal.
export type PlatformRole =
  | 'TECHNICAL_DIRECTOR'
  | 'MANAGING_DIRECTOR'
  | 'FINANCE_CONTROLLER'
  | 'OPERATIONS_LEAD'
  | 'BOARD_OBSERVER';
export type LeaseStatus = 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
export type DocumentType = 'BOUNDARY_CERTIFICATE' | 'TENANCY_AGREEMENT' | 'RENT_RECEIPT' | 'ARREARS_NOTICE';
export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';
export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

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
    property: { id: string; name: string; address: string; region: string };
  };
  tenant?: {
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
  };
  rentRecords?: RentRecord[];
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

export interface Notification {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  recipient: string;
  subject: string | null;
  body: string;
  externalId: string | null;
  sentAt: string | null;
  failureReason: string | null;
  retryCount: number;
  leaseId: string | null;
  createdAt: string;
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
