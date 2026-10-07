import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { AlertTriangle, LogOut, Save, Trash2 } from 'lucide-react';

export interface NavigationGuardRegistration {
  isDirty: boolean;
  onSave?: () => Promise<void>;
  onDiscard?: () => void;
}

interface NavigationGuardContextValue {
  register: (guard: NavigationGuardRegistration | null) => void;
  requestNavigation: (to: string) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

type PendingAction =
  | { type: 'back' }
  | { type: 'navigate'; to: string }
  | { type: 'close' };

type DialogKind = 'exit' | 'unsaved' | null;

function isDashboard(path: string): boolean {
  return path === '/' || path === '';
}

function parentRoute(path: string): string | null {
  if (path === '/journal/trades/new') return '/journal/trades';
  if (/^\/journal\/trades\/[^/]+\/(review|live)$/.test(path)) {
    return path.replace(/\/(review|live)$/, '');
  }
  if (/^\/journal\/trades\/[^/]+$/.test(path)) return '/journal/trades';
  if (/^\/journal\/daily\/[^/]+$/.test(path)) return '/journal/daily';
  if (/^\/symbols\/[^/]+$/.test(path)) return '/symbols';
  if (/^\/market-context\/[^/]+$/.test(path)) return '/market-context';
  if (/^\/strategies\/[^/]+$/.test(path)) return '/strategies';
  if (path === '/analysis/new' || /^\/analysis\/[^/]+$/.test(path)) return '/analysis';
  return null;
}

function isSameAppTarget(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#/');
}

function getRouteFromHref(href: string): string {
  if (href.startsWith('#/')) return href.slice(1);
  try {
    return new URL(href, window.location.href).pathname + new URL(href, window.location.href).search;
  } catch {
    return href;
  }
}

function navigateWithoutGuard(to: string): void {
  if (window.location.protocol === 'file:') {
    window.location.hash = to.startsWith('#') ? to : `#${to}`;
    return;
  }
  window.history.pushState(null, '', to);
}

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Electron uses hash routing. Its internal hash navigation must never be
  // interpreted as browser Back navigation or as an app-exit request.
  const isElectronRuntime = window.location.protocol === 'file:' || window.electronAPI?.isElectron === true;
  const guardRef = useRef<NavigationGuardRegistration | null>(null);
  const currentLocationRef = useRef(location);
  const currentUrlRef = useRef(window.location.href);
  const allowNextPopRef = useRef(false);
  const allowUnloadRef = useRef(false);
  const routeStackRef = useRef<string[]>([location]);
  const internalBackRef = useRef(false);
  const pendingRef = useRef<PendingAction | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentLocationRef.current = location;
    currentUrlRef.current = window.location.href;
  }, [location]);

  useEffect(() => {
    const stack = routeStackRef.current;
    if (internalBackRef.current) {
      internalBackRef.current = false;
      if (stack[stack.length - 1] !== location) {
        const targetIndex = stack.lastIndexOf(location);
        if (targetIndex >= 0) stack.splice(targetIndex + 1);
        else stack.push(location);
      }
      return;
    }
    if (stack[stack.length - 1] !== location) {
      const existingIndex = stack.lastIndexOf(location);
      if (existingIndex >= 0) stack.splice(existingIndex + 1);
      else stack.push(location);
    }
  }, [location]);

  const register = useCallback((guard: NavigationGuardRegistration | null) => {
    guardRef.current = guard;
  }, []);

  const restoreCurrentUrl = useCallback(() => {
    const current = window.location.href;
    window.history.pushState(null, '', currentUrlRef.current);
    if (window.location.protocol === 'file:') {
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: current, newURL: currentUrlRef.current }));
    }
  }, []);

  const finishAction = useCallback((action: PendingAction) => {
    if (action.type === 'back') {
      const stack = routeStackRef.current;
      const fallback = parentRoute(currentLocationRef.current) ?? '/';
      if (stack.length <= 1) {
        navigateWithoutGuard(fallback);
        return;
      }
      stack.pop();
      internalBackRef.current = true;
      allowNextPopRef.current = true;
      window.history.back();
    } else if (action.type === 'navigate') {
      navigateWithoutGuard(action.to);
    } else {
      allowUnloadRef.current = true;
      window.electronAPI?.confirmClose?.();
    }
  }, []);

  const requestAction = useCallback((action: PendingAction) => {
    const guard = guardRef.current;
    if (guard?.isDirty) {
      pendingRef.current = action;
      setDialog('unsaved');
      return;
    }
    if (action.type === 'close' || (action.type === 'back' && isDashboard(currentLocationRef.current))) {
      pendingRef.current = action;
      setDialog('exit');
      return;
    }
    finishAction(action);
  }, [finishAction]);

  const requestNavigation = useCallback((to: string) => {
    if (to === currentLocationRef.current) return;
    requestAction({ type: 'navigate', to });
  }, [requestAction]);

  useEffect(() => {
    const onPopState = () => {
      // The Electron renderer navigates between modules with location.hash.
      // Do not let a WebView/Chromium popstate caused by that navigation open
      // the dashboard exit confirmation.
      if (isElectronRuntime) return;
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false;
        return;
      }

      const action: PendingAction = { type: 'back' };
      if (guardRef.current?.isDirty || isDashboard(currentLocationRef.current)) {
        restoreCurrentUrl();
        requestAction(action);
      }
    };

    if (isElectronRuntime) return;
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isElectronRuntime, requestAction, restoreCurrentUrl]);

  useEffect(() => {
    let removeNativeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('backButton', () => requestAction({ type: 'back' }))
        .then(handle => { removeNativeListener = () => { void handle.remove(); }; });
    }
    return () => removeNativeListener?.();
  }, [requestAction]);

  useEffect(() => {
    const removeElectronListener = window.electronAPI?.onCloseRequested?.(() => {
      requestAction({ type: 'close' });
    });
    return () => removeElectronListener?.();
  }, [requestAction]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // The Electron main process owns the real window-close lifecycle and
      // sends close-requested to the renderer. A browser beforeunload guard
      // must not participate in Electron's internal route changes.
      if (isElectronRuntime) return;
      if (allowUnloadRef.current || !guardRef.current?.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    if (isElectronRuntime) return;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isElectronRuntime]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || !guardRef.current?.isDirty) return;
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target === '_blank' || target.hasAttribute('download')) return;
      const href = target.getAttribute('href');
      if (!href || !isSameAppTarget(href)) return;
      const destination = getRouteFromHref(href);
      if (destination === currentLocationRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      requestNavigation(destination);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [requestNavigation]);

  const resolveUnsaved = async (choice: 'save' | 'discard' | 'cancel') => {
    if (choice === 'cancel') {
      pendingRef.current = null;
      setDialog(null);
      return;
    }
    const action = pendingRef.current;
    const guard = guardRef.current;
    setBusy(true);
    try {
      if (choice === 'save') await guard?.onSave?.();
      else guard?.onDiscard?.();
      pendingRef.current = null;
      setDialog(null);
      if (action?.type === 'back' && isDashboard(currentLocationRef.current)) {
        pendingRef.current = action;
        setDialog('exit');
      } else if (action) {
        finishAction(action);
      }
    } finally {
      setBusy(false);
    }
  };

  const resolveExit = (confirmed: boolean) => {
    const action = pendingRef.current;
    pendingRef.current = null;
    setDialog(null);
    if (!confirmed) return;
    if (action?.type === 'back' || action?.type === 'close') {
      allowUnloadRef.current = true;
      window.electronAPI?.confirmClose?.();
      if (!window.electronAPI?.confirmClose) {
        if (Capacitor.isNativePlatform()) {
          void CapacitorApp.exitApp();
        } else {
          window.close();
        }
      }
    }
  };

  return (
    <NavigationGuardContext.Provider value={{ register, requestNavigation }}>
      {children}
      <Dialog open={dialog === 'unsaved'} onOpenChange={open => !open && void resolveUnsaved('cancel')}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              تغییرات ذخیره‌نشده
            </DialogTitle>
            <DialogDescription>
              در این صفحه تغییراتی وجود دارد که هنوز ذخیره نشده‌اند. قبل از ترک صفحه چه کاری انجام شود؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void resolveUnsaved('cancel')} disabled={busy}>
              لغو
            </Button>
            <Button variant="destructive" onClick={() => void resolveUnsaved('discard')} disabled={busy}>
              <Trash2 className="ml-2 h-4 w-4" />
              ادامه بدون ذخیره
            </Button>
            <Button onClick={() => void resolveUnsaved('save')} disabled={busy}>
              <Save className="ml-2 h-4 w-4" />
              ذخیره و ادامه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'exit'} onOpenChange={open => !open && resolveExit(false)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-amber-500" />
              خروج از TraderMind؟
            </DialogTitle>
            <DialogDescription>آیا می‌خواهید برنامه به‌طور کامل بسته شود؟</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => resolveExit(false)}>انصراف</Button>
            <Button variant="destructive" onClick={() => resolveExit(true)}>خروج از برنامه</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(guard: NavigationGuardRegistration | null): void {
  const context = useContext(NavigationGuardContext);
  if (!context) throw new Error('useNavigationGuard must be used inside NavigationGuardProvider');
  useEffect(() => {
    context.register(guard);
    return () => context.register(null);
  }, [context, guard]);
}

export function useGuardedNavigation() {
  const context = useContext(NavigationGuardContext);
  if (!context) throw new Error('useGuardedNavigation must be used inside NavigationGuardProvider');
  return context.requestNavigation;
}