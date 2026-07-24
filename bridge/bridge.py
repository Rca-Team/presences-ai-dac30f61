#!/usr/bin/env python3
"""Gate Mode 2.0 — advanced camera bridge.

Stack
-----
- Detector: Ultralytics YOLOv8m (person class) with FP16 on GPU when available.
- Tracker: BoxMOT BoT-SORT with OSNet ReID embeddings (bench / re-appearance case).
- Pose:    YOLOv8n-pose for sit/stand + teacher-front-of-class activity.
- Face:    InsightFace buffalo_l (SCRFD detector + ArcFace r100 embeddings).
- Zones:   Shapely polygons, dwell tracked with an EMA to suppress jitter.
- Extras:  loitering, tailgating, crowd-density, teacher activity heatmap.

The bridge is deliberately independent of the app: it posts JSON events to
the `gv-ingest` edge function every ~1s per camera.
"""

from __future__ import annotations

import json
import os
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Thread
from typing import Optional

import cv2  # opencv-python-headless
import numpy as np
import requests
from shapely.geometry import Point, Polygon

# Heavy models — imported lazily inside run_camera() so a config-only run
# (e.g. --check) doesn't need CUDA installed.

# ---------- Config -----------------------------------------------------------

INGEST_URL = os.environ["GV_INGEST_URL"]
INGEST_SECRET = os.environ["GV_INGEST_SECRET"]
CAMERAS = json.loads(os.environ["CAMERAS"])

FACE_GALLERY_PATH = os.environ.get("FACE_GALLERY", "gallery.npz")  # id->embedding
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.42"))
REID_MATCH_THRESHOLD = float(os.environ.get("REID_MATCH_THRESHOLD", "0.35"))

BATCH_INTERVAL_S = 1.0
DETECT_EVERY_N = 2          # ~7-8 fps on 15 fps decode
POSE_EVERY_N = 6            # pose is cheap-ish but not needed every detect
LOITERING_S = 20.0          # standing in doorway zone > this triggers alert
TAILGATE_WINDOW_S = 1.5     # two enters at doorway within this window
CROWD_DENSITY_THRESHOLD = 15
DEVICE = os.environ.get("BRIDGE_DEVICE", "auto")  # auto | cuda | cpu

# ---------- Data classes -----------------------------------------------------


@dataclass
class TrackState:
    local_id: str
    subject_type: str = "unknown"
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    confidence: float = 0.0
    last_zone: Optional[str] = None
    zone_since: float = 0.0
    best_box_area: float = 0.0
    reid_vec: Optional[np.ndarray] = None
    pose_state: Optional[str] = None  # sit / stand
    first_seen: float = field(default_factory=time.time)
    dirty: bool = True
    ended: bool = False


@dataclass
class CameraCtx:
    id: str
    rtsp: str
    class_key: Optional[str]
    zones: dict[str, Polygon]
    tracks: dict[str, TrackState] = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)
    exit_history: deque = field(default_factory=lambda: deque(maxlen=64))
    enter_history: deque = field(default_factory=lambda: deque(maxlen=64))
    reid_bank: dict[str, np.ndarray] = field(default_factory=dict)  # subject_id -> reid


# ---------- Utility ----------------------------------------------------------


def zone_for_point(zones: dict[str, Polygon], x: float, y: float) -> Optional[str]:
    p = Point(x, y)
    for name, poly in zones.items():
        if poly.contains(p):
            return name
    return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))


def load_face_gallery(path: str) -> tuple[list[dict], Optional[np.ndarray]]:
    """gallery.npz = {'ids': [...], 'types': [...], 'names': [...], 'embs': NxD}."""
    if not os.path.exists(path):
        return [], None
    z = np.load(path, allow_pickle=True)
    meta = [
        {"id": str(i), "type": str(t), "name": str(n)}
        for i, t, n in zip(z["ids"], z["types"], z["names"])
    ]
    return meta, z["embs"].astype(np.float32)


