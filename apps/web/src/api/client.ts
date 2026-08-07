/**
 * Every call goes through the Vite dev-server proxy at `/api` (see
 * vite.config.ts) so the browser sees same-origin requests — required for
 * the httpOnly `SameSite=Strict` session cookie (ADR-0014) to be sent at
 * all. Overridable via `VITE_API_BASE_URL` for tests, which point this at
 * a real local HTTP server instead of the proxy.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function baseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

/** A 401 from these means "this login/signup/token/link was rejected," not "your session expired" — the caller (LoginPage/SignupPage/VerifyEmailPage/ResetPasswordPage) handles it, no redirect (docs/adr/0041). */
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/session',
  '/auth/signup',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 401 && !AUTH_ENDPOINTS.includes(path)) {
    // No token/cookie, or it expired — the dashboard has exactly one
    // place that knows how to re-authenticate, so send the user there
    // rather than letting every call site handle a 401 individually.
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new ApiError(401, 'Not authenticated');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Content download — never JSON, so it bypasses `request()`'s `res.json()` assumption. */
export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${baseUrl()}${path}`, { credentials: 'include' });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return res.blob();
}
