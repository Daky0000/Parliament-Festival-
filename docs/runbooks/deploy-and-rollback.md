# Runbook: Deploy and Rollback

**Audience:** the platform operator.

## Normal deploys

| Environment | How to deploy |
| --- | --- |
| Staging | Merge a PR to `main`. When **CI** passes, **Deploy → staging** runs automatically. |
| Production | 1. Confirm that staging is healthy on the target SHA: `GET <staging>/api/health` returns `{"status":"ok","version":"<sha>"}`.<br>2. Go to Actions → **Deploy** → *Run workflow* and enter that SHA.<br>3. Approve the `production` environment gate. |

## When a deploy fails

| Failing step | Result | What to do |
| --- | --- | --- |
| Migration | The Worker is unchanged. | Fix the migration and redeploy. A failed `migrate deploy` leaves the migration marked as failed. Resolve it with `npx prisma migrate resolve --rolled-back <name>` after you check the database. |
| Deploy or smoke test | The workflow runs `wrangler rollback` automatically. | The migration already applied stays in place. This is safe only if migrations follow expand/contract (see README). |

## Code rollback (manual)

```sh
npx wrangler deployments list --env production
npx wrangler rollback <version-id> --env production --message "reason"
```

Then check `/api/health`. Its version is the SHA that was built into the restored Worker.

## Database restore (Neon point-in-time)

Use this only for data loss or a destructive migration. **Every write made after the restore point is lost.** Event leadership must approve the restore before you start.

1. **Restore to a new branch.** In the Neon console, open Branches and choose *Restore*, or create a branch from a timestamp. Set the time to just before the incident. Restoring to a new branch keeps the damaged branch available for forensics.
2. **Copy the connection strings.** From the new branch, copy the pooled and direct connection strings.
3. **Point the Worker at the new branch.** Run `npx wrangler secret put DATABASE_URL --env production` and paste the pooled URL. Update the GitHub `production` environment secrets `DATABASE_URL` and `DIRECT_URL`.
4. **Redeploy** the current production SHA, using the Deploy workflow or `wrangler rollback`. This makes the Worker pick up the new secret.
5. **Verify** that `/api/health` returns ok, then spot-check the data.
6. **Record** the incident: the restore point, the data window that was lost, and who approved the restore.

The restore window equals the history retention of the project's Neon plan. Check it in Neon project settings before the event.

## Rehearsal log

| Date | Environment | What was rehearsed | Result | By |
| --- | --- | --- | --- | --- |
| | staging | `wrangler rollback` | | |
| | staging | Neon point-in-time restore (steps 1 to 5) | | |
