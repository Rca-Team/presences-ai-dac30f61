## Smart AI QR Scanner — Attendance Page

Upgrade `src/components/attendance/QRCodeScanner.tsx` so students can just flash their QR (phone screen OR printed ID card) at the camera and get marked instantly — from farther away, in low light, and even when several students show QRs at once.

### What changes for the user
- **Grab-and-go**: Camera locks onto QR from ~30–80 cm, even small phone screens or printed ID cards.
- **Multi-QR**: If two or three students show QRs in the same frame, all are queued and marked in sequence.
- **Low-light aware**: Auto-brightness/contrast boost; torch auto-suggest when the frame is dark.
- **Rear camera by default** for smart-board/kiosk use, with flip still available.
- **Big success card + beep**, then keeps scanning automatically — no button taps needed.

### Detection pipeline (technical)

```text
video frame (60fps preview)
   ↓  every ~50ms
downscale to 720w  ─►  BarcodeDetector (native, multi-code)
   │                      └─ found? → decode all, queue each
   ↓ if empty
center-ROI upscale (1.6x) ─► BarcodeDetector / jsQR
   ↓ if empty (miss streak ≥ 3)
adaptive: increase contrast + invert pass ─► jsQR
```

- Keep existing 12–15 fps decode cadence; add multi-scale + inverted pass only on miss-streak to save CPU.
- Use `detector.detect()` array output (native BarcodeDetector already returns multiple) — process every unique QR per frame instead of only the first.
- Per-student cooldown map (already exists) prevents re-marking; extend TTL to 15 s and key on `user_id || employee_id`.

### Camera & focus
- Default `facingMode: 'environment'`.
- Enable `focusMode: 'continuous'` + `exposureMode: 'continuous'` on stream track when supported (already partial — make it default-on).
- Ambient-light heuristic: sample average luma every 2 s; if `< 60` show a subtle "Low light — tap ⚡ for torch" hint.
- Physical ID cards benefit from the same pipeline; the inverted + high-contrast pass specifically improves printed/glossy QR recognition.

### UI
- Keep current premium frame; add:
  - Multi-target overlay: draw a small check-badge over each detected QR's bounding box (from `detector.detect()` cornerPoints).
  - Big success card (name + ID + time) that auto-dismisses in 1.2 s, then camera keeps scanning.
  - Success beep + short vibration (already partly wired).
- No manual "Start/Stop" needed in autostart mode; controls stay hidden when `hideManualControls`.

### Files touched
- `src/components/attendance/QRCodeScanner.tsx` — detection loop, multi-QR handling, adaptive passes, ambient-light hint, success card, default camera.

No backend or schema changes. No other pages affected.