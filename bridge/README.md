# Gate Mode 2.0 — Advanced Camera Bridge

The bridge turns RTSP CCTV into identity-tagged events for the app. It's a
standalone worker (any always-on box, ideally with a small GPU) that posts
JSON to the `gv-ingest` Edge Function.

## Stack

| Layer          | Library                                | Purpose |
|----------------|----------------------------------------|---------|
| Detection      | **Ultralytics YOLOv8m**                | Person detection (COCO class 0) |
| Tracking + ReID| **BoxMOT BoT-SORT + OSNet_x0_25**      | Stable IDs, appearance re-linking |
| Pose           | **YOLOv8n-pose**                       | Sit / stand classification, teacher activity |
| Face           | **InsightFace `buffalo_l`** (SCRFD + ArcFace r100) | Detection + 512-D recognition |
| Geometry       | **Shapely**                            | Zone polygons, dwell tracking |
| Runtime        | **PyTorch (CUDA/FP16 when available)** | Everything runs on GPU when present |

Advanced logic on top:

- **Bench / away-face case**: identity binds to the *track*, not the frame. If a track breaks and a new one appears with a matching **OSNet ReID** embedding, we emit `reid_relink` and inherit the previous identity.
- **Sit / stand**: derived from YOLOv8-pose keypoints (hip / knee / ankle geometry).
- **Loitering**: track dwelling in a doorway zone > `LOITERING_S` seconds.
- **Tailgating**: two `enter` events at a doorway within `TAILGATE_WINDOW_S`.
- **Crowd density**: person count in a single frame above threshold.
- **Teacher activity**: teacher-identified track standing in `seat_front` for >30s ⇒ `teaching`.
- **Concurrent-exit alerts**: computed server-side in `gv-ingest`.

## Setup

```bash
cd bridge
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Build the face gallery once from a folder of enrolled faces:

```
faces/
  student/STU-101__Alice/1.jpg 2.jpg ...
  teacher/TCH-04__Mr_Rao/1.jpg 2.jpg ...
```

```bash
python build_gallery.py faces gallery.npz
```

Copy `.env.example` to `.env` and fill in `GV_INGEST_URL`, `GV_INGEST_SECRET`,
per-camera RTSP + zone polygons.

## Run

```bash
docker compose up -d          # recommended
# or
python bridge.py
```

## Event payload (batched every ~1s)

```json
{
  "camera_id": "…",
  "tracks": [{
    "local_track_id": "42",
    "subject_type": "student", "subject_id": "STU-101", "subject_name": "Alice",
    "confidence": 0.91, "last_zone": "seat_front",
    "appearance_sig": [0.12, -0.03, ...],  // truncated OSNet vec
    "ended": false
  }],
  "events": [
    { "local_track_id": "42", "event_type": "enter",         "zone": "doorway" },
    { "local_track_id": "42", "event_type": "sit",           "zone": "seat_front" },
    { "local_track_id": "42", "event_type": "zone_change",   "zone": "seat_middle", "meta": {"from":"seat_front","dwell_s":42.1} },
    { "local_track_id": "51", "event_type": "loitering",     "zone": "doorway", "meta": {"dwell_s": 24.3} },
    { "local_track_id": "51", "event_type": "tailgating",    "meta": {"gap_s": 0.9} },
    { "local_track_id": "42", "event_type": "reid_relink",   "meta": {"score": 0.71} },
    { "local_track_id": "18", "event_type": "teacher_activity", "meta": {"activity":"teaching", "dwell_s": 62} },
    { "event_type": "crowd_density", "meta": {"count": 19} }
  ]
}
```

Headers:

```
POST $GV_INGEST_URL
x-bridge-secret: $GV_INGEST_SECRET
Content-Type: application/json
```

## Tuning

All thresholds are env-vars in `bridge.py`:
`DETECT_EVERY_N`, `POSE_EVERY_N`, `LOITERING_S`, `TAILGATE_WINDOW_S`,
`CROWD_DENSITY_THRESHOLD`, `FACE_MATCH_THRESHOLD`, `REID_MATCH_THRESHOLD`.

## Privacy

Frames stay on the bridge. Only structured events (and optional low-res
thumbnails on `face_confirm`) are uploaded. Retention is controlled server-side
via `attendance_settings`.
