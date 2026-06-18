import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import {
  adminService,
  type AdminDb,
} from './admin.service';
import { ApiError } from '../utils/ApiError';

// ─── Multi-tenancy org-scoping proof for admin service methods ─────────────────
//
// These tests prove the five previously-unscoped admin operations now respect
// organisationId boundaries. They use an in-memory fake database (same pattern
// as impersonationSession.service.test.ts / ImpersonationRedisClient), so no
// real PostgreSQL connection is required.
//
// The key invariant being tested:
//   - Org-A admin → Org-B user  : 404 (ApiError.notFound)
//   - Org-A admin → Org-A user  : succeeds
//   - Platform admin → any org  : succeeds (callerOrganisationId === null)

// ─── Fake in-memory DB ─────────────────────────────────────────────────────────

type DbUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  organisationId: string;
  tenantProfile: null;
  managedProperties: [];
  _count: { auditLogs: number };
};

type DbAuditLog = {
  id: string;
  userId: string;
  userOrg: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: null;
  ipAddress: null;
  createdAt: Date;
};

function createFakeDb(
  users: DbUser[],
  auditLogs: DbAuditLog[] = [],
): AdminDb {
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    user: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        for (const user of userMap.values()) {
          if (user.id !== where['id']) continue;
          // Apply organisationId filter when present (org-scoped callers only)
          if (where['organisationId'] !== undefined && user.organisationId !== where['organisationId']) {
            return null;
          }
          return user;
        }
        return null;
      },

      async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const user = userMap.get(where['id'] as string);
        if (!user) return null;
        Object.assign(user, data);
        return user;
      },
    },

    auditLog: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return auditLogs.filter((log) => {
          // Org filter via nested user.organisationId relation
          const orgFilter = (where['user'] as Record<string, unknown> | undefined)?.['organisationId'];
          if (orgFilter !== undefined && log.userOrg !== orgFilter) return false;
          if (where['userId'] !== undefined && log.userId !== where['userId']) return false;
          return true;
        });
      },

      async count({ where }: { where: Record<string, unknown> }) {
        const results = await (this as AdminDb['auditLog']).findMany({ where });
        return results.length;
      },
    },
  };
}

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: 'user-default',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    role: Role.ADMIN,
    phone: null,
    isActive: true,
    isEmailVerified: true,
    avatarUrl: null,
    lastLoginAt: null,
    createdAt: new Date(),
    organisationId: 'org-a',
    tenantProfile: null,
    managedProperties: [],
    _count: { auditLogs: 0 },
    ...overrides,
  };
}

const userA = makeUser({ id: 'user-a', organisationId: 'org-a', isActive: true, role: Role.ADMIN });
const userB = makeUser({ id: 'user-b', organisationId: 'org-b', isActive: false, role: Role.ADMIN });
const suspendedUserA = makeUser({ id: 'user-a-suspended', organisationId: 'org-a', isActive: false });

async function expectNotFound(fn: () => Promise<unknown>): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ApiError, 'expected ApiError');
    assert.equal((err as ApiError).statusCode, 404);
    return true;
  });
}

// ─── getUserById ───────────────────────────────────────────────────────────────

test('getUserById: org-A caller gets org-A user — success', async () => {
  const db = createFakeDb([userA]);
  const result = await adminService.getUserById('user-a', 'org-a', db);
  assert.equal((result as DbUser).id, 'user-a');
});

test('getUserById: org-A caller → org-B user — 404', async () => {
  const db = createFakeDb([userA, userB]);
  await expectNotFound(() => adminService.getUserById('user-b', 'org-a', db));
});

test('getUserById: platform admin (null org) → org-B user — success', async () => {
  const db = createFakeDb([userA, userB]);
  const result = await adminService.getUserById('user-b', null, db);
  assert.equal((result as DbUser).id, 'user-b');
});

// ─── suspendUser ──────────────────────────────────────────────────────────────

test('suspendUser: org-A caller suspends org-A user — updates isActive', async () => {
  const target = makeUser({ id: 'target-a', organisationId: 'org-a', isActive: true, role: Role.ADMIN });
  const db = createFakeDb([target]);
  await adminService.suspendUser('requester-x', 'target-a', 'org-a', db);
  assert.equal(target.isActive, false);
});

test('suspendUser: org-A caller → org-B user — 404, org-B user not touched', async () => {
  const target = makeUser({ id: 'target-b', organisationId: 'org-b', isActive: true, role: Role.ADMIN });
  const db = createFakeDb([target]);
  await expectNotFound(() => adminService.suspendUser('requester-x', 'target-b', 'org-a', db));
  // Confirm no mutation occurred
  assert.equal(target.isActive, true);
});

test('suspendUser: platform admin → org-B user — succeeds', async () => {
  const target = makeUser({ id: 'target-b', organisationId: 'org-b', isActive: true, role: Role.ADMIN });
  const db = createFakeDb([target]);
  await adminService.suspendUser('platform-user', 'target-b', null, db);
  assert.equal(target.isActive, false);
});

