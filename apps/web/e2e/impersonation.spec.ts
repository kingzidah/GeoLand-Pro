import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the consent-gated impersonation loop (Phase 4):
 *
 *   platform staff requests access -> org admin narrows scopes and approves
 *   a short-lived grant -> staff enters (banner + scoped sidebar) -> a
 *   mutating call is rejected as read-only, an out-of-scope API call and
 *   route are rejected/redirected -> the grant expires and the UI exits
 *   cleanly -> org admin revokes a second, not-yet-entered request.
 *
 * Seeded accounts (see apps/api/prisma/seed.ts and seed-test-roles.ts):
 *   - staff (platform admin, ORG_IMPERSONATE): superadmin@geolandpro.com
 *   - approver (org admin, accra-residential):  admin@geolandpro.com
 *   - both use the seeded password "Password123!"
 *
 * Idempotency: rows are located by the `reason` text this spec submits
 * (shown in the approver's table) plus organisation/status, so a second run
 * against the same DB shouldn't pick up a previous run's rows. A clean
 * re-seed between runs is still the most reliable option.
 *
 * Note on the expiry step: it triggers IMPERSONATION_EXPIRED via an in-app
 * navigation (sidebar link click), not a page reload. A full reload re-runs
 * AuthContext.tryRestore(), whose own catch-all would additionally clear the
 * staff member's PRIMARY session if /auth/me 401s — a separate, lower-severity
 * behaviour that's intentionally not exercised here (see final report).
 */

const STAFF = { email: 'superadmin@geolandpro.com', password: 'Password123!' };
const APPROVER = { email: 'admin@geolandpro.com', password: 'Password123!' };
const ORG_NAME = 'Accra Residential Estate';
const GRANT_DURATION_MINUTES = 1;

const MAIN_REASON = 'E2E: full impersonation loop';
const REVOKE_REASON = 'E2E: revoke flow';

// Mirrors apps/web/src/utils/format.ts#accessScopeLabel
const SCOPE_LABEL = {
  PLOTS: 'Properties & Plots',
  LEASES: 'Leases',
  TENANTS: 'Tenants',
  FINANCE: 'Finance',
  DOCUMENTS: 'Documents',
} as const;

// The approver narrows the (default) requested scopes down to just these two.
const GRANTED_SCOPE_LABELS = [SCOPE_LABEL.PLOTS, SCOPE_LABEL.LEASES];
const REVOKED_SCOPE_LABELS = [SCOPE_LABEL.TENANTS, SCOPE_LABEL.FINANCE, SCOPE_LABEL.DOCUMENTS];

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('Consent-gated impersonation (Phase 4)', () => {
  test('full access-request loop: create, approve, enter, enforce, expire, revoke', async ({ browser }) => {
    test.setTimeout(180_000);

    const staffContext = await browser.newContext();
    const approverContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    const approverPage = await approverContext.newPage();

    let enteredAt = 0;

    await test.step('staff submits an access request', async () => {
      await login(staffPage, STAFF.email, STAFF.password);
      await staffPage.goto('/access-requests');
      await expect(staffPage.getByRole('heading', { name: 'Request Access' })).toBeVisible();

      await staffPage.getByLabel('Organisation').selectOption({ label: ORG_NAME });
      await staffPage.getByLabel('Reason (optional)').fill(MAIN_REASON);
      await staffPage.getByRole('button', { name: 'Submit request' }).click();

      await expect(staffPage.getByText(/Request submitted/)).toBeVisible();
    });

    await test.step('approver narrows scopes and approves a 1-minute grant', async () => {
      await login(approverPage, APPROVER.email, APPROVER.password);
      await approverPage.goto('/access-requests');
      await expect(approverPage.getByRole('heading', { name: 'Access Requests' })).toBeVisible();

      // Default status filter is PENDING; disambiguate via our reason text in
      // case a previous run left rows behind.
      const row = approverPage.locator('tbody tr').filter({ hasText: MAIN_REASON });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole('button', { name: 'Approve' }).click();

      const dialog = approverPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Approve Access Request' })).toBeVisible();

      for (const label of REVOKED_SCOPE_LABELS) {
        await dialog.locator('label').filter({ hasText: label }).locator('input[type="checkbox"]').uncheck();
      }
      for (const label of GRANTED_SCOPE_LABELS) {
        await expect(
          dialog.locator('label').filter({ hasText: label }).locator('input[type="checkbox"]')
        ).toBeChecked();
      }

      await dialog.locator('#durationMinutes').fill(String(GRANT_DURATION_MINUTES));
      await dialog.getByRole('button', { name: 'Approve' }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step('staff enters - banner shows org + granted scopes, sidebar narrows', async () => {
      await staffPage.goto('/access-requests');

      const row = staffPage
        .locator('tbody tr')
        .filter({ hasText: ORG_NAME })
        .filter({ hasText: 'Approved' })
        .first();
      await expect(row.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 15_000 });
      await row.getByRole('button', { name: 'Enter' }).click();
      enteredAt = Date.now();

      // firstGrantedRoute([PLOTS, LEASES]) -> /properties
      await expect(staffPage).toHaveURL(/\/properties/);

      const banner = staffPage.getByTestId('impersonation-banner');
      await expect(banner).toContainText(`Viewing ${ORG_NAME} — Read-only session`);
      await expect(banner.getByText(SCOPE_LABEL.PLOTS, { exact: true })).toBeVisible();
      await expect(banner.getByText(SCOPE_LABEL.LEASES, { exact: true })).toBeVisible();
      await expect(banner.getByText(/Expires in/)).toBeVisible();

      // Sidebar is narrowed to the granted scopes plus the always-safe Access Requests route.
      const sidebar = staffPage.getByRole('complementary');
      await expect(sidebar.getByRole('link', { name: 'Properties', exact: true })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Leases', exact: true })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Access Requests', exact: true })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'Finance', exact: true })).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'Tenants', exact: true })).toHaveCount(0);
    });

    await test.step('mutating request is rejected as read-only', async () => {
      const list = await staffPage.request.get('/api/v1/properties?limit=1');
      expect(list.status()).toBe(200);
      const { data } = await list.json();
      const propertyId = data[0].id;

      const patch = await staffPage.request.patch(`/api/v1/properties/${propertyId}`, {
        headers: { 'x-impersonation-active': '1' },
        data: { name: 'Should be rejected' },
      });
      expect(patch.status()).toBe(403);
      expect(await patch.text()).toContain('IMPERSONATION_READ_ONLY');
    });

    await test.step('out-of-scope API request is rejected', async () => {
      const res = await staffPage.request.get('/api/v1/tenants');
      expect(res.status()).toBe(403);
      expect(await res.text()).toContain('IMPERSONATION_SCOPE_DENIED');
    });

    await test.step('out-of-scope route redirects client-side to the first granted route', async () => {
      await staffPage.goto('/finance');
      await expect(staffPage).toHaveURL(/\/properties/);
    });

    await test.step('session expiry clears impersonation and returns to Access Requests', async () => {
      const elapsedMs = Date.now() - enteredAt;
      const waitMs = Math.max(0, GRANT_DURATION_MINUTES * 60_000 - elapsedMs) + 5_000;
      await staffPage.waitForTimeout(waitMs);

      // Expiry (step 1 of applyImpersonationEnforcement) is checked on every
      // request regardless of method or scope, so a normal in-scope
      // navigation is enough to trigger IMPERSONATION_EXPIRED.
      await staffPage.getByRole('complementary').getByRole('link', { name: 'Leases', exact: true }).click();

      await expect(staffPage).toHaveURL(/\/access-requests/, { timeout: 15_000 });
      await expect(staffPage.getByTestId('impersonation-banner')).toHaveCount(0);

      // The expiry handler best-effort calls exit(), which clears the
      // impersonation cookie server-side; the list settles once that lands.
      await expect(staffPage.locator('tbody tr').filter({ hasText: ORG_NAME }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('staff submits a second access request', async () => {
      await staffPage.goto('/access-requests');
      await expect(staffPage.getByRole('heading', { name: 'Request Access' })).toBeVisible();

      await staffPage.getByLabel('Organisation').selectOption({ label: ORG_NAME });
      await staffPage.getByLabel('Reason (optional)').fill(REVOKE_REASON);
      await staffPage.getByRole('button', { name: 'Submit request' }).click();

      await expect(staffPage.getByText(/Request submitted/)).toBeVisible();
    });

    await test.step('approver approves then revokes the second request', async () => {
      await approverPage.goto('/access-requests');

      const pendingRow = approverPage.locator('tbody tr').filter({ hasText: REVOKE_REASON });
      await expect(pendingRow).toBeVisible({ timeout: 15_000 });
      await pendingRow.getByRole('button', { name: 'Approve' }).click();

      const approveDialog = approverPage.getByRole('dialog');
      await expect(approveDialog.getByRole('heading', { name: 'Approve Access Request' })).toBeVisible();
      // Defaults (requested scopes, 60 minutes) are fine - this row is never entered.
      await approveDialog.getByRole('button', { name: 'Approve' }).click();
      await expect(approveDialog).toBeHidden();

      // Approved requests drop out of the default PENDING filter.
      await approverPage.locator('select').first().selectOption({ label: 'Approved' });

      const approvedRow = approverPage.locator('tbody tr').filter({ hasText: REVOKE_REASON });
      await expect(approvedRow.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 15_000 });
      await approvedRow.getByRole('button', { name: 'Revoke' }).click();

      const revokeDialog = approverPage.getByRole('dialog');
      await expect(revokeDialog.getByRole('heading', { name: 'Revoke Access' })).toBeVisible();
      await revokeDialog.getByRole('button', { name: 'Revoke' }).click();
      await expect(revokeDialog).toBeHidden();
    });

    await staffContext.close();
    await approverContext.close();
  });
});
