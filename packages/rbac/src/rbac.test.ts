import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Role,
  Capability,
  can,
  canAny,
  ROLE_CAPABILITIES,
  isPlatformAdmin,
  shellForRole,
  AppShell,
  PlatformRole,
  PlatformCapability,
  PLATFORM_CAPABILITIES,
  canPlatform,
  canAnyPlatform,
} from './rbac';

test('Field Surveyor has no lease, tenant, finance, document, satellite, vault, team or dashboard access', () => {
  const denied: Capability[] = [
    Capability.DASHBOARD_VIEW_FULL,
    Capability.TENANT_MANAGE,
    Capability.LEASE_MANAGE,
    Capability.LEASE_VIEW_OWN,
    Capability.PAYMENT_MANAGE,
    Capability.FINANCE_DASHBOARD_FULL,
    Capability.FINANCE_DASHBOARD_VIEW,
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.DOCUMENT_GENERATE_RECEIPTS,
    Capability.DOCUMENT_VIEW_OWN,
    Capability.SATELLITE_MANAGE,
    Capability.SATELLITE_VIEW,
    Capability.VAULT_MANAGE,
    Capability.TEAM_MANAGE,
    Capability.ORG_SETTINGS,
    Capability.ALERT_MANAGE,
  ];

  for (const capability of denied) {
    assert.equal(can(Role.FIELD_SURVEYOR, capability), false, `FIELD_SURVEYOR should not have ${capability}`);
  }
});

test('Field Surveyor retains exactly its survey/map/alert-view capabilities', () => {
  const granted: Capability[] = [
    Capability.PLOT_VIEW,
    Capability.PLOT_CREATE_EDIT,
    Capability.MAP_VIEW_FULL,
    Capability.SURVEY_IMPORT,
    Capability.ALERT_VIEW,
  ];

  for (const capability of granted) {
    assert.equal(can(Role.FIELD_SURVEYOR, capability), true, `FIELD_SURVEYOR should have ${capability}`);
  }

  assert.equal(ROLE_CAPABILITIES[Role.FIELD_SURVEYOR].size, granted.length);
});

test('Manager finance access is VIEW-only, not the full finance dashboard', () => {
  assert.equal(can(Role.MANAGER, Capability.FINANCE_DASHBOARD_VIEW), true);
  assert.equal(can(Role.MANAGER, Capability.FINANCE_DASHBOARD_FULL), false);
  assert.equal(can(Role.MANAGER, Capability.FINANCE_COMMISSION_SETTLE), false);
});

test('Manager can manage day-to-day payments but cannot override payment status', () => {
  assert.equal(can(Role.MANAGER, Capability.PAYMENT_MANAGE), true);
  assert.equal(can(Role.MANAGER, Capability.PAYMENT_STATUS_OVERRIDE), false);
});

test('Manager document generation is limited to receipts + demand letters', () => {
  assert.equal(can(Role.MANAGER, Capability.DOCUMENT_GENERATE_RECEIPTS), true);
  assert.equal(can(Role.MANAGER, Capability.DOCUMENT_GENERATE_ALL), false);
});

test('Manager satellite access is view-only and cannot order captures', () => {
  assert.equal(can(Role.MANAGER, Capability.SATELLITE_VIEW), true);
  assert.equal(can(Role.MANAGER, Capability.SATELLITE_MANAGE), false);
});

test('Manager cannot terminate leases, delete properties, or manage the vault/team', () => {
  assert.equal(can(Role.MANAGER, Capability.LEASE_MANAGE), true);
  assert.equal(can(Role.MANAGER, Capability.LEASE_TERMINATE), false);
  assert.equal(can(Role.MANAGER, Capability.PROPERTY_CREATE_DELETE), false);
  assert.equal(can(Role.MANAGER, Capability.PROPERTY_EDIT), false);
  assert.equal(can(Role.MANAGER, Capability.VAULT_MANAGE), false);
  assert.equal(can(Role.MANAGER, Capability.TEAM_MANAGE), false);
});

test('Admin can edit properties and manage leases/payments but cannot delete properties or manage the team', () => {
  assert.equal(can(Role.ADMIN, Capability.PROPERTY_EDIT), true);
  assert.equal(can(Role.ADMIN, Capability.PROPERTY_CREATE_DELETE), false);
  assert.equal(can(Role.ADMIN, Capability.LEASE_TERMINATE), true);
  assert.equal(can(Role.ADMIN, Capability.PAYMENT_STATUS_OVERRIDE), true);
  assert.equal(can(Role.ADMIN, Capability.TEAM_MANAGE), false);
  assert.equal(can(Role.ADMIN, Capability.ORG_SETTINGS), false);
  assert.equal(can(Role.ADMIN, Capability.FINANCE_COMMISSION_SETTLE), false);
});

