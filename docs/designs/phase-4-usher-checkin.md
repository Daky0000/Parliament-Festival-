# Phase 4: Mobile Usher Web Check-in

| Field | Value |
|---|---|
| Status | Implemented under the owner's standing instruction (2026-11-05) |
| Depends on | Phase 1 (auth), Phase 2 (QR credentials) |
| Source spec | Remediation spec §11 (all), §5.3, §21.3 usher journey |

## 1. Principle

A QR scan is a request to verify an invitation, not proof of attendance. Attendance is recorded only by an explicit, authorized confirm request, and only inside one database transaction.

## 2. Flow

1. **Sign-in.** The usher signs in on a phone browser at `/usher`. They select their gate, which is stored in the `pf_gate` cookie as a preference only; the server checks gate assignments on every request.
2. **Scan.** The phone's built-in camera reads the guest's QR code, which holds `https://<APP_URL>/check-in/scan/<token>`. A signed-out usher is sent to `/login` and then returned to the scan page.
3. **Verify.** `/check-in/scan/[token]` is a server page that runs `verifyScan()`. It is read-only, and shows the guest's welcome card and status.
4. **Confirm.** The usher taps **Confirm attendance**, which sends `POST /api/v1/check-in/confirm`. The server then:
   1. checks the usher's session, `checkin.scan` permission and gate assignment;
   2. re-validates the token;
   3. checks the event status and check-in window;
   4. checks the RSVP;
   5. inserts the attendance record and the audit row in one transaction.

   The partial unique index `uq_one_active_checkin_per_guest` guarantees that only one of any concurrent confirms wins. The others receive `ALREADY_CHECKED_IN` with the original time, gate and usher.
5. **Fast-track.** On a gate with `fastTrackEnabled`, the authenticated page sends the confirm request itself without waiting for a tap. Link previews and email scanners never run that code, so GET stays read-only.

## 3. States (spec §11.5)

| State | Meaning |
|---|---|
| `VALID` | Pass is good and the guest has not arrived yet. |
| `ALREADY_CHECKED_IN` | Shown with the original check-in details. |
| `INVALID` | Unknown or malformed pass. Also shown for a pass from another organization or event, so other events are not revealed. |
| `EXPIRED` | Pass has expired. |
| `REVOKED` | Pass has been revoked. |
| `RSVP_DECLINED` | Guest declined the invitation. |
| `EVENT_NOT_ACTIVE` | The event status is not `active`, or the time is outside `checkinOpensAt`/`checkinClosesAt`. |
| `WRONG_GATE` | The usher is not assigned to this gate. |
| `UNAUTHORIZED` | The user may not check guests in for this event. |
| Network failure | The UI says "do not admit on an unverified result". |

## 4. Roles and gates

- **`usher`:** `checkin.scan`. Works only at gates they are assigned to (`user_gate_assignments`). When an event has gates, a gate is required.
- **`checkin_supervisor`:** `checkin.scan` and `checkin.manual_override`, at all gates of the event. A supervisor can:
  - admit a guest whose RSVP was declined, whose pass is expired or revoked, or who arrives outside the window. A reason is required and audited as `checkin.override`.
  - reverse a wrong check-in (`POST /api/v1/check-in/reverse`). The record is kept, marked `reversed` with who reversed it, when and why.
  - assign and remove ushers on gates (`/api/v1/gates/[gateId]/assignments`).
- **Event owners and admins** (`events.update`): create gates and configure them, including turning fast-track on or off (`/api/v1/gates`, `/api/v1/gates/[gateId]`).

## 5. Data shown to ushers

The welcome card shows only these fields:

- display name and title
- designation and institution
- category name and colour
- seat
- companions expected
- guest reference

It never shows email, phone, notes or accessibility details. Manual lookup (`GET /api/v1/check-in/lookup`) returns the same fields, for one event only, with at most 10 rows.

## 6. Records

`attendance_records` stores:

- gate, credential and usher
- method: `qr`, `manual`, `fast_track` or `supervisor_override`
- override reason and who overrode
- reversal fields
- user agent, truncated

`checkin_attempts` logs every confirm, including refusals. The live dashboard uses it for duplicate, invalid and wrong-gate counts.

## 7. Live operations (`/attendance`)

The live view polls `GET /api/v1/attendance/summary` every 5 seconds. Access requires `reports.read` or `checkin.manual_override`; ushers are refused. It shows:

- invited, checked in and not yet arrived
- RSVP counts
- totals by gate and by category
- exceptions over the last 12 hours
- overrides and reversals
- recent check-ins

## 8. Scanning options

| Option | Details |
|---|---|
| A. Phone camera app | The baseline. Works on iPhone and Android with no installation. |
| B. In-page scanner | Uses the browser's `BarcodeDetector`, shown only where supported. Accepts only `/check-in/scan/` URLs on this site's own origin. |
| C. PWA | Not built. It is optional, and nothing depends on it. |

Offline check-in is deliberately not built (spec §11.12). The contingency procedure is in `docs/runbooks/event-day-checkin.md`.

## 9. Open question for the owner ("Asha people")

The owner described the "Asha people" as a staff/ushers group. This phase delivers their workflow: usher accounts, gate assignment, scan, confirm, and supervisor overrides.

If "Asha" refers to a distinct staff group that needs its own role, fields or screens (for example registration-desk staff or protocol aides), tell us who they are and what they do. That becomes a small follow-up using the configurable roles in `src/lib/roles.ts`.

## 10. Acceptance (spec §11.14) and evidence

| # | Criterion | Evidence |
|---|---|---|
| 1 | Sign in from a mobile browser | `/login` → `/usher` (responsive). Needs a real-device test on staging. |
| 2 | Admin assigns event and gate | Users & roles page for the event role; gate assignment API |
| 3 | Phone camera opens the scan URL | QR encodes an https URL (`tests/checkin`). Real-device test on staging. |
| 4 | Validation does not record attendance | `verifyScan` is read-only (test counts rows) |
| 5 | Correct welcome card | Test checks guest id and companion count |
| 6 | Invalid, expired, revoked, declined and already-used passes show the right state | Tests |
| 7 | Confirm only when authorized; wrong gate refused | Tests |
| 8 | Server re-validates on confirm | `confirmCheckin` resolves everything again |
| 9 | Concurrent scans make exactly one record | 20-way concurrency test |
| 10 | Record holds event, guest, usher, gate and time | Test |
| 11 | Second scan shows the original check-in | Test |
| 12 | Overrides need a reason and are audited | Test (including reversal) |
| 13 | Manual lookup fallback | Test (scoped, limited fields) |
| 14 | Tested on iPhone Safari and Android Chrome | **Pending: real devices on staging (Phase 8 gate)** |
| 15 | No native app needed | Web only |
