import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Applies the Lumina deep-space dark theme on the routes that were designed
 * for it (home + attendance). Keeps the rest of the app on its normal theme.
 */
const LUMINA_PATHS = new Set<string>([
  '/',
  '/attendance',
  '/user',
  '/admin',
  '/gate',
  '/gate-vision',
  '/features',
  '/parent',
  '/teacher',
  '/profile',
  '/register',
  '/contact',
  '/portfolio',
  '/login',
  '/signup',
]);

export default function LuminaScope() {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const active = LUMINA_PATHS.has(pathname);

    const syncStoredTheme = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem('ui-theme');
      } catch {
        stored = null;
      }
      root.classList.toggle('dark', stored === 'dark');
    };

    if (active) {
      root.classList.add('lumina', 'dark');
    } else {
      root.classList.remove('lumina');
      syncStoredTheme();
    }

    return () => {
      if (!active) return;
      root.classList.remove('lumina');
      syncStoredTheme();
    };
  }, [pathname]);

  return null;
}
