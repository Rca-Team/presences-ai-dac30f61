# Full-Site Backup & Restore Upgrade

## Goal
Turn the Admin → Data Backup section into a true "whole-site" backup: every table (attendance, profiles, face_descriptors + face samples, timetable, gate entries, etc.), auth users, and roles — with automatic scheduled backups, a real progress UI, and a reliable one-click import that puts everything back.

## Current State (verified)
- `src/pages/DataBackup.tsx` currently calls `project-backup-manager` with hard caps: `maxTables: 12`, `maxTableRows: 500`, `maxTotalRows: 2400`, `includeStorage: false`, `includeAuthUsers: false`, `includeFaceDescriptors: false`. So most of the site is deliberately excluded today.
- Progress bar is a fake timer (`+7% every 850ms`) — it doesn't reflect real work.
- Auto-daily snapshot exists but uses the same limited export and stores only in `localStorage` (lost on browser clear).
- Edge function `project-backup-manager` already supports `export_backup` / `restore_backup` actions.

## What Will Change

### 1. Full-Coverage Export (edge function)
Rework `supabase/functions/project-backup-manager/index.ts` to support a **chunked** export:
- New action `export_manifest` → returns the list of tables + row counts.
- New action `export_chunk` → returns rows for one `(table, offset, limit)` slice.
- Includes: all public tables, `auth.users` (id/email/metadata only), `user_roles`, `face_descriptors` (full descriptors), storage bucket file listings.
- No hard row/table caps — client drives pagination.

### 2. Client-Driven Full Backup (frontend)
Rewrite the export flow in `src/pages/DataBackup.tsx`:
- Step 1: fetch manifest → know exact total rows.
- Step 2: loop through each table in pages of ~500 rows, assembling one JSON.
- Step 3: stream-write the assembled JSON to a downloaded file.
- **Real progress**: `processedRows / totalRows` drives the bar + a live "Backing up `attendance_records` — 3,240 / 5,120" label.
- Same pipeline reused for snapshots (stored in IndexedDB, not localStorage, so multi-MB backups fit).

### 3. Full Restore (import)
- Parse uploaded JSON, show a preview: "This backup contains X users, Y attendance records, Z face samples — Restore?"
- Send to edge function in the same table-by-table chunked pattern with progress feedback.
- Auto-create a pre-restore rollback snapshot first (already the pattern, kept).

### 4. Automatic Backups
- Add `automatic_backups` toggle + frequency (`daily` / `weekly`).
- On admin page load, if last auto backup older than the interval → run silently in background, store in IndexedDB, keep last 7.
- Optional: schedule a `pg_cron` job to call the edge function server-side and stash a JSON in a private storage bucket `backups/` — makes backups survive browser wipes. (Will confirm bucket creation via migration.)

### 5. UI/UX
Redesign the backup card into three tabs:
- **Backup Now** — big button, live progress with per-table breakdown, last-backup timestamp.
- **Restore** — dropzone + snapshot list (from IndexedDB + storage bucket), confirmation dialog.
- **Settings** — auto-backup toggle, frequency, retention count.

## Technical Details
- **Chunk size**: 500 rows/request keeps each edge-function call well under the 25s CPU/timeout budget.
- **Storage bucket**: create `backups` (private, admin-only RLS) via migration; store as `backups/<timestamp>.json`.
- **IndexedDB**: use a tiny wrapper (no library) with one object store `snapshots`.
- **Auth users**: exported through service-role admin API; on restore, existing users matched by email, missing users inserted via `admin.createUser` with `email_confirmed=true`.
- **Face descriptors**: exported as raw JSON arrays (already stored that way in `face_descriptors.descriptor`).
- **Progress model**: `{ phase, table, done, total, overallPct }` state object; drives both the progress bar and the label.

## Out of Scope
- Encrypting backup files (can be added later if requested).
- Cross-project restore (backup format stays project-specific).

## Files Touched
- `supabase/functions/project-backup-manager/index.ts` — add manifest/chunk actions.
- `src/pages/DataBackup.tsx` — rewrite UI + chunked client.
- `src/lib/backup/indexeddb.ts` — new tiny helper.
- New migration — `backups` storage bucket + admin RLS.
- Optional: `pg_cron` job (via `supabase--insert`) for server-side daily backup.

Approve and I'll implement it.
