# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: impersonation.spec.ts >> Consent-gated impersonation (Phase 4) >> full access-request loop: create, approve, enter, enforce, expire, revoke
- Location: e2e\impersonation.spec.ts:59:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/access-requests/
Received string:  "http://localhost:5173/leases"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    33 × unexpected value "http://localhost:5173/leases"

```

```yaml
- img
- text: Viewing Accra Residential Estate — Read-only session Properties & Plots Leases
- img
- text: Session expired
- button "Exit session":
  - img
  - text: Exit session
- complementary:
  - img
  - text: GeoLand Pro
  - navigation:
    - link "Properties":
      - /url: /properties
      - img
      - text: Properties
    - link "Leases":
      - /url: /leases
      - img
      - text: Leases
    - link "Access Requests":
      - /url: /access-requests
      - img
      - text: Access Requests
  - paragraph: Super Admin
  - paragraph: superadmin@geolandpro.com
  - button "Sign out":
    - img
    - text: Sign out
- main:
  - heading "Leases" [level=1]
  - paragraph: 1 lease agreements
  - button:
    - img
  - text: SA Super Admin
  - button "All"
  - button "Active"
  - button "Pending"
  - button "Expired"
  - button "Terminated"
  - table:
    - rowgroup:
      - 'row "Lease # Tenant Property / Plot Status Monthly Rent Arrears Expires Actions"':
        - 'columnheader "Lease #"'
        - columnheader "Tenant"
        - columnheader "Property / Plot"
        - columnheader "Status"
        - columnheader "Monthly Rent"
        - columnheader "Arrears"
        - columnheader "Expires"
        - columnheader "Actions"
    - rowgroup:
      - row "LEASE-2026-0001 John Tenant Accra Residential Estate / PLT-003 Pending Signature GHS 155,555.00 — 10 Jul 2026 View":
        - cell "LEASE-2026-0001"
        - cell "John Tenant"
        - cell "Accra Residential Estate / PLT-003"
        - cell "Pending Signature"
        - cell "GHS 155,555.00"
        - cell "—"
        - cell "10 Jul 2026"
        - cell "View":
          - text: View
          - img
