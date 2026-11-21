import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { Route, TOP_LEVEL } from './routes';

interface NavState {
  /** Every open screen, bottom first. Lower ones stay mounted (hidden) so they keep their state. */
  stack: Route[];
  current: Route;
  canGoBack: boolean;
  navigate: (route: Route) => void;
  back: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Header title set by the open screen (a bill's category, for example). */
  titleOverride: string | null;
  setTitleOverride: (title: string | null) => void;
}

const NavContext = createContext<NavState | null>(null);

const HOME: Route = { name: 'home' };

/**
 * The app's navigation: a plain stack of routes rendered with ordinary views. No native screen
 * containers, so screen changes never re-parent native views (the Fabric "child already has a
 * parent" crash came from that machinery).
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([HOME]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const navigate = useCallback((route: Route) => {
    setDrawerOpen(false);
    setTitleOverride(null);
    setStack((s) => (TOP_LEVEL.has(route.name) ? [route] : [...s, route]));
  }, []);

  const back = useCallback(() => {
    setTitleOverride(null);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s[0]?.name === 'home' ? s : [HOME]));
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (stack.length > 1 || stack[0]?.name !== 'home') {
        setTitleOverride(null);
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : [HOME]));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, stack]);

  const current = stack[stack.length - 1] ?? HOME;
  const value = useMemo(
    () => ({
      stack,
      current,
      canGoBack: stack.length > 1,
      navigate,
      back,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      titleOverride,
      setTitleOverride,
    }),
    [stack, current, navigate, back, drawerOpen, titleOverride],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavState {
  const value = useContext(NavContext);
  if (value === null) throw new Error('useNav must be used inside <NavProvider>');
  return value;
}
