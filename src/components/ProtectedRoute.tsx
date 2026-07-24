import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import NotificationPermissionGate from './NotificationPermissionGate';
import { ShieldAlert } from 'lucide-react';
import { hasTeacherAccess } from '@/utils/teacherAccess';

type AppRole = 'admin' | 'principal' | 'teacher' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireRoles?: AppRole[];
}

export function ProtectedRoute({ children, requireAdmin = false, requireRoles }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentRole, setCurrentRole] = useState<AppRole | null>(null);

  const resolveUserRole = async (userId: string): Promise<AppRole> => {
    const db = supabase as any;

    const { data: adminRole } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();

    if (adminRole) return 'admin';

    const { data: principalRole } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'principal')
      .single();

    if (principalRole) return 'principal';

    if (await hasTeacherAccess(userId)) return 'teacher';

    return 'user';
  };

  const hasRequiredRole = (role: AppRole, required?: AppRole[]) => {
    if (!required || required.length === 0) return true;
    return required.includes(role);
  };

  // Paths where the user did NOT ask to be on a protected page. If they sign
  // out while viewing one of these, don't hijack them to /login.
  const PUBLIC_PATHS = new Set<string>([
    '/',
    '/portfolio',
    '/contact',
    '/login',
    '/signup',
    '/unsubscribe',
  ]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!user) {
          setIsAuthenticated(false);
          // Only redirect if this ProtectedRoute is the currently visible route.
          if (!PUBLIC_PATHS.has(window.location.pathname)) {
            navigate('/login', {
              state: {
                from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
              },
            });
          }
          return;
        }

        setIsAuthenticated(true);

        const role = await resolveUserRole(user.id);
        if (cancelled) return;
        setCurrentRole(role);

        const effectiveRequiredRoles = requireAdmin
          ? ['admin'] as AppRole[]
          : requireRoles;

        setIsAuthorized(hasRequiredRole(role, effectiveRequiredRoles));
      } catch (error) {
        console.error('Auth check error:', error);
        if (cancelled) return;
        setIsAuthenticated(false);
        if (!PUBLIC_PATHS.has(window.location.pathname)) {
          navigate('/login', {
            state: {
              from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            },
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes. Because this component may stay mounted in a
    // hidden keep-alive slot, only redirect to /login when the user is
    // actually on a protected route right now — otherwise a sign-out from a
    // public page (like '/' or '/portfolio') would bounce them to Login.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (cancelled) return;
        setIsAuthenticated(false);
        if (!PUBLIC_PATHS.has(window.location.pathname)) {
          navigate('/login', {
            state: {
              from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            },
          });
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // Intentionally not depending on location.* — otherwise every navigation
    // re-runs getUser() and role lookups across every mounted ProtectedRoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, requireAdmin, requireRoles]);

  if (loading) {
    return null;
  }

  if (!isAuthenticated) return null;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-500/15 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Access denied</h1>
          <p className="text-slate-300 text-sm">
            You don’t have permission to view this page.
          </p>
          <p className="text-xs text-slate-400">
            Current role: <span className="text-slate-200 font-medium">{currentRole ?? 'unknown'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <NotificationPermissionGate>
      {children}
    </NotificationPermissionGate>
  );
}