```

# Test source

```ts
  75  |       await staffPage.getByLabel('Reason (optional)').fill(MAIN_REASON);
  76  |       await staffPage.getByRole('button', { name: 'Submit request' }).click();
  77  | 
  78  |       await expect(staffPage.getByText(/Request submitted/)).toBeVisible();
  79  |     });
  80  | 
  81  |     await test.step('approver narrows scopes and approves a 1-minute grant', async () => {
  82  |       await login(approverPage, APPROVER.email, APPROVER.password);
  83  |       await approverPage.goto('/access-requests');
  84  |       await expect(approverPage.getByRole('heading', { name: 'Access Requests' })).toBeVisible();
  85  | 
  86  |       // Default status filter is PENDING; disambiguate via our reason text in
  87  |       // case a previous run left rows behind.
  88  |       const row = approverPage.locator('tbody tr').filter({ hasText: MAIN_REASON });
  89  |       await expect(row).toBeVisible({ timeout: 15_000 });
  90  |       await row.getByRole('button', { name: 'Approve' }).click();
  91  | 
  92  |       const dialog = approverPage.getByRole('dialog');
  93  |       await expect(dialog.getByRole('heading', { name: 'Approve Access Request' })).toBeVisible();
  94  | 
  95  |       for (const label of REVOKED_SCOPE_LABELS) {
  96  |         await dialog.locator('label').filter({ hasText: label }).locator('input[type="checkbox"]').uncheck();
  97  |       }
  98  |       for (const label of GRANTED_SCOPE_LABELS) {
  99  |         await expect(
  100 |           dialog.locator('label').filter({ hasText: label }).locator('input[type="checkbox"]')
  101 |         ).toBeChecked();
  102 |       }
  103 | 
  104 |       await dialog.locator('#durationMinutes').fill(String(GRANT_DURATION_MINUTES));
  105 |       await dialog.getByRole('button', { name: 'Approve' }).click();
  106 |       await expect(dialog).toBeHidden();
  107 |     });
  108 | 
  109 |     await test.step('staff enters - banner shows org + granted scopes, sidebar narrows', async () => {
  110 |       await staffPage.goto('/access-requests');
  111 | 
  112 |       const row = staffPage
  113 |         .locator('tbody tr')
  114 |         .filter({ hasText: ORG_NAME })
  115 |         .filter({ hasText: 'Approved' })
  116 |         .first();
  117 |       await expect(row.getByRole('button', { name: 'Enter' })).toBeVisible({ timeout: 15_000 });
  118 |       await row.getByRole('button', { name: 'Enter' }).click();
  119 |       enteredAt = Date.now();
  120 | 
  121 |       // firstGrantedRoute([PLOTS, LEASES]) -> /properties
  122 |       await expect(staffPage).toHaveURL(/\/properties/);
  123 | 
  124 |       const banner = staffPage.getByTestId('impersonation-banner');
  125 |       await expect(banner).toContainText(`Viewing ${ORG_NAME} — Read-only session`);
  126 |       await expect(banner.getByText(SCOPE_LABEL.PLOTS, { exact: true })).toBeVisible();
  127 |       await expect(banner.getByText(SCOPE_LABEL.LEASES, { exact: true })).toBeVisible();
  128 |       await expect(banner.getByText(/Expires in/)).toBeVisible();
  129 | 
  130 |       // Sidebar is narrowed to the granted scopes plus the always-safe Access Requests route.
  131 |       const sidebar = staffPage.getByRole('complementary');
  132 |       await expect(sidebar.getByRole('link', { name: 'Properties', exact: true })).toBeVisible();
  133 |       await expect(sidebar.getByRole('link', { name: 'Leases', exact: true })).toBeVisible();
  134 |       await expect(sidebar.getByRole('link', { name: 'Access Requests', exact: true })).toBeVisible();
  135 |       await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  136 |       await expect(sidebar.getByRole('link', { name: 'Finance', exact: true })).toHaveCount(0);
  137 |       await expect(sidebar.getByRole('link', { name: 'Tenants', exact: true })).toHaveCount(0);
  138 |     });
  139 | 
  140 |     await test.step('mutating request is rejected as read-only', async () => {
  141 |       const list = await staffPage.request.get('/api/v1/properties?limit=1');
  142 |       expect(list.status()).toBe(200);
  143 |       const { data } = await list.json();
  144 |       const propertyId = data[0].id;
  145 | 
  146 |       const patch = await staffPage.request.patch(`/api/v1/properties/${propertyId}`, {
  147 |         headers: { 'x-impersonation-active': '1' },
  148 |         data: { name: 'Should be rejected' },
  149 |       });
  150 |       expect(patch.status()).toBe(403);
  151 |       expect(await patch.text()).toContain('IMPERSONATION_READ_ONLY');
  152 |     });
  153 | 
  154 |     await test.step('out-of-scope API request is rejected', async () => {
  155 |       const res = await staffPage.request.get('/api/v1/tenants');
  156 |       expect(res.status()).toBe(403);
  157 |       expect(await res.text()).toContain('IMPERSONATION_SCOPE_DENIED');
  158 |     });
  159 | 
  160 |     await test.step('out-of-scope route redirects client-side to the first granted route', async () => {
  161 |       await staffPage.goto('/finance');
  162 |       await expect(staffPage).toHaveURL(/\/properties/);
  163 |     });
  164 | 
  165 |     await test.step('session expiry clears impersonation and returns to Access Requests', async () => {
  166 |       const elapsedMs = Date.now() - enteredAt;
  167 |       const waitMs = Math.max(0, GRANT_DURATION_MINUTES * 60_000 - elapsedMs) + 5_000;
  168 |       await staffPage.waitForTimeout(waitMs);
  169 | 
  170 |       // Expiry (step 1 of applyImpersonationEnforcement) is checked on every
  171 |       // request regardless of method or scope, so a normal in-scope
  172 |       // navigation is enough to trigger IMPERSONATION_EXPIRED.
  173 |       await staffPage.getByRole('complementary').getByRole('link', { name: 'Leases', exact: true }).click();
  174 | 
> 175 |       await expect(staffPage).toHaveURL(/\/access-requests/, { timeout: 15_000 });
      |                               ^ Error: expect(page).toHaveURL(expected) failed
  176 |       await expect(staffPage.getByTestId('impersonation-banner')).toHaveCount(0);
  177 | 
  178 |       // The expiry handler best-effort calls exit(), which clears the
  179 |       // impersonation cookie server-side; the list settles once that lands.
  180 |       await expect(staffPage.locator('tbody tr').filter({ hasText: ORG_NAME }).first()).toBeVisible({
  181 |         timeout: 15_000,
  182 |       });
  183 |     });
  184 | 
  185 |     await test.step('staff submits a second access request', async () => {
  186 |       await staffPage.goto('/access-requests');
  187 |       await expect(staffPage.getByRole('heading', { name: 'Request Access' })).toBeVisible();
  188 | 
  189 |       await staffPage.getByLabel('Organisation').selectOption({ label: ORG_NAME });
  190 |       await staffPage.getByLabel('Reason (optional)').fill(REVOKE_REASON);
  191 |       await staffPage.getByRole('button', { name: 'Submit request' }).click();
  192 | 
  193 |       await expect(staffPage.getByText(/Request submitted/)).toBeVisible();
  194 |     });
  195 | 
  196 |     await test.step('approver approves then revokes the second request', async () => {
  197 |       await approverPage.goto('/access-requests');
  198 | 
  199 |       const pendingRow = approverPage.locator('tbody tr').filter({ hasText: REVOKE_REASON });
  200 |       await expect(pendingRow).toBeVisible({ timeout: 15_000 });
  201 |       await pendingRow.getByRole('button', { name: 'Approve' }).click();
  202 | 
  203 |       const approveDialog = approverPage.getByRole('dialog');
  204 |       await expect(approveDialog.getByRole('heading', { name: 'Approve Access Request' })).toBeVisible();
  205 |       // Defaults (requested scopes, 60 minutes) are fine - this row is never entered.
  206 |       await approveDialog.getByRole('button', { name: 'Approve' }).click();
  207 |       await expect(approveDialog).toBeHidden();
  208 | 
  209 |       // Approved requests drop out of the default PENDING filter.
  210 |       await approverPage.locator('select').first().selectOption({ label: 'Approved' });
  211 | 
  212 |       const approvedRow = approverPage.locator('tbody tr').filter({ hasText: REVOKE_REASON });
  213 |       await expect(approvedRow.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 15_000 });
  214 |       await approvedRow.getByRole('button', { name: 'Revoke' }).click();
  215 | 
  216 |       const revokeDialog = approverPage.getByRole('dialog');
  217 |       await expect(revokeDialog.getByRole('heading', { name: 'Revoke Access' })).toBeVisible();
  218 |       await revokeDialog.getByRole('button', { name: 'Revoke' }).click();
  219 |       await expect(revokeDialog).toBeHidden();
  220 |     });
  221 | 
  222 |     await staffContext.close();
  223 |     await approverContext.close();
  224 |   });
  225 | });
  226 | 
```