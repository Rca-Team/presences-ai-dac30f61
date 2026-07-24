# Gate Mode 2.0 — AI Vision Surveillance Upgrade

Turn Gate Mode from a face-only gate scanner into a continuous AI surveillance layer that tracks people across the frame (even when the face turns away), identifies teachers by presence, and logs a full class-session timeline (who entered/exited when, peak student count, students leaving during/after teacher).

The `gv_cameras`, `gv_camera_zones`, `gv_tracks`, `gv_events`, `gv_class_sessions` tables already exist and are Realtime-enabled — this build wires them to a real pipeline instead of adding new schema.  
  
try to avoid lovable for database and stroage use older one that use in full project 

## What ships

### 1. Vision pipeline (new file `src/services/vision/`)

- **PersonDetector** — MediaPipe Tasks Vision `ObjectDetector` (EfficientDet-lite) running in a Web Worker at ~10 fps, class=`person`. Broad boxes, no face required. Model auto-downloads from CDN with local fallback.
- **TrackerService** — IoU + centroid + appearance-signature multi-object tracker (SORT-style, no re-id model). Each track keeps: id, box history, dwell zones, first_seen, last_seen, appearance signature (256-bin HSV histogram of the torso crop).
- **ReIdentifier** — when face-api identifies a face inside a track box, that identity is bound to the track. When the face later disappears (person turns, sits on a bench, walks off), the tracker keeps the identity as long as the track survives; if the track is dropped and a new track appears with cosine similarity > 0.85 on the appearance signature within 90 s and inside a linked zone, identity is transferred (re-id).
- **ZoneClassifier** — polygon hit-test using `gv_camera_zones` (gate, corridor, class-front, class-seats, bench-area). Every track update produces a current zone.

### 2. Class session inference (`src/services/vision/ClassSessionInferer.ts`)

- Reads today's `timetable` row for the class linked to this camera to get the scheduled teacher and period.
- Emits `teacher_entered` when a track that is (a) identified as the scheduled teacher via face, OR (b) an adult-sized track that stays in the class-front zone > 60 s during that period, crosses the class threshold zone. The "no face visible" path is what the user asked for: presence + zone + timetable ⇒ confirmed teacher.
- Emits `teacher_exited` when that track leaves the class polygon for > 20 s.
- Rolling `student_count_peak` = max simultaneous non-teacher tracks in the class-seats zone.
- On every student track leaving the class polygon: increments `students_left_during` if inside `[teacher_entered_at, teacher_exited_at]`, else `students_left_after` (within 15 min of exit).
- Upserts one row per (`class_key`, `period_key`, `day_key`) into `gv_class_sessions`.

### 3. Event log

Every meaningful state change writes to `gv_events`: `person_enter`, `person_exit`, `zone_change`, `teacher_entered`, `teacher_exited`, `student_left_during`, `student_left_after`, `bench_dwell`, `crowd_exit` (≥ 3 students leaving within 10 s). Batched insert every 2 s to keep DB writes cheap.

### 4. Gate Mode page rewrite (`src/pages/GateMode.tsx` + new components)

- Existing face-gate scanner stays as-is for entries.
- New tab **"Vision 2.0"** with:
  - `VisionCanvas` — live video with track boxes, identity labels (or "unknown-adult"/"unknown-student"), zone tint, appearance thumbnail chip.
  - `LiveTimeline` — realtime feed from `gv_events` for the active class.
  - `SessionStatsCard` — current teacher (confirmed / inferred), peak student count, exits during / after teacher, dwell heatmap.
  - `ZoneEditor` — draw polygons on a paused frame; persists to `gv_camera_zones`.
- Setup step: pick this device's `gv_cameras` row (or create one), set `class_key`, define zones once.

### 5. Libraries

Add: `@mediapipe/tasks-vision` (person detection), `ml-kmeans` (appearance clustering), `simple-statistics` (rolling stats). All existing face-api / recognition code untouched.

## Technical section

```text
video ──▶ frame throttler (10 fps) ──▶ Web Worker
                                          │
                                          ▼
                              MediaPipe person boxes
                                          │
                          ┌───────────────┴──────────────┐
                          ▼                              ▼
                    IoU/appearance tracker        face-api (existing, 4 fps)
                          │                              │
                          └──────► bind face → track ◄───┘
                                          │
                                          ▼
                                  ZoneClassifier
                                          │
                                          ▼
                              ClassSessionInferer
                                          │
                     batched writes ──────┴──────► gv_tracks / gv_events / gv_class_sessions
```

Perf budget: MediaPipe worker < 40 ms/frame on mid GPU, tracker < 5 ms, DB writes off the render loop. Vision tab is lazy-loaded; nothing runs unless the operator opens it.

Files created/changed:

- `src/services/vision/PersonDetector.ts` + `personDetector.worker.ts`
- `src/services/vision/TrackerService.ts`
- `src/services/vision/ReIdentifier.ts`
- `src/services/vision/ZoneClassifier.ts`
- `src/services/vision/ClassSessionInferer.ts`
- `src/services/vision/EventBatcher.ts`
- `src/components/gate/vision/VisionCanvas.tsx`
- `src/components/gate/vision/LiveTimeline.tsx`
- `src/components/gate/vision/SessionStatsCard.tsx`
- `src/components/gate/vision/ZoneEditor.tsx`
- `src/pages/GateMode.tsx` — add Vision 2.0 tab

Existing gv_* tables already have RLS + Realtime, so no migration is required unless zones need extra fields — I'll only add a migration if a column is genuinely missing during build.

## Out of scope for this plan

- Multi-camera fusion across rooms (single-camera per device only).
- Cross-day re-identification (appearance sigs reset daily).
- Server-side vision — everything runs on-device to keep it free and private.