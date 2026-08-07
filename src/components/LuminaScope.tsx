import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Applies the Lumina deep-space dark theme on the routes that were designed
 * for it (home + attendance). Keeps the rest of the app on its normal theme.
 */
const LUMINA_PATHS = new Set<string>(['/', '/attendance', '/user']);

export default function LuminaScope() {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const active = LUMINA_PATHS.has(pathname);

    if (active) {
      root.classList.add('lumina', 'dark');
    } else {
      root.classList.remove('lumina');
    }

    return () => {
      if (active) root.classList.remove('lumina');
    };
  }, [pathname]);

  return null;
}
