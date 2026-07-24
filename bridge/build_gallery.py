#!/usr/bin/env python3
"""Build the face gallery (gallery.npz) from a folder tree.

Layout:
  faces/
    student/<student_id>__<name>/*.jpg
    teacher/<teacher_id>__<name>/*.jpg

Produces gallery.npz with arrays: ids, types, names, embs (ArcFace normed, 512-D).
"""
import os, sys, glob
import numpy as np
from insightface.app import FaceAnalysis
import cv2

ROOT = sys.argv[1] if len(sys.argv) > 1 else "faces"
OUT = sys.argv[2] if len(sys.argv) > 2 else "gallery.npz"

app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))

ids, types, names, embs = [], [], [], []
for kind in ("student", "teacher"):
    for person_dir in sorted(glob.glob(os.path.join(ROOT, kind, "*"))):
        person = os.path.basename(person_dir)
        pid, _, pname = person.partition("__")
        vecs = []
        for img_path in glob.glob(os.path.join(person_dir, "*")):
            img = cv2.imread(img_path)
            if img is None:
                continue
            faces = app.get(img)
            if not faces:
                continue
            face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
            vecs.append(face.normed_embedding.astype(np.float32))
        if not vecs:
            print(f"skip {person}: no faces")
            continue
        emb = np.mean(vecs, axis=0)
        emb /= np.linalg.norm(emb) + 1e-9
        ids.append(pid); types.append(kind); names.append(pname or pid); embs.append(emb)
        print(f"ok {kind}/{pid} ({pname}) [{len(vecs)} imgs]")

np.savez(OUT, ids=np.array(ids), types=np.array(types), names=np.array(names), embs=np.stack(embs))
print(f"wrote {OUT} ({len(ids)} identities)")
