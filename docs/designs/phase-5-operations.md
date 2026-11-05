# Phase 5: Seating, Protocol and Event Operations

| Field | Value |
|---|---|
| Status | Core implemented under the owner's standing instruction (2026-11-05). Items in §3 are backlog. |
| Depends on | Phases 1–4 |
| Source spec | Remediation spec §6.3, §12, §14 |

## 1. Delivered

### Seating engine (`src/lib/seating/engine.ts`)

- **RSVP check:** uses the latest RSVP across all of a guest's invitations. It previously looked only at the first invitation.
- **Overflow:**
  - When a guest's own section is full, the engine places them in the next section in display order that is untagged or belongs to an equal or lower-precedence rank.
  - A higher-rank section is never used for a lower-rank guest.
  - Each overflow is reported as `OVERFLOW_ASSIGNED`. A guest the engine cannot place is reported as `CAPACITY_EXCEEDED`.
- **Concurrency:** the whole allocation runs in one transaction with every section of the plan locked (`FOR UPDATE`), so it is serialized against manual assignment. The partial unique indexes back this up.
- **Idempotency:** re-running the engine changes nothing.

### Manual seat assignment (Phase 1/2)

Assignment is transactional, capacity-safe and audited. Reassignment records both the old and the new section and seat.

### Readiness checklist (`src/lib/readiness.ts`)

The checklist follows spec §6.3 and is computed from real state:

| Check | Pass condition |
|---|---|
| Schedule | Date, time zone and venue are set |
| Guests | Guests are loaded and every guest has a rank |
| Template | An invitation template is approved |
| Email provider | Configured |
| SMS provider | Configured (optional) |
| RSVP deadline | Set |
| Seating | Capacity is at least the number of accepted guests |
| Gates | Gates exist and ushers are assigned to them |
| Event status | Active |

It appears on `/reports` and in `GET /api/v1/events/[eventId]`.

### Reports (`GET /api/v1/reports/[report]?eventId=`)

All reports are CSV.

| Report | Permission |
|---|---|
| `guests` | `guests.export` |
| `rsvps` | `rsvps.read` |
| `seating` | `seating.read` |
| `communications` | `invitations.read_activity` |
| `attendance` | `reports.export` |
| `exceptions` | `reports.export` |
| `audit` | `audit.read` |

Rules that apply to every report:

- Files are generated per request and returned as an attachment. Nothing is stored and there are no public URLs.
- Contact details are excluded unless the request includes `include=contact` and the user holds `guests.export`.
- CSV injection is neutralised: cells starting with `= + - @`, a tab or a carriage return are prefixed with `'`.
- Each export is audited as `report.exported`, with the row count and filters.

### The `/reports` page

The page shows the readiness checklist and the downloads the user is permitted to run. It has its own nav item.

## 2. Tests

`tests/operations/reports-seating.test.mjs` covers:

- the CSV injection prefix;
- export permissions;
- contact details off by default;
- export auditing;
- the readiness checklist;
- engine overflow precedence and idempotency.

## 3. Backlog (not built in this pass)

| Item | Current state | Next step |
|---|---|---|
| Venue, area, table and seat editor UI | Sections are created per rank automatically and through the existing planner. There is no visual editor. | Admin forms for sections and tables, with capacity and display order. |
| Drag-and-drop seating with a keyboard alternative | Manual assignment works through the API and the guest drawer. | Accessible drag-and-drop. |
| Delegations and groups, VIP flags with restricted notes | `GuestGroup` / `GuestGroupMember` models exist but have no UI. | Group management UI, plus a restricted-notes permission. |
| Import mapping UI and duplicate-merge review | Import has a preview/commit flow with duplicate warnings. | A column-mapping step and a merge review screen. |
| Printable seating lists | A seating CSV is available. | A print-optimised HTML view. |

These items do not affect security or data integrity. They are usability work for the protocol team, and should be confirmed with the owner before the event.