test('Only Super Admin can delete properties, settle commissions, and manage the team/org settings', () => {
  for (const capability of [
    Capability.PROPERTY_CREATE_DELETE,
    Capability.FINANCE_COMMISSION_SETTLE,
    Capability.TEAM_MANAGE,
    Capability.ORG_SETTINGS,
  ] as const) {
    assert.equal(can(Role.SUPER_ADMIN, capability), true);
    for (const role of [Role.ADMIN, Role.MANAGER, Role.FIELD_SURVEYOR, Role.TENANT]) {
      assert.equal(can(role, capability), false, `${role} should not have ${capability}`);
    }
  }
});

test('Tenant is restricted to OWN-scoped capabilities', () => {
  const granted: Capability[] = [
    Capability.DASHBOARD_VIEW_OWN,
    Capability.PLOT_VIEW_OWN,
    Capability.TENANT_VIEW_OWN,
    Capability.LEASE_VIEW_OWN,
    Capability.PAYMENT_VIEW_OWN,
    Capability.DOCUMENT_VIEW_OWN,
    Capability.MAP_VIEW_OWN_PLOT,
    Capability.PROFILE_EDIT_OWN,
    Capability.COMPLAINT_SUBMIT,
  ];

  for (const capability of granted) {
    assert.equal(can(Role.TENANT, capability), true, `TENANT should have ${capability}`);
  }
  assert.equal(ROLE_CAPABILITIES[Role.TENANT].size, granted.length);

  assert.equal(can(Role.TENANT, Capability.LEASE_MANAGE), false);
  assert.equal(can(Role.TENANT, Capability.PLOT_VIEW), false);
  assert.equal(can(Role.TENANT, Capability.DOCUMENT_GENERATE_ALL), false);
});

test('canAny matches if the role holds at least one of the listed capabilities', () => {
  assert.equal(canAny(Role.TENANT, [Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN]), true);
  assert.equal(canAny(Role.FIELD_SURVEYOR, [Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN]), false);
});

test('isPlatformAdmin is a strict boolean check', () => {
  assert.equal(isPlatformAdmin({ isPlatformAdmin: true }), true);
  assert.equal(isPlatformAdmin({ isPlatformAdmin: false }), false);
  assert.equal(isPlatformAdmin({}), false);
  assert.equal(isPlatformAdmin(null), false);
  assert.equal(isPlatformAdmin(undefined), false);
});

test('shellForRole routes platform admins, tenants, and org staff to the right shell', () => {
  assert.equal(shellForRole(Role.ADMIN, true), AppShell.MASTER_CONTROL);
  assert.equal(shellForRole(Role.TENANT, false), AppShell.TENANT_PORTAL);
  assert.equal(shellForRole(Role.MANAGER, false), AppShell.ORG);
  assert.equal(shellForRole(Role.FIELD_SURVEYOR, false), AppShell.ORG);
});

test('canPlatform and canAnyPlatform deny non-platform users (null/undefined platformRole)', () => {
  assert.equal(canPlatform(null, PlatformCapability.ORG_VIEW), false);
  assert.equal(canPlatform(undefined, PlatformCapability.ORG_VIEW), false);
  assert.equal(canAnyPlatform(null, [PlatformCapability.ORG_VIEW, PlatformCapability.AUDIT_VIEW]), false);
});

test('Technical Director has every platform capability', () => {
  for (const capability of Object.values(PlatformCapability)) {
    assert.equal(canPlatform(PlatformRole.TECHNICAL_DIRECTOR, capability), true, `TD should have ${capability}`);
  }
  assert.equal(PLATFORM_CAPABILITIES[PlatformRole.TECHNICAL_DIRECTOR].size, Object.values(PlatformCapability).length);
});

test('Managing Director lacks raw health detail, audit export, and settings management (brand/maintenance)', () => {
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.HEALTH_VIEW_SUMMARY), true);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.HEALTH_VIEW_DETAIL), false);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.AUDIT_VIEW), true);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.AUDIT_EXPORT), false);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.SETTINGS_VIEW), true);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.SETTINGS_MANAGE), false);
  // TD and MD can both create organisations and manage existing ones (edit/suspend/reinstate)
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.ORG_CREATE), true);
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.ORG_MANAGE), true);
  assert.equal(canPlatform(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.ORG_CREATE), true);
  assert.equal(canPlatform(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.ORG_MANAGE), true);
  // Two-founder org delete: both TD and MD hold ORG_DELETE
  assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.ORG_DELETE), true);
  assert.equal(canPlatform(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.ORG_DELETE), true);
});