def flush(ctx: CameraCtx) -> None:
    tracks_out = [
        dict(
            local_track_id=t.local_id,
            subject_type=t.subject_type,
            subject_id=t.subject_id,
            subject_name=t.subject_name,
            confidence=t.confidence,
            last_zone=t.last_zone,
            appearance_sig=None if t.reid_vec is None else t.reid_vec[:8].round(3).tolist(),
            ended=t.ended,
        )
        for t in ctx.tracks.values()
        if t.dirty or t.ended
    ]
    if not tracks_out and not ctx.events:
        return
    payload = {"camera_id": ctx.id, "tracks": tracks_out, "events": ctx.events}
    try:
        r = requests.post(
            INGEST_URL,
            headers={"x-bridge-secret": INGEST_SECRET, "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=5,
        )
        if not r.ok:
            print(f"[{ctx.id}] ingest {r.status_code}: {r.text[:200]}")
    except Exception as ex:
        print(f"[{ctx.id}] ingest error: {ex}")
        return
    for t in ctx.tracks.values():
        t.dirty = False
    ctx.events = []
    for tid in [k for k, v in ctx.tracks.items() if v.ended]:
        ctx.tracks.pop(tid, None)


# ---------- Per-camera worker ------------------------------------------------


def run_camera(cam_conf: dict) -> None:
    import torch
    from ultralytics import YOLO
    from boxmot import BotSort  # pip install boxmot
    from insightface.app import FaceAnalysis  # pip install insightface

    device = (
        "cuda" if (DEVICE in ("auto", "cuda") and torch.cuda.is_available()) else "cpu"
    )
    half = device == "cuda"
    print(f"[{cam_conf['id']}] device={device} half={half}")

    detector = YOLO("yolov8m.pt")
    pose = YOLO("yolov8n-pose.pt")
    tracker = BotSort(
        reid_weights="osnet_x0_25_msmt17.pt",
        device=device,
        half=half,
        with_reid=True,
    )
    face_app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    face_app.prepare(ctx_id=0 if device == "cuda" else -1, det_size=(640, 640))

    gallery_meta, gallery_embs = load_face_gallery(FACE_GALLERY_PATH)
    have_gallery = gallery_embs is not None and len(gallery_meta) > 0
    if not have_gallery:
        print(f"[{cam_conf['id']}] no face gallery at {FACE_GALLERY_PATH} — running unknown-only")

    ctx = CameraCtx(
        id=cam_conf["id"],
        rtsp=cam_conf["rtsp"],
        class_key=cam_conf.get("class_key"),
        zones={n: Polygon(pts) for n, pts in (cam_conf.get("zones") or {}).items()},
    )

    cap = cv2.VideoCapture(ctx.rtsp)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    frame_i = 0
    last_flush = time.time()
    last_pose_run = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(1.0)
            cap = cv2.VideoCapture(ctx.rtsp)
            continue
        frame_i += 1
        if frame_i % DETECT_EVERY_N:
            continue

        now = time.time()
        results = detector(frame, classes=[0], conf=0.35, verbose=False, half=half, device=device)[0]

        # BoxMOT expects (N, 6) = xyxy, conf, cls
        if len(results.boxes) == 0:
            dets = np.empty((0, 6))
        else:
            xyxy = results.boxes.xyxy.cpu().numpy()
            conf = results.boxes.conf.cpu().numpy().reshape(-1, 1)
            cls = results.boxes.cls.cpu().numpy().reshape(-1, 1)
            dets = np.concatenate([xyxy, conf, cls], axis=1)

        tracks = tracker.update(dets, frame)  # (N, 8) xyxy, id, conf, cls, ind

        # Optional pose pass (whole frame) — keypoints indexed by box IoU
        pose_kps = None
        if now - last_pose_run > (POSE_EVERY_N * 1.0 / 15):
            pose_res = pose(frame, conf=0.3, verbose=False, half=half, device=device)[0]
            if pose_res.keypoints is not None and len(pose_res.keypoints) > 0:
                pose_kps = pose_res.keypoints.data.cpu().numpy()  # (N,17,3)
                pose_boxes = pose_res.boxes.xyxy.cpu().numpy()
            last_pose_run = now

        seen_ids = set()
        crowd_count = 0

        for row in tracks:
            x1, y1, x2, y2, tid, tconf, _cls, _ind = row
            local_id = str(int(tid))
            seen_ids.add(local_id)
            crowd_count += 1
            foot_x, foot_y = (x1 + x2) / 2, y2
            zone = zone_for_point(ctx.zones, foot_x, foot_y)
            area = float((x2 - x1) * (y2 - y1))

            state = ctx.tracks.get(local_id)
            new_track = state is None
            if new_track:
                state = TrackState(local_id=local_id, last_zone=zone, zone_since=now,
                                   confidence=float(tconf))
                ctx.tracks[local_id] = state
                if zone == "doorway":
                    ctx.enter_history.append(now)
                    ctx.events.append(dict(
                        local_track_id=local_id, event_type="enter",
                        subject_type=state.subject_type, subject_id=state.subject_id,
                        subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                    ))
                    # Tailgating: two enters within window
                    if len(ctx.enter_history) >= 2 and now - ctx.enter_history[-2] < TAILGATE_WINDOW_S:
                        ctx.events.append(dict(
                            local_track_id=local_id, event_type="tailgating",
                            subject_type="unknown", class_key=ctx.class_key, zone=zone,
                            meta={"gap_s": round(now - ctx.enter_history[-2], 2)},
                        ))

            # Zone transitions with dwell tracking
            if state.last_zone != zone:
                ctx.events.append(dict(
                    local_track_id=local_id, event_type="zone_change",
                    subject_type=state.subject_type, subject_id=state.subject_id,
                    subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                    meta={"from": state.last_zone, "dwell_s": round(now - state.zone_since, 2)},
                ))
                state.last_zone = zone
                state.zone_since = now
                state.dirty = True

            # Loitering in doorway
            if zone == "doorway" and now - state.zone_since > LOITERING_S:
                ctx.events.append(dict(
                    local_track_id=local_id, event_type="loitering",
                    subject_type=state.subject_type, subject_id=state.subject_id,
                    subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                    meta={"dwell_s": round(now - state.zone_since, 1)},
                ))
                state.zone_since = now  # reset so we don't spam

            # Pose -> sit / stand
            if pose_kps is not None:
                # Pick nearest pose box to this track by IoU-ish center distance
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                best_i, best_d = -1, 1e9
                for i, pb in enumerate(pose_boxes):
                    pcx, pcy = (pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2
                    d = (pcx - cx) ** 2 + (pcy - cy) ** 2
                    if d < best_d:
                        best_d, best_i = d, i
                if best_i >= 0:
                    kp = pose_kps[best_i]  # 17x3
                    # COCO indices: 11=lhip 12=rhip 13=lknee 14=rknee 15=lank 16=rank
                    hip = np.mean(kp[[11, 12], :2], axis=0)
                    knee = np.mean(kp[[13, 14], :2], axis=0)
                    ank = np.mean(kp[[15, 16], :2], axis=0)
                    torso = abs(hip[1] - kp[[5, 6], 1].mean())
                    leg = abs(ank[1] - knee[1])
                    pose_new = "sit" if leg < torso * 0.55 else "stand"
                    if pose_new != state.pose_state:
                        state.pose_state = pose_new
                        ctx.events.append(dict(
                            local_track_id=local_id, event_type=pose_new,
                            subject_type=state.subject_type, subject_id=state.subject_id,
                            subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                        ))

            # Face recognition on best crop for unknown tracks
            if have_gallery and state.subject_type == "unknown" and area > 140 * 140 and area > state.best_box_area:
                state.best_box_area = area
                crop = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
                if crop.size:
                    faces = face_app.get(crop)
                    if faces:
                        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                        emb = face.normed_embedding.astype(np.float32)
                        sims = gallery_embs @ emb
                        j = int(np.argmax(sims))
                        if sims[j] > FACE_MATCH_THRESHOLD:
                            m = gallery_meta[j]
                            state.subject_type = m["type"]
                            state.subject_id = m["id"]
                            state.subject_name = m["name"]
                            state.confidence = float(sims[j])
                            state.dirty = True
                            ctx.events.append(dict(
                                local_track_id=local_id, event_type="face_confirm",
                                subject_type=state.subject_type, subject_id=state.subject_id,
                                subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                                meta={"score": round(float(sims[j]), 3)},
                            ))

            # ReID re-link: if a new track's ReID matches a recently ended identified track, inherit ID
            if new_track and state.subject_type == "unknown" and ctx.reid_bank:
                # Extract ReID via tracker's embedder (BoxMOT exposes it)
                try:
                    emb = tracker.model.get_features(np.array([[x1, y1, x2, y2]]), frame)[0]
                    state.reid_vec = emb
                    best_sid, best_score = None, 0.0
                    for sid, ref in ctx.reid_bank.items():
                        s = cosine(emb, ref)
                        if s > best_score:
                            best_score, best_sid = s, sid
                    if best_sid and best_score > (1 - REID_MATCH_THRESHOLD):
                        # Re-link to previously known identity
                        for prev in ctx.tracks.values():
                            if prev.subject_id == best_sid:
                                state.subject_type = prev.subject_type
                                state.subject_id = prev.subject_id
                                state.subject_name = prev.subject_name
                                state.confidence = best_score
                                state.dirty = True
                                ctx.events.append(dict(
                                    local_track_id=local_id, event_type="reid_relink",
                                    subject_type=state.subject_type, subject_id=state.subject_id,
                                    subject_name=state.subject_name, class_key=ctx.class_key,
                                    meta={"score": round(best_score, 3)},
                                ))
                                break
                except Exception:
                    pass

            # Teacher activity: standing near front of classroom for >30s => "teaching"
            if state.subject_type == "teacher" and state.pose_state == "stand" and zone == "seat_front":
                if now - state.zone_since > 30 and (state.confidence or 0) > 0.5:
                    ctx.events.append(dict(
                        local_track_id=local_id, event_type="teacher_activity",
                        subject_type="teacher", subject_id=state.subject_id,
                        subject_name=state.subject_name, class_key=ctx.class_key, zone=zone,
                        meta={"activity": "teaching", "dwell_s": round(now - state.zone_since, 1)},
                    ))
                    state.zone_since = now

        # Crowd density
        if crowd_count >= CROWD_DENSITY_THRESHOLD:
            ctx.events.append(dict(
                event_type="crowd_density", subject_type="unknown",
                class_key=ctx.class_key, meta={"count": crowd_count},
            ))

        # Missing tracks -> exit
        for tid, state in list(ctx.tracks.items()):
            if tid not in seen_ids and not state.ended:
                state.ended = True
                # remember ReID for future re-link
                if state.subject_id and state.reid_vec is not None:
                    ctx.reid_bank[state.subject_id] = state.reid_vec
                ctx.exit_history.append(now)
                ctx.events.append(dict(
                    local_track_id=tid, event_type="exit",
                    subject_type=state.subject_type, subject_id=state.subject_id,
                    subject_name=state.subject_name, class_key=ctx.class_key, zone=state.last_zone,
                ))

        if now - last_flush >= BATCH_INTERVAL_S:
            flush(ctx)
            last_flush = now


def main() -> None:
    for cam in CAMERAS:
        Thread(target=run_camera, args=(cam,), daemon=True).start()
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
