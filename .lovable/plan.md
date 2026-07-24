# Gate Mode 2.0 — AI Vision Surveillance

Turns Gate Mode into a persistent classroom + gate surveillance system. Faces recognize people; short-term body tracking keeps identifying them after they turn away (e.g. sitting on a bench). Every enter/exit event is logged and tied to the timetable.

## Scope confirmed with you

- **Cameras**: RTSP/IP CCTV, 24/7. Browser cannot pull RTSP directly, so we design a Camera Bridge worker (Node/Python) that you host locally; the app treats each camera as a registered stream and receives frames + events over a secure channel.
- **Re-ID**: short-term visual tracking (body appearance + motion) inside a single camera view. Cross-camera Re-ID is out of v1.
- **Teacher inference**: timetable-first, upgraded to "confirmed" once the scheduled teacher's face is recognized during the period.
- **Events logged**: teacher enter/exit, student enter/exit + seat zone (front/middle/back), students-leaving-during-class, concurrent-exit alerts.

## Architecture

```text
 CCTV (RTSP) -> Camera Bridge worker (you host)
                  |  decode frames, run detector + tracker locally
                  |  run face recognition on best frames
                  v
             Lovable Cloud (Edge Function ingest)
                  |  validates + writes tracks & events
                  v
             Postgres (cameras, tracks, events, presence)
                  |  Realtime
                  v
             Admin "Gate Mode 2.0" dashboard (React)
```

The bridge does the heavy vision work (RTSP decode, YOLO person detection, ByteTrack/OC-SORT tracking, embeddings). The app owns identity, timetable logic, storage, dashboards, and alerts.

## Data model (new tables)

- `cameras` — name, location (`gate` / `classroom:6A` / `corridor` / `common`), class_id nullable, rtsp label (URL stored only in the bridge), status.
- `camera_zones` — polygonal zones per camera: seat_front / seat_middle / seat_back / doorway. Editable from admin.
- `vision_tracks` — one row per person-track within a single camera view: camera_id, track_id, started_at, ended_at, identified_student_id / identified_teacher_id (nullable until recognized), confidence, appearance signature (color histogram + body embedding hash), last_zone.
- `vision_events` — camera_id, track_id nullable, subject_type (student/teacher/unknown), subject_id nullable, event_type (`enter`, `exit`, `sit`, `stand`, `zone_change`, `concurrent_exit_alert`), zone, class_id, period_id nullable, occurred_at.
- `class_presence_sessions` — class_id, period_id, teacher_id (scheduled), teacher_confirmed boolean, teacher_entered_at, teacher_exited_at, student_count_peak, students_left_during_class integer.
- All tables get RLS: admins full access, teachers scoped to their class, service role for the ingest function.

## Camera Bridge worker (documented, not hosted in Lovable)

We ship a `bridge/` reference implementation the user runs on any always-on machine (mini-PC, NVR box). It:

1. Reads RTSP with ffmpeg/GStreamer.
2. Runs person detection (YOLOv8n) + ByteTrack for stable track IDs across frames.
3. On each track's best frame (largest, most frontal), runs the existing face recognition pipeline to bind `track_id -> student_id/teacher_id`.
4. Keeps identifying the person via the track even after the face disappears (bench case). If the track breaks and re-appears within N seconds with matching appearance signature, it re-links.
5. Emits enter/exit and zone events to the ingest edge function with the bridge API key.

The bridge is optional-but-required for real CCTV; the app also accepts a "browser bridge" fallback (a tab on a laptop pointed at a USB camera) for demos.

## Edge functions

- `gate-vision-ingest` — receives events from bridges, validates the bridge API key (per-camera secret), writes tracks/events, updates `class_presence_sessions` (teacher_entered_at when scheduled teacher recognized, counters for exits during class).
- `gate-vision-alerts` — server-side rule: if ≥3 exits from the same classroom within 60s, insert a `concurrent_exit_alert` event and mark it unread.
- `gate-vision-timeline` — read API used by the dashboard to load a period's timeline efficiently.

## Frontend (admin "Gate Mode 2.0" section)

- **Cameras page**: register camera, assign to class, draw seat zones on a snapshot, generate bridge API key, view live status.
- **Live wall**: per-class card showing scheduled teacher + confirmation state, current student count, seat-zone occupancy heat strip, active alerts.
- **Timeline view**: per class + period, chronological list — "Teacher entered 09:02", "3 students exited between 09:34–09:35 (alert)", "Teacher exited 09:47", "5 students exited after teacher left".
- **Person track drawer**: click a track to see when/where the person was seen across the day within each camera.

Existing Gate Mode UI stays as the entry point; the new views live under a `Gate Mode 2.0` tab so nothing regresses.

## Reliability + privacy

- Bridge → cloud uses HTTPS + per-camera bearer token stored via `add_secret`.
- No raw video frames stored server-side; only event rows and (optionally) low-res thumbnails on best-frame events, kept in a private storage bucket with signed URLs.
- Retention: events default to 30 days, configurable.

## Rollout

1. Migration + RLS + grants for the 5 new tables.
2. Ingest + alerts + timeline edge functions.
3. Admin UI: Cameras page and Live wall.
4. Timeline view + concurrent-exit alerts panel.
5. Ship `bridge/` reference worker (README + docker-compose + sample config) so you can wire real CCTV.

## Technical notes

- Bridge language: Python (ultralytics + opencv + supervision) recommended; a Node variant is possible but slower.
- Track IDs are per-camera and per-day; do not treat them as global.
- Teacher confirmation runs only during the scheduled period window (from `timetable_slots`) to avoid mislabeling a teacher walking past.
- Concurrent-exit threshold and retention are stored in `attendance_settings` so you can tune without a redeploy.
