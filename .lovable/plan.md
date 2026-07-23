## Smooth premium loading, PWA-aware splash, MacBook-style nav

Four coordinated changes across app shell, splash, navbars, and route loading.

### 1. Kill the chunky "Skeleton" loading fallback → premium fade shell
Current: `AnimatedRoutes` uses `<Suspense fallback={<Skeleton…>}>` — big grey blocks flash on every route.

Change: replace with a near-invisible fade layer.
- New `RouteFallback` component: transparent placeholder that fades in a subtle progress bar only after 180ms (avoids flash for cached chunks), then fades out on ready.
- Route content itself gets a soft `opacity/translate-y` mount transition (150ms cubic-bezier) so pages feel like they "settle in" instead of pop.
- No skeleton bars anywhere in `Suspense` fallbacks.

### 2. PWA launch: skip in-app splash when the OS already showed the manifest splash
Current: `SplashAnimation` runs 2.2 s on every load, including PWA launches — users see manifest splash → then app splash → then site.

Change in `src/App.tsx`:
- Detect PWA/standalone launch: `matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone`.
- Also detect same-tab returns (`sessionStorage` flag) so refreshes inside the app don't replay the splash.
- If either is true → `showSplash = false` from the first render → straight to the site.
- Web (non-installed) first-load still gets the branded splash but shortened to **1.1 s** with a snappier easing, so the site feels instant.

Also add tiny manifest polish so the OS splash matches the site background (no white flash on Android): confirm `background_color` and `theme_color` in `public/manifest.json`, and add `<meta name="theme-color">` matching the current theme.

### 3. MacBook-style sliding nav pill (both desktop & mobile)
Desktop nav already uses `layoutId="navbar-active-pill"` inside `<LayoutGroup>` — good. Polish it:
- Swap the spring for MacBook-dock feel: `{ type: 'spring', stiffness: 520, damping: 34, mass: 0.9 }`.
- Add hover magnification on siblings (dock-style tiny scale-up on the item under cursor) using `whileHover={{ y: -1, scale: 1.04 }}`.
- Ensure text color transition rides the same easing (no flicker).

Mobile nav (`MobileNavBar.tsx`) currently pops the pill with `AnimatePresence`. Change to a true sliding pill:
- Remove per-item `AnimatePresence` around the pill. Instead render one shared pill using `layoutId="mobile-nav-pill"` on the active item only, so framer-motion slides it horizontally between icons — same physics as desktop.
- Keep icon bounce/glow dot, but drop the `y: [0,-3,0]` re-animate on route change so the slide reads clean.
- Add subtle haptic-timed spring so the pill lands with the tap (`stiffness: 500, damping: 36`).

Result: on tap/click, the pill glides from old tab to new tab in one motion — mac-dock/iPad-tab-bar feel — on both mobile and desktop.

### 4. Preload route chunks so tab switches feel instant
Currently every lazy route waits for its chunk on first click.

Change: add link-hover / viewport prefetching.
- New helper `src/lib/preloadRoute.ts` exposing a `preload(routeKey)` that triggers the same dynamic `import()` used by `lazyWithRetry` (share the promise so it's dedup'd).
- Wire it into nav items:
  - Desktop `Navbar.tsx` links: `onMouseEnter` + `onFocus` → `preload(item.path)`.
  - Mobile `MobileNavBar.tsx` links: `onTouchStart` (fires ~100 ms before click) → `preload`.
- On app idle after splash, `requestIdleCallback` warm-preloads the 4 most common routes for signed-in users: `/attendance`, `/register`, `/profile`, `/admin` (respecting role). Wrapped in `try` so it never blocks.
- No behavior change if browser is offline or on Save-Data — skip via `navigator.connection.saveData`.

### Technical details

Files touched:
- `src/App.tsx` — PWA/session splash gating, shortened splash duration, new `RouteFallback` in `<Suspense>`, idle warm-preload.
- `src/components/SplashAnimation.tsx` — accept `duration` already; no structural change beyond default tuning.
- `src/components/Navbar.tsx` — spring tuning, hover magnify, preload hooks.
- `src/components/mobile/MobileNavBar.tsx` — refactor to single shared `layoutId` pill, remove `AnimatePresence` wrap, preload hooks, calmer icon anim.
- `src/lib/preloadRoute.ts` — new small module keyed to the same imports as `lazyWithRetry`.
- `public/manifest.json` / `index.html` — verify `background_color` + `theme-color` alignment.

Non-goals:
- Not adding a service worker or offline caching — outside the request.
- Not changing route structure, auth, or bundling config.
- Not touching page-level internal loading states (scanners, tables) — only route-level and shell animations.

No backend / DB changes.