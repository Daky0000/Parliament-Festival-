# Runbook: Event-Day Check-in

**Audience:** the check-in supervisor and the ushers.

## Before the gates open (T-60 min)

1. **Event status.** In Executive Overview, the event must be **active**. If a check-in window is configured, confirm the opening and closing times.
2. **Gates.** Every physical entrance must exist as a gate. Decide whether any gate uses fast-track; the default is off.
3. **Usher accounts.** Each usher signs in at `/usher` on their own phone. Check that each one sees the right gate. Unassigned ushers see no gates.
4. **Test scans**, done by a supervisor with a test pass:
   - one valid pass shows **Valid**;
   - after **Confirm attendance**, the same pass shows **Already checked in**.

   Then reverse the test check-in: Attendance → recent check-ins → reverse, with the reason "rehearsal".
5. **Network.** Every gate must have working mobile data or Wi-Fi.
6. **Supervisor access.** Confirm that the supervisor can open `/attendance` and see the live panel.
7. **Escalation.** Share the escalation contacts with every usher.
8. **Manual lookup.** Confirm that manual lookup finds a guest by name or reference.

## During check-in

- Scan each pass. Read the screen before admitting anyone.
- Tap **Confirm attendance** only when the guest is in front of you and the details match.
- Never admit on **Invalid**, **Expired**, **Revoked** or **Declined**. Call the supervisor, who can override with a reason when protocol allows.
- If a guest has no pass or the QR code is damaged, use **manual lookup**. Check the guest's identity, then confirm.
- Do not skip verification because the queue is long.
- **Supervisor:** watch the live panel for duplicate scans, invalid passes and wrong-gate attempts.

## If the system is unavailable

- Do not treat a cached or old screen as a valid result.
- The supervisor escalates to event leadership.
- If leadership authorizes it, use the **pre-approved printed guest list**. For every manual admission, record the time, gate, staff member and reason on paper.
- After the system recovers, a supervisor enters each paper admission as a manual check-in with an override reason that starts with "CONTINGENCY:". These records remain distinguishable from server-verified check-ins.

## After the gates close

1. Close check-in: set the event to **completed**, or set the check-in closing time.
2. Review overrides and reversals in Attendance, and resolve any exceptions.
3. Export the approved attendance report (Phase 5 reports).
4. Disable temporary usher accounts in Users & roles, using **Suspend**. This ends their sessions immediately.
