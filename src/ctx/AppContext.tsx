import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Text, View } from 'react-native';
import * as repo from '../db/repo';
import { runSync } from '../lib/driveSync';
import * as auth from '../lib/auth';
import { C, R } from '../lib/theme';

export type SyncStatus = 'signed-out' | 'idle' | 'syncing' | 'error';

interface Ctx {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  profile: auth.GoogleProfile | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: number | null;
  googleReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
};

const SYNC_DEBOUNCE_MS = 4000;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<auth.GoogleProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('signed-out');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'ok' | 'error'; id: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const running = useRef(false);
  const rerun = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedIn = useRef(false);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now();
    setToastMsg({ msg, kind, id });
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  const syncNow = useCallback(async () => {
    if (!signedIn.current) return;
    if (running.current) { rerun.current = true; return; }
    running.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      do {
        rerun.current = false;
        await runSync({
          getAccessToken: auth.getAccessToken,
          getLocal: repo.getSnapshot,
          applyLocal: (s) => repo.applySnapshot(s, 'sync'),
        });
      } while (rerun.current);
      const now = Date.now();
      await repo.setMeta('lastSyncAt', String(now));
      setLastSyncAt(now);
      setSyncStatus('idle');
    } catch (e: any) {
      const msg = String(e?.message || e);
      setSyncError(msg);
      if (/sign in again|Not signed in/i.test(msg)) {
        signedIn.current = false;
        setProfile(null);
        setSyncStatus('signed-out');
      } else {
        setSyncStatus('error');
      }
    } finally {
      running.current = false;
    }
  }, []);

  // Restore a previous session and the last sync time.
  useEffect(() => {
    (async () => {
      const p = await auth.getProfile();
      const last = await repo.getMeta('lastSyncAt');
      if (last) setLastSyncAt(Number(last));
      if (p) {
        signedIn.current = true;
        setProfile(p);
        setSyncStatus('idle');
        syncNow();
      }
    })();
  }, [syncNow]);

  // Sync a few seconds after the user edits something.
  useEffect(() => {
    return repo.subscribe((source) => {
      if (source !== 'local' || !signedIn.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { syncNow(); }, SYNC_DEBOUNCE_MS);
    });
  }, [syncNow]);

  // ...and whenever the app comes back to the foreground (pick up changes from the other phone).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') syncNow(); });
    return () => sub.remove();
  }, [syncNow]);

  const signIn = useCallback(async () => {
    const p = await auth.signIn();
    signedIn.current = true;
    setProfile(p);
    setSyncStatus('idle');
    await syncNow();
  }, [syncNow]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    signedIn.current = false;
    setProfile(null);
    setSyncStatus('signed-out');
    setSyncError(null);
  }, []);

  const value = useMemo<Ctx>(() => ({
    toast, profile, syncStatus, syncError, lastSyncAt, googleReady: auth.googleConfigured(), signIn, signOut, syncNow,
  }), [toast, profile, syncStatus, syncError, lastSyncAt, signIn, signOut, syncNow]);

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastMsg ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: 96, opacity, alignItems: 'center' }}>
          <View style={{
            backgroundColor: toastMsg.kind === 'error' ? C.danger : C.ink, paddingHorizontal: 18, paddingVertical: 12, borderRadius: R.md,
          }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{toastMsg.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </AppCtx.Provider>
  );
}
