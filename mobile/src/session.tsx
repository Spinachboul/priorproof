import { URL } from 'react-native-url-polyfill';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const storageKey = 'priorproof.session';
export type Session = { server: string; token: string };
type SessionContext = {
  session: Session | null; loading: boolean; lastServer: string;
  loginDemo: (server: string) => Promise<void>;
  signOut: () => Promise<void>;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const Context = createContext<SessionContext | null>(null);

export function serverOrigin(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete server URL, such as http://192.168.1.20:8001.'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use the server origin without a path, credentials or query.');
  }
  const local = /^(localhost|127\.0\.0\.1|10\.(\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Use HTTPS, or a private LAN address for the fictional demo.');
  }
  return url.origin;
}

export function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function responseError(status: number, payload: unknown) {
  const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : null;
  return new ApiError(status, typeof detail === 'string' ? detail : `Request failed (HTTP ${status}).`);
}

async function request<T>(server: string, path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(server + path, { ...init, headers, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw responseError(response.status, body);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(`Could not reach PriorProof at ${server}. Open ${server}/api/health in your phone’s browser to check the connection.`);
  } finally {
    clearTimeout(timer);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [lastServer, setLastServer] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef<Session | null>(null);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(storageKey).then(value => {
      if (!active || !value) return;
      const saved: Session = JSON.parse(value);
      if (!saved.token || serverOrigin(saved.server) !== saved.server) return;
      setLastServer(saved.server);
      current.current = saved;
      setSession(saved);
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(storageKey);
    current.current = null;
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  async function loginDemo(serverValue: string) {
    const server = serverOrigin(serverValue);
    const result = await request<{ token: string }>(server, '/api/auth/login', json({ userId: 'user1', password: 'abc123' }));
    if (!result?.token) throw new Error('This server did not return a PriorProof session.');
    const next = { server, token: result.token };
    await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
    queryClient.clear();
    current.current = next;
    setLastServer(server);
    setSession(next);
  }

  const call = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const active = current.current;
    if (!active) throw new Error('Sign in to continue.');
    try {
      return await request<T>(active.server, path, init, active.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && current.current === active) await signOut();
      throw error;
    }
  }, [signOut]);

  return <Context.Provider value={{ session, lastServer, loading, signOut, call, loginDemo }}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Session provider is missing.');
  return value;
}