test('Managing Director holds all seven module VIEW capabilities', () => {
  const viewCapabilities: PlatformCapability[] = [
    PlatformCapability.ORG_VIEW,
    PlatformCapability.REVENUE_VIEW,
    PlatformCapability.HEALTH_VIEW_SUMMARY,
    PlatformCapability.ONBOARDING_VIEW,
    PlatformCapability.AUDIT_VIEW,
    PlatformCapability.SUPPORT_VIEW,
    PlatformCapability.SETTINGS_VIEW,
  ];
  for (const capability of viewCapabilities) {
    assert.equal(canPlatform(PlatformRole.MANAGING_DIRECTOR, capability), true, `MANAGING_DIRECTOR should have ${capability}`);
  }
});

test('Finance Controller manages revenue but cannot manage orgs, impersonate, or touch settings', () => {
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_VIEW), true);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_MANAGE), true);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_CREATE), false);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_MANAGE), false);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_DELETE), false);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_IMPERSONATE), false);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SETTINGS_VIEW), false);
  assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SETTINGS_MANAGE), false);
});

test('Finance Controller capability set is pinned exactly (no drift)', () => {
  const granted: PlatformCapability[] = [
    PlatformCapability.ORG_VIEW,
    PlatformCapability.REVENUE_VIEW,
    PlatformCapability.REVENUE_MANAGE,
  ];
  for (const capability of granted) {
    assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, capability), true, `FINANCE_CONTROLLER should have ${capability}`);
  }
  assert.equal(PLATFORM_CAPABILITIES[PlatformRole.FINANCE_CONTROLLER].size, granted.length);

  // FIN must not see Health, Onboarding, Audit, Support, or Settings modules at all
  const denied: PlatformCapability[] = [
    PlatformCapability.ORG_CREATE,
    PlatformCapability.ORG_MANAGE,
    PlatformCapability.HEALTH_VIEW_SUMMARY,
    PlatformCapability.HEALTH_VIEW_DETAIL,
    PlatformCapability.ONBOARDING_VIEW,
    PlatformCapability.ONBOARDING_MANAGE,
    PlatformCapability.AUDIT_VIEW,
    PlatformCapability.AUDIT_EXPORT,
    PlatformCapability.SUPPORT_VIEW,
    PlatformCapability.SUPPORT_MANAGE,
    PlatformCapability.SETTINGS_VIEW,
    PlatformCapability.SETTINGS_MANAGE,
    PlatformCapability.ORG_IMPERSONATE,
  ];
  for (const capability of denied) {
    assert.equal(canPlatform(PlatformRole.FINANCE_CONTROLLER, capability), false, `FINANCE_CONTROLLER should not have ${capability}`);
  }
});

test('Operations Lead can create organisations and impersonate-for-support, but cannot manage/delete existing orgs or touch revenue/health/audit/settings', () => {
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_CREATE), true);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_MANAGE), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_IMPERSONATE), true);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_DELETE), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.REVENUE_VIEW), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.HEALTH_VIEW_SUMMARY), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.HEALTH_VIEW_DETAIL), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.AUDIT_VIEW), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.SETTINGS_VIEW), false);
  assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, PlatformCapability.SETTINGS_MANAGE), false);
});

test('Operations Lead capability set is pinned exactly (no drift)', () => {
  const granted: PlatformCapability[] = [
    PlatformCapability.ORG_VIEW,
    PlatformCapability.ORG_CREATE,
    PlatformCapability.ORG_IMPERSONATE,
    PlatformCapability.ONBOARDING_VIEW,
    PlatformCapability.ONBOARDING_MANAGE,
    PlatformCapability.SUPPORT_VIEW,
    PlatformCapability.SUPPORT_MANAGE,
  ];
  for (const capability of granted) {
    assert.equal(canPlatform(PlatformRole.OPERATIONS_LEAD, capability), true, `OPERATIONS_LEAD should have ${capability}`);
  }
  assert.equal(PLATFORM_CAPABILITIES[PlatformRole.OPERATIONS_LEAD].size, granted.length);
});

test('Board Observer has read-only visibility into client list and revenue only', () => {
  const granted: PlatformCapability[] = [PlatformCapability.ORG_VIEW, PlatformCapability.REVENUE_VIEW];
  for (const capability of granted) {
    assert.equal(canPlatform(PlatformRole.BOARD_OBSERVER, capability), true, `BOARD_OBSERVER should have ${capability}`);
  }
  assert.equal(PLATFORM_CAPABILITIES[PlatformRole.BOARD_OBSERVER].size, granted.length);

  for (const capability of Object.values(PlatformCapability)) {
    if (!granted.includes(capability)) {
      assert.equal(canPlatform(PlatformRole.BOARD_OBSERVER, capability), false, `BOARD_OBSERVER should not have ${capability}`);
    }
  }
});
