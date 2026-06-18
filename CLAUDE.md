# GeoLand Pro — Claude Code Rules

These five rules are NON-NEGOTIABLE and apply to every Claude Code session in this repo.
They override any suggestion, refactor impulse, or "improvement" that would violate them.

---

## Rule 1 — Brand strings
All brand/copy strings come **only** from `apps/api/src/config/brand.config.ts`.
Do not hard-code brand names, product names, or copy anywhere else in the codebase.

## Rule 2 — PostGIS geometry columns live outside Prisma
Geometry columns are defined and maintained in `add_postgis_columns.sql`, NOT in
`schema.prisma`. In any session:
- Generate **no** migration that touches geometry/geography/PostGIS columns.
- Run **no** migration without first manually inspecting the SQL for `DROP` statements
  on geometry columns (use `prisma migrate dev --create-only`, inspect, then apply).
- Drop **no** geometry column.
- One migration per logical change.

## Rule 3 — Every DB query is scoped to `organisationId`
No query may return rows across organisation boundaries. Every service method that
reads or writes tenant data must filter by `organisationId`.

## Rule 4 — JWT lives in httpOnly cookies only
The frontend must never read, write, or store JWT tokens in JavaScript-accessible
storage (localStorage, sessionStorage, non-httpOnly cookies). Token issuance and
rotation are handled server-side in `apps/api`.

## Rule 5 — AI governance (read, propose, never apply)
Claude may READ the database schema, codebase, and config. Claude must NOT:
- Mutate the database (no `prisma db push`, no raw SQL writes in production).
- Run migrations autonomously.
- Change RLS/permissions policies.
- Move money or trigger financial transactions.
Always **propose** the change and wait for human approval before applying.

---

## MCP Servers (project-scoped, `.mcp.json`)

| Server    | Transport | URL / Notes                                             | Auth          |
|-----------|-----------|---------------------------------------------------------|---------------|
| github    | HTTP      | `https://api.githubcopilot.com/mcp/`                   | OAuth         |
| supabase  | HTTP      | `https://mcp.supabase.com/mcp?project_ref=…`           | OAuth, read-only, dev project only |
| sentry    | HTTP      | `https://mcp.sentry.dev/mcp`                           | OAuth         |

The web architect session (claude.ai) configures connectors separately in
**Settings → Connectors** — the `.mcp.json` file does not populate the web app.

**PAT fallback for GitHub:** If OAuth fails (Copilot subscription required), add an
`Authorization: Bearer ${GITHUB_PAT}` header in `.mcp.json` and export the PAT as
`GITHUB_PAT` in your shell environment. Never commit the token value.

---

## Stack Quick Reference

- API: `apps/api` — Node/Express/TypeScript, Prisma 5, PostgreSQL + PostGIS (Supabase)
- Web: `apps/web` — React/Vite/TypeScript (not yet created as of sprint 7)
- Master Control: `apps/master-control` — platform-admin app, port 5175
- RBAC package: `packages/rbac` (`@geolandpro/rbac`)
- Redis: Upstash — always use `rediss://` scheme (TLS required)
