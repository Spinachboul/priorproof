const API_CONFIG = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
const LOGIN_PATH = '/api/auth/login';
export const SESSION_KEY = 'priorproof-token';
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

function apiBase() {
    const base = API_CONFIG || `${window.location.protocol}//${window.location.hostname}:8000`;
    if (window.location.protocol === 'https:' && base.startsWith('http:')) {
        throw new Error('This page uses HTTPS. Configure an HTTPS API URL in NEXT_PUBLIC_API_URL.');
    }
    return base;
}

async function send(path: string, init?: RequestInit, token?: string | null) {
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const base = apiBase();
    try {
        return await fetch(base + path, { ...init, headers, cache: 'no-store' });
    } catch {
        throw new Error(`Could not reach PriorProof at ${base}. Check that the backend is running and allows this website’s origin.`);
    }
}

async function readResponse(response: Response) {
    if (!response.ok) {
        const { detail } = await response.json().catch(() => ({}));
        throw new Error(typeof detail === 'string' ? detail : `Request failed (HTTP ${response.status})`);
    }
    return response.headers.get('content-type')?.includes('application/json') ? response.json() : response;
}

let pendingDemoLogin: Promise<string> | undefined;

export async function signInDemo(): Promise<string> {
    if (!DEMO_MODE) throw new Error('Automatic demo sign-in is disabled for this website.');
    if (pendingDemoLogin) return pendingDemoLogin;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    pendingDemoLogin = send(LOGIN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user1', password: 'abc123' }),
        signal: controller.signal,
    }).then(async response => {
        if (response.status === 403) {
            throw new Error('Demo sign-in is disabled on the backend. Start it with DEMO_LOGIN_ENABLED=1 and fictional demo storage.');
        }
        const result = await readResponse(response);
        if (typeof result?.token !== 'string' || !result.token) {
            throw new Error('PriorProof did not return a demo session. Check the backend URL.');
        }
        return result.token;
    }).finally(() => {
        clearTimeout(timeout);
        pendingDemoLogin = undefined;
    });
    return pendingDemoLogin;
}

function endExpiredSession(token: string | null, error?: string) {
    if (sessionStorage.getItem(SESSION_KEY) !== token) return;
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('priorproof-logout', { detail: error }));
}

export async function api(path: string, init?: RequestInit) {
    const token = path === LOGIN_PATH ? null : sessionStorage.getItem(SESSION_KEY);
    const response = await send(path, init, token);
    if (response.status !== 401 || path === LOGIN_PATH) return readResponse(response);

    let currentToken = sessionStorage.getItem(SESSION_KEY);
    if (DEMO_MODE && token && currentToken) {
        if (currentToken === token) {
            try {
                const renewed = await signInDemo();
                currentToken = sessionStorage.getItem(SESSION_KEY);
                if (currentToken === token) {
                    sessionStorage.setItem(SESSION_KEY, renewed);
                    currentToken = renewed;
                }
            } catch (error) {
                endExpiredSession(token, (error as Error).message);
                throw error;
            }
        }
        if (currentToken) {
            // A 401 from the authentication middleware precedes any case mutation.
            const retried = await send(path, init, currentToken);
            if (retried.status === 401) {
                endExpiredSession(currentToken, 'The backend rejected the renewed demo session. Try signing in again.');
            }
            return readResponse(retried);
        }
    }

    endExpiredSession(token);
    return readResponse(response);
}
