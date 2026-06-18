# Phase 0 Answers — proceed to Phase 1

Good findings report. Here are my answers to all 5 open questions.
Act on these now and proceed through the phases.

---

## Q1 — Auth/cookie migration (Rule #3)

**Defer it. Do NOT touch auth storage in this retrofit.**

The repo currently uses Bearer token in-memory + refreshToken in localStorage.
Migrating to httpOnly cookies is a separate sprint — it touches API token
issuance, CORS config, both frontends' axios interceptors, and the refresh
flow. That is too risky to do silently alongside a nav/routing/API gating
rewrite.

**For this retrofit only:** read role from the existing `AuthContext` /
`authApi.getMe()` result exactly as the apps do today. The capability gating
layers on top of whatever auth mechanism is already in place.

**Flag it:** add a single `// TODO SECURITY: migrate to httpOnly cookies
(Sprint security hardening)` comment in `authenticate.ts` and in each
frontend `AuthContext.tsx`. That is the only change to auth files.
Do not refactor the token flow.

---

## Q2 — Satellite nav (keep /map panel or restore standalone item?)

**Keep the just-shipped /map panel design. Do NOT restore a standalone
Satellite sidebar item.**

FIX 2 was a deliberate product decision made this session. The brief's
sidebar list is wrong on this point — the brief predates FIX 2.
The correct per-role satellite access is enforced as a **capability gate
on the satellite panel inside /map**, not as a separate route.

Specifically:
- Super Admin + Admin: see the full satellite panel (order captures, history,
  change detection).
- Manager: see the satellite panel in VIEW-only mode (no order button).
- Field Surveyor + Tenant: satellite panel is hidden entirely inside /map.

Use `CapabilityGate` around the satellite panel component in the map page.
No `/satellite` route needed.

---

## Q3 — Admin properties delete affordance

**Prose wins. Admin = create/edit only, no delete.**

The table in Section 3 has a typo (✓ for create/delete). The authoritative
rule is: only Super Admin can delete properties. Admin sees create/edit
affordances only.

In practice:
- Hide the delete button/action for Admin on the Properties page
  (`CapabilityGate requires={Capability.PROPERTY_CREATE_DELETE}`).
- The API `DELETE /properties/:id` route already needs
  `requireRole(Role.SUPER_ADMIN)` (not just ADMIN).

---

## Q4 — Tenant Portal nav gaps

**Yes, add the missing items and keep Notifications for now.**

Make these changes to `apps/tenant-portal` Sidebar/nav:
1. Add **"My Plot"** → `/me/plot` (requires `MAP_VIEW_OWN_PLOT` capability).
2. Add **"My Payments"** → `/me/payments` (requires `PAYMENT_VIEW_OWN`).
3. Keep **"Notifications"** where it is — do not remove it.
4. Fix the hardcoded `"GeoLand Pro"` string — replace with `brand.name`
   imported from `apps/api/src/config/brand.config.ts`. If a frontend copy
   doesn't exist yet, create a minimal
   `apps/tenant-portal/src/config/brand.config.ts` that re-exports the same
   values. Do the same for `apps/web` if it also hardcodes the name.

---

## Q5 — Shared matrix module location

**Yes, create `packages/rbac` as a new workspace member.**

The `packages/*` glob is already in root `package.json` workspaces.
The directory just doesn't exist yet. Create it:

```
packages/rbac/
  package.json     (name: "@geolandpro/rbac", private: true, main: "src/index.ts")
  src/
    index.ts       (re-exports everything from rbac.ts)
    rbac.ts        (the matrix — Role, Capability, ROLE_CAPABILITIES, can, canAny,
                    isPlatformAdmin, shellForRole, AppShell)
```

Import as `@geolandpro/rbac` in all three apps. This replaces:
- The 3× duplicated `ROLE_RANK` maps in `apps/api/src/middleware/authorize.ts`,
  `apps/web/src/auth/ProtectedRoute.tsx`, and `apps/web/src/utils/role.ts`.
- The future capability checks you are about to add.

After creating the package, delete the three duplicate `ROLE_RANK` maps and
replace with imports from `@geolandpro/rbac`. Do this as the very first commit
of Phase 1 so everything that follows imports from one place.

---

## Summary — proceed in this order

1. **Phase 1 first commit:** create `packages/rbac`, delete the 3× `ROLE_RANK`
   duplicates, wire imports. Run existing tests to confirm nothing broke.
2. **Phase 1 second commit:** add unit tests asserting the matrix rules
   (surveyor !leases, manager finance VIEW-only, admin !team, etc.).
3. **Phase 2:** wire `requireCapability` onto the 17 API routers per the
   matrix. Fix the 6 specific mismatches you found:
   - `GET /leases` + `GET /documents` must block `FIELD_SURVEYOR` → 403.
   - Document-generation routes restrict Manager to receipts + demand-letter only.
   - Satellite `/order` blocks Manager (VIEW only).
   - Alert GET must allow `FIELD_SURVEYOR` (VIEW).
   - Plot `GET /:plotId` must allow Tenant (OWN — enforce by `req.user.id` in handler).
   - `/platform/*` must return **404** (not 403) for non-platform-admins.
4. **Phase 3:** `/auth/me` already exists — confirm it returns
   `{ id, role, organisationId, isPlatformAdmin, displayName, email }`.
   If any field is missing, add it. No other auth changes.
5. **Phase 4:** frontend gating — capability-driven nav, RouteGuard, Sidebar,
   Tenant Portal additions from Q4.
6. **Phase 5:** OWN/assigned-only query scoping.

Go ahead and start Phase 1.
