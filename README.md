# ProofDesk

**ProofDesk Validation Prototype** - a "claimed-vs-proven" audit tool for creator/influencer campaign deliverables. An operator loads a campaign, runs a proof audit, and sees each creator's *claimed* deliverables next to what is actually *proven*, with honest machine-vs-human provenance on every check.

This is a validation prototype. **All four MVP epics are complete** - the audit demo, real evidence capture, the configurable proof bar, and the client-safe report/export. See [Project status](#project-status).

---

## Prerequisites

- **Node ≥ 24** (pinned in `.nvmrc`). The project uses the native `better-sqlite3` module - it must be compiled against your running Node ABI.
- **npm** (ships with Node).

If you use `nvm`:

```bash
nvm use          # picks up .nvmrc (Node 24)
```

> **ABI gotcha:** if you switch Node versions, `better-sqlite3` will fail with `NODE_MODULE_VERSION` mismatch. Fix it with:
> ```bash
> npm rebuild better-sqlite3
> ```

---

## Quick start

```bash
nvm use                      # Node 24
npm install                  # if node_modules is missing
cp .env.example .env         # local operator credentials + SQLite path

npm run db:migrate           # apply Drizzle migrations -> ./data/proofdesk.db
npm run seed:demo            # load the "Aurora Energy" demo campaign
# (or: npm run seed        runs migrate + seed:demo together)

npm run dev                  # Next.js dev server on http://localhost:3000
```

Then open **http://localhost:3000**. The entire app is behind HTTP Basic auth:

| | |
|---|---|
| **User** | `operator` |
| **Password** | `changeme` |

These are the non-production fallback credentials (see `.env.example` / `proxy.ts`). Override them with `OPERATOR_USER` / `OPERATOR_PASSWORD`.

The demo campaign seeds **9 deliverables across 6 creators** with a designed audit outcome of **7 Green · 1 Yellow · 1 Red** (the verdict is *computed* by the engine, never stored).

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server (Turbopack) on `:3000` |
| `npm run build` | Production build (`output: 'standalone'`) + copies static assets |
| `npm start` | Runs the standalone server (`.next/standalone/server.js`), loading `.env` / `.env.local` |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run seed:demo` | Seed the demo campaign (idempotent - skips if already present) |
| `npm run seed` | `db:migrate` + `seed:demo` |
| `npm run reset:demo` | Drop the DB (file + WAL/SHM) and reseed a clean demo - re-runnable in front of a client |
| `npm run lint` / `lint:fix` | Biome lint (`--write` to fix) |
| `npm run format` | Biome format |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest unit/integration suite |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run ci` | Full quality gate: biome → typegen → tsc → vitest → build |

> **Migrations are not part of `ci`** - CI is a pure quality gate. The long-lived host owns migrate/deploy.

---

## Configuration

Copy `.env.example` → `.env` and adjust:

| Var | Purpose | Default (non-prod) |
|---|---|---|
| `OPERATOR_USER` | Basic-auth user (single shared operator credential - no per-user accounts) | `operator` |
| `OPERATOR_PASSWORD` | Basic-auth password | `changeme` |
| `DB_PATH` | SQLite file location (`/data` is gitignored) | `./data/proofdesk.db` |

In **production** nothing is assumed: if `OPERATOR_USER` / `OPERATOR_PASSWORD` are unset, the auth gate is **closed by default** and 401s every request. Secrets come from the host secret store, not a committed `.env`.

---

## Architecture (at a glance)

Modular monolith, **Functional Core / Imperative Shell**, ports-and-adapters at exactly two swap-seams.

```
app/(ui)        desktop operator shell
app/(capture)   mobile capture-only path
app/api         Route Handlers (Zod-validated boundaries) → orchestrate via services
src/core        PURE audit engine: audit(snapshot) → { verdict, trace }  (no I/O, no Date.now)
src/services    orchestration + the sole AuditSnapshot assembler
src/repositories the ONLY code touching Drizzle/SQLite  (DB swap-seam → EU Postgres in v2)
src/storage     S3-shaped evidence-file adapter  (storage swap-seam)
src/verification link-liveness adapter (mockable/off in tests)
src/ruleset     criticality + satisfaction taxonomy as typed TS constants
src/schema      Drizzle + Zod schemas
seed/           seeded demo campaign
tests/          heavy table-driven core tests + mandatory honesty-regression suite
```

Key invariants (from the Architecture Spine):

- **The audit core is pure** - a function of an `AuditSnapshot`; it imports nothing effectful and never re-classifies a value the shell resolved.
- **Effective Proof Status is derived, never materialized** - `override.final_status ?? machine_verdict`, computed in one resolver every consumer reads.
- **Capability & liability honesty are structural** - machine-verified labels never appear where the value is a human assertion; disclaimers are always present with verdicts. This is enforced by `tests/honesty-anchor.test.ts` and is never skipped.
- **EN + FR are both first-class** - user-facing strings are externalized and localized; glossary terms stay English in code.

The stack is intentionally minimal: Next.js 16 (App Router), React 19, TypeScript strict, Drizzle over `better-sqlite3`, Zod v4, Biome, Vitest, Playwright. No serverless, no per-user auth/billing, no US-parent host in the real-client-data path.

---

## Testing

```bash
npm test           # Vitest - unit + integration (core is the test-heavy zone)
npm run test:e2e   # Playwright - smoke only
npm run ci         # everything the quality gate checks
```

The core's purity makes exhaustive `test.each` table tests cheap - every decision-table path and per-requirement predicate is covered there.

---

## Project status

Sprint state lives in `../_bmad-output/implementation-artifacts/sprint-status.yaml`. **All four MVP epics are `done` (22 stories).** The engine is functionally complete and internally honest end-to-end; usability with a real agency operator is the next epic (Clarity + Consolidation), not more capability.

- ✅ **Epic 1 - The Magic-Moment Audit Demo** (10 stories): project skeleton & CI gate, design foundation/app shell, the `AuditSnapshot` data model, the demo seed, the pure audit engine + effective-status resolver, the campaign board, the staged proof-audit reveal, the Claim Card drawer with machine/human provenance, human override + caveat, and the cross-cutting honesty/legal disclaimer anchor.
- ✅ **Epic 2 - Real Evidence Capture Loop** (5 stories): Evidence Inbox ingest, deterministic Evidence->Deliverable matching with operator affirmation, the "confirm the page shows the Deliverable" HumanConfirmation, SSRF-hardened link liveness (four-value taxonomy), and the mobile capture-only path feeding the same ingest pipeline.
- ✅ **Epic 3 - Proof Brief & Requirement Templates** (3 stories): the ruleset foundation (criticality + satisfaction taxonomy + default critical sets), the Proof Brief template picker + per-Deliverable requirement authoring, and the France/EU Disclosure Checklist with three-tier severity.
- ✅ **Epic 4 - Client-Safe Report & Export** (4 stories): report assembly against a frozen snapshot with a no-verdict-field inclusion resolver, agency branding + Proof Appendix, the self-contained print-ready HTML report, and the portable ZIP bundle + manifests with the demo export hard-wall.

---

## Notes for the next run

- Always `nvm use` (Node 24) before any npm command - a wrong Node version breaks `better-sqlite3` until you `npm rebuild better-sqlite3`.
- The SQLite file under `./data/` is gitignored; run `npm run reset:demo` to drop and recreate a clean demo (or `npm run seed` to seed only if empty).