// ─── activateUser ─────────────────────────────────────────────────────────────

test('activateUser: org-A caller activates org-A suspended user — success', async () => {
  const target = makeUser({ id: 'sus-a', organisationId: 'org-a', isActive: false, role: Role.ADMIN });
  const db = createFakeDb([target]);
  await adminService.activateUser('requester-x', 'sus-a', 'org-a', db);
  assert.equal(target.isActive, true);
});

test('activateUser: org-A caller → org-B suspended user — 404', async () => {
  const db = createFakeDb([suspendedUserA, userB]);
  await expectNotFound(() => adminService.activateUser('requester-x', 'user-b', 'org-a', db));
});

test('activateUser: platform admin → org-B suspended user — succeeds', async () => {
  const target = makeUser({ id: 'sus-b', organisationId: 'org-b', isActive: false });
  const db = createFakeDb([target]);
  await adminService.activateUser('platform-user', 'sus-b', null, db);
  assert.equal(target.isActive, true);
});

// ─── changeRole ───────────────────────────────────────────────────────────────

test('changeRole: org-A caller changes role of org-A user — success', async () => {
  const target = makeUser({ id: 'target-role-a', organisationId: 'org-a', role: Role.ADMIN });
  const db = createFakeDb([target]);
  await adminService.changeRole('requester-x', 'target-role-a', { role: Role.MANAGER }, 'org-a', db);
  assert.equal(target.role, Role.MANAGER);
});

test('changeRole: org-A caller → org-B user — 404', async () => {
  const target = makeUser({ id: 'target-role-b', organisationId: 'org-b', role: Role.ADMIN });
  const db = createFakeDb([target]);
  await expectNotFound(() =>
    adminService.changeRole('requester-x', 'target-role-b', { role: Role.MANAGER }, 'org-a', db),
  );
  // Role not changed
  assert.equal(target.role, Role.ADMIN);
});

test('changeRole: platform admin → org-B user — succeeds', async () => {
  const target = makeUser({ id: 'cross-org-target', organisationId: 'org-b', role: Role.ADMIN });
  const db = createFakeDb([target]);
  await adminService.changeRole('platform-user', 'cross-org-target', { role: Role.MANAGER }, null, db);
  assert.equal(target.role, Role.MANAGER);
});

// ─── listAuditLogs ────────────────────────────────────────────────────────────

const logsOrgA: DbAuditLog[] = [
  { id: 'log-a1', userId: 'u1', userOrg: 'org-a', action: 'CREATE', entityType: 'Plot', entityId: 'p1', metadata: null, ipAddress: null, createdAt: new Date() },
  { id: 'log-a2', userId: 'u1', userOrg: 'org-a', action: 'UPDATE', entityType: 'Plot', entityId: 'p2', metadata: null, ipAddress: null, createdAt: new Date() },
];
const logsOrgB: DbAuditLog[] = [
  { id: 'log-b1', userId: 'u2', userOrg: 'org-b', action: 'CREATE', entityType: 'Lease', entityId: 'l1', metadata: null, ipAddress: null, createdAt: new Date() },
];

const allLogs = [...logsOrgA, ...logsOrgB];
const baseQuery = { page: 1, limit: 50 };

test('listAuditLogs: org-A caller sees only org-A logs', async () => {
  const db = createFakeDb([], allLogs);
  const result = await adminService.listAuditLogs(baseQuery, 'org-a', db);
  assert.equal(result.data.length, 2);
  for (const log of result.data) {
    assert.equal((log as DbAuditLog).userOrg, 'org-a');
  }
});

test('listAuditLogs: org-A caller does NOT see org-B logs', async () => {
  const db = createFakeDb([], allLogs);
  const result = await adminService.listAuditLogs(baseQuery, 'org-a', db);
  const ids = result.data.map((l) => (l as DbAuditLog).id);
  assert.ok(!ids.includes('log-b1'), 'org-B log must not appear in org-A results');
});

test('listAuditLogs: platform admin (null) sees all logs', async () => {
  const db = createFakeDb([], allLogs);
  const result = await adminService.listAuditLogs(baseQuery, null, db);
  assert.equal(result.data.length, 3);
});

test('listAuditLogs: org-A caller + userId filter stays scoped to org-A', async () => {
  // Even if the requested userId belongs to org-B, org-A caller sees nothing
  const db = createFakeDb([], allLogs);
  const result = await adminService.listAuditLogs({ ...baseQuery, userId: 'u2' }, 'org-a', db);
  assert.equal(result.data.length, 0);
});

test('listAuditLogs: meta totals are consistent with org scoping', async () => {
  const db = createFakeDb([], allLogs);
  const result = await adminService.listAuditLogs(baseQuery, 'org-a', db);
  assert.equal(result.meta.total, result.data.length);
});
