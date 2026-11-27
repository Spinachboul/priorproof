const API_CONFIG = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
function apiBase() {
    const base = API_CONFIG || `${window.location.protocol}//${window.location.hostname}:8000`;
    if (window.location.protocol === 'https:' && base.startsWith('http:')) {
        throw new Error('This page uses HTTPS. Configure an HTTPS API URL in NEXT_PUBLIC_API_URL.');
    }
    return base;
}
export async function api(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    const token = sessionStorage.getItem('priorproof-token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const url = apiBase() + path;
    let response: Response;
    try {
        response = await fetch(url, { ...init, headers, cache: 'no-store' });
    } catch {
        throw new Error(`Could not reach PriorProof at ${apiBase()}. Check the backend, network and allowed browser origin.`);
    }
    if (!response.ok) {
        const { detail } = await response.json().catch(() => ({}));
        if (response.status === 401 && path !== '/api/auth/login') {
            sessionStorage.removeItem('priorproof-token');
            window.dispatchEvent(new Event('priorproof-logout'));
        }
        throw new Error(typeof detail === 'string' ? detail : `Request failed (HTTP ${response.status})`);
    }
    return response.headers.get('content-type')?.includes('application/json') ? response.json() : response;
}
