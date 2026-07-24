## Goal

Turn the existing PIN-gated Portfolio page into a **full-stack, real-time, drag-and-drop editable** portfolio for Gaurav Raj — with premium project cards, replaceable DP, and a members section that also drives the DPs shown elsewhere on the site (Home team card, About Me).

## Current state (verified)

- `src/pages/Portfolio.tsx` exists — PIN `2022`, stores everything as a single JSON blob under `attendance_settings.value` where `key = 'gaurav_portfolio'`. Images today are just text URL fields (no uploads, no reordering).
- `src/pages/Index.tsx` renders a hardcoded `creatorMembers` array (Gaurav, Swami Anant Vyas, Jatin Dhama) with static image imports.
- `src/components/AboutMe.tsx` uses a hardcoded `/lovable-uploads/...png`.
- No storage bucket exists yet for portfolio assets; `face-images` is unrelated and shouldn't be reused.

## What we'll build

### 1. Storage + data
- New public storage bucket **`portfolio-assets`** for DP, cover, gallery, project shots, member DPs.
- Keep the existing `attendance_settings` JSON-blob approach (no schema churn) but extend `PortfolioData` with:
  - `members: { id, name, role, bio, image, order }[]`
  - `projects` gains `order`, `tags[]`, `githubUrl`, `year`
  - `socials: { github, linkedin, twitter, instagram }`

### 2. Secured editor (`/portfolio` after PIN 2022) — rebuilt
- Tabbed premium editor: **Profile · Projects · Members · Gallery · Socials**.
- **Drag-and-drop image uploads** everywhere an image is needed (profile DP, cover, each project card, each member DP, gallery). Dropzone shows preview + progress; also supports click-to-pick and paste-from-clipboard. Files go to `portfolio-assets`, public URL saved back into the JSON.
- **Reorder by drag** (dnd-kit) for projects, members, gallery, achievements, skills.
- **Remove / replace DP** on every entity with a single hover action.
- Auto-save (debounced) + explicit Save. Lock button to relock.

### 3. Public portfolio view — premium
- Hero with cover image, floating glass DP, name, role, tagline, socials.
- **Projects grid**: premium liquid-glass cards, cover image with parallax hover, stack chips, external link + GitHub buttons, year badge.
- Members strip with rounded DPs, name, role, bio-on-hover.
- Achievements timeline, skills cloud, gallery masonry with lightbox.

### 4. Fix members DP everywhere (single source of truth)
- `src/pages/Index.tsx` `creatorMembers`: read from the same portfolio JSON on mount (with the current hardcoded array as fallback). Any DP replaced in the secured editor updates the Home team card in real-time.
- `src/components/AboutMe.tsx`: bind DP + name + bio to portfolio JSON too.
- Real-time: subscribe to `attendance_settings` changes via Supabase realtime so Home + About Me + Portfolio all update without reload.

## Technical details

**Bucket + RLS**
```sql
-- new migration
insert into storage.buckets (id, name, public) values ('portfolio-assets','portfolio-assets', true);
-- read: public; write: authenticated only (editor is PIN-gated in UI; we still require auth for storage writes)
create policy "portfolio read" on storage.objects for select using (bucket_id='portfolio-assets');
create policy "portfolio write" on storage.objects for insert to authenticated with check (bucket_id='portfolio-assets');
create policy "portfolio update" on storage.objects for update to authenticated using (bucket_id='portfolio-assets');
create policy "portfolio delete" on storage.objects for delete to authenticated using (bucket_id='portfolio-assets');
```
Bucket created via `supabase--storage_create_bucket`; policies via migration.

**Files touched**
- `src/pages/Portfolio.tsx` — split into `PortfolioView.tsx` (public) + `PortfolioEditor.tsx` (secured).
- New `src/components/portfolio/`: `ImageDropzone.tsx`, `ProjectCard.tsx`, `MembersGrid.tsx`, `SortableList.tsx`, `useUploadPortfolioAsset.ts`, `usePortfolioData.ts` (shared fetch + realtime subscription).
- `src/pages/Index.tsx` — swap hardcoded `creatorMembers` for `usePortfolioData().members`.
- `src/components/AboutMe.tsx` — read DP + copy from portfolio data.

**Libraries**
- `@dnd-kit/core` + `@dnd-kit/sortable` for reorder + drop targets (dropzone works via native HTML5 drag events, no extra dep).

## Out of scope (ask if you want them)
- Migrating the JSON blob to a proper `portfolio_content` table.
- Public-facing contact form / email delivery.
- SEO metadata per project (can add later).

## Confirm before I build
1. Keep PIN `2022` as the sole gate to the editor, or also require an admin login?
2. Members list — start with the current three (Gaurav, Swami Anant Vyas, Jatin Dhama) editable, or blank so you re-add them from the editor?
