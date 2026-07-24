#!/usr/bin/env python3
"""Gate Mode 2.0 camera bridge (reference).

Runs YOLOv8n + ByteTrack on every configured RTSP stream, calls the
existing face-recognition endpoint on best frames to bind tracks to
identities, and posts batched track/event updates to the gv-ingest
edge function.

This is a reference implementation — tune thresholds and zone geometry
to your site.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from threading import Thread
from typing import Optional

import cv2  # opencv-python-headless
import requests
from shapely.geometry import Point, Polygon  # pip install shapely
from ultralytics import YOLO  # pip install ultralytics
import supervision as sv  # pip install supervision

INGEST_URL = os.environ["GV_INGEST_URL"]
INGEST_SECRET = os.environ["GV_INGEST_SECRET"]
CAMERAS = json.loads(os.environ["CAMERAS"])
FACE_MATCH_URL = os.environ.get("FACE_MATCH_URL")  # your recognizer HTTP endpoint

BATCH_INTERVAL_S = 2.0
DETECT_EVERY_N = 3  # roughly ~5 fps out of 15 fps decode
BEST_FRAME_MIN_BOX_PX = 120


@dataclass
class TrackState:
    local_id: str
    subject_type: str = "unknown"
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    confidence: float = 0.0
    last_zone: Optional[str] = None
    best_box_area: float = 0.0
    dirty: bool = True
    ended: bool = False


@dataclass
class CameraCtx:
    id: str
    rtsp: str
    class_key: Optional[str]
    zones: dict[str, Polygon] = field(default_factory=dict)
    tracks: dict[str, TrackState] = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)


def zone_for_point(zones: dict[str, Polygon], x: float, y: float) -> Optional[str]:
    p = Point(x, y)
    for name, poly in zones.items():
        if poly.contains(p):
            return name
    return None


def recognize_face(bgr) -> Optional[dict]:
    """Call your face match endpoint. Return {type,id,name,confidence} or None."""
    if not FACE_MATCH_URL:
        return None
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        return None
    try:
        r = requests.post(FACE_MATCH_URL, files={"image": ("f.jpg", buf.tobytes())}, timeout=3)
        if r.ok:
            return r.json()
    except Exception:
        return None
    return None


def flush(ctx: CameraCtx) -> None:
    tracks_out = [
        dict(
            local_track_id=t.local_id,
            subject_type=t.subject_type,
            subject_id=t.subject_id,
            subject_name=t.subject_name,
            confidence=t.confidence,
            last_zone=t.last_zone,
            ended=t.ended,
        )
        for t in ctx.tracks.values()
        if t.dirty or t.ended
    ]
    events_out = ctx.events
    if not tracks_out and not events_out:
        return
    payload = {"camera_id": ctx.id, "tracks": tracks_out, "events": events_out}
    try:
        requests.post(
            INGEST_URL,
            headers={"x-bridge-secret": INGEST_SECRET, "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=5,
        )
    except Exception as ex:
        print(f"[{ctx.id}] ingest error: {ex}")
        return
    for t in ctx.tracks.values():
        t.dirty = False
    ctx.events = []
    # Drop ended tracks after flush so we don't keep re-sending them
    for tid in [k for k, v in ctx.tracks.items() if v.ended]:
        ctx.tracks.pop(tid, None)


def run_camera(cam_conf: dict) -> None:
    ctx = CameraCtx(
        id=cam_conf["id"],
        rtsp=cam_conf["rtsp"],
        class_key=cam_conf.get("class_key"),
        zones={
            name: Polygon(pts)
            for name, pts in (cam_conf.get("zones") or {}).items()
        },
    )
    model = YOLO("yolov8n.pt")
    tracker = sv.ByteTrack()

    cap = cv2.VideoCapture(ctx.rtsp)
    if not cap.isOpened():
        print(f"[{ctx.id}] cannot open {ctx.rtsp}")
        return

    frame_i = 0
    last_flush = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(1)
            cap = cv2.VideoCapture(ctx.rtsp)
            continue
        frame_i += 1
        if frame_i % DETECT_EVERY_N:
            continue

        # Detect persons (class 0 in COCO)
        results = model(frame, classes=[0], verbose=False)[0]
        det = sv.Detections.from_ultralytics(results)
        det = tracker.update_with_detections(det)

        seen_ids = set()
        for xyxy, _, conf, _, tid, _ in det:
            if tid is None:
                continue
            local_id = str(int(tid))
            seen_ids.add(local_id)
            x1, y1, x2, y2 = map(int, xyxy)
            foot_x, foot_y = (x1 + x2) / 2, y2
            zone = zone_for_point(ctx.zones, foot_x, foot_y)
            area = float((x2 - x1) * (y2 - y1))

            state = ctx.tracks.get(local_id)
            new = state is None
            if new:
                state = TrackState(local_id=local_id, last_zone=zone, confidence=float(conf))
                ctx.tracks[local_id] = state
                if zone == "doorway":
                    ctx.events.append(dict(
                        local_track_id=local_id, event_type="enter",
                        subject_type=state.subject_type, subject_id=state.subject_id,
                        subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                    ))
            if state.last_zone != zone:
                ctx.events.append(dict(
                    local_track_id=local_id, event_type="zone_change",
                    subject_type=state.subject_type, subject_id=state.subject_id,
                    subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                ))
                state.last_zone = zone
                state.dirty = True

            # Best-frame face recognition for unknown tracks
            if state.subject_type == "unknown" and area > BEST_FRAME_MIN_BOX_PX ** 2 and area > state.best_box_area:
                state.best_box_area = area
                crop = frame[max(0, y1):y2, max(0, x1):x2]
                match = recognize_face(crop)
                if match and match.get("id"):
                    state.subject_type = match.get("type", "student")
                    state.subject_id = match.get("id")
                    state.subject_name = match.get("name")
                    state.confidence = float(match.get("confidence", 0.9))
                    state.dirty = True
                    ctx.events.append(dict(
                        local_track_id=local_id, event_type="face_confirm",
                        subject_type=state.subject_type, subject_id=state.subject_id,
                        subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                    ))

        # Tracks that disappeared this pass -> exit
        for tid, state in list(ctx.tracks.items()):
            if tid not in seen_ids and not state.ended:
                state.ended = True
                ctx.events.append(dict(
                    local_track_id=tid, event_type="exit",
                    subject_type=state.subject_type, subject_id=state.subject_id,
                    subject_name=state.subject_name, class_key=ctx.class_key,
                    zone=state.last_zone,
                ))

        if time.time() - last_flush >= BATCH_INTERVAL_S:
            flush(ctx)
            last_flush = time.time()


def main() -> None:
    threads = [Thread(target=run_camera, args=(c,), daemon=True) for c in CAMERAS]
    for t in threads:
        t.start()
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
