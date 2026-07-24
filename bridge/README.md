# Gate Mode 2.0 — Camera Bridge

The **bridge** is a small always-on worker that turns a CCTV feed into
identity-tagged events for the Presences app. Browsers can't read RTSP,
so this runs outside Lovable (on any mini-PC, NVR, or Docker host) and
posts events to the `gv-ingest` edge function.

## Responsibilities

For every registered camera the bridge:

1. Decodes the RTSP stream with OpenCV / FFmpeg.
2. Runs **YOLOv8n** person detection on ~5 fps.
3. Feeds detections into **ByteTrack** so each person gets a stable
   `local_track_id` across frames — this is what makes the "sitting on
   the bench, face not visible" case work.
4. On the best frame for each track (largest bounding box, most frontal
   face) runs face recognition to bind `track_id → student/teacher id`.
   The binding is remembered for the rest of the track, so re-ID
   continues even after the face is gone.
5. Maps the person's foot position into the camera's configured zones
   (`seat_front`, `seat_middle`, `seat_back`, `doorway`) and emits:
   - `enter` when a new track appears at a doorway zone
   - `exit` when a track ends near a doorway
   - `zone_change` when the person moves between seat zones
   - `face_confirm` when the scheduled teacher's face is first matched

## Configuration

Copy `.env.example` to `.env` and set:

```
GV_INGEST_URL=https://<project>.functions.supabase.co/gv-ingest
GV_INGEST_SECRET=<value of the GV_INGEST_SECRET Cloud secret>

# One block per camera
CAMERAS='[
  {
    "id": "<uuid from the Cameras tab>",
    "rtsp": "rtsp://user:pass@192.168.1.20/stream1",
    "class_key": "Class-6-A",
    "period_map": { "09:00-09:45": "P1", "09:45-10:30": "P2" }
  }
]'
```

## Run

```bash
docker compose up -d
```

or, without Docker:

```bash
pip install -r requirements.txt
python bridge.py
```

## Event payload

Batched every ~2s per camera:

```json
{
  "camera_id": "…",
  "tracks": [
    {
      "local_track_id": "t42",
      "subject_type": "student",
      "subject_id": "STU-101",
      "subject_name": "Alice",
      "confidence": 0.92,
      "last_zone": "seat_front"
    }
  ],
  "events": [
    {
      "local_track_id": "t42",
      "event_type": "enter",
      "subject_type": "student",
      "subject_id": "STU-101",
      "subject_name": "Alice",
      "class_key": "Class-6-A",
      "period_key": "P2",
      "zone": "doorway"
    }
  ]
}
```

Send it with:

```
POST $GV_INGEST_URL
x-bridge-secret: $GV_INGEST_SECRET
Content-Type: application/json
```

## Privacy

The bridge keeps raw frames local. Only structured events and (optionally)
low-res thumbnails on `face_confirm` are uploaded.
