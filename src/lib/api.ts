/**
 * Centralized API client for backend communication
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const BACKEND_API_KEY = import.meta.env.VITE_BACKEND_API_KEY || '';

interface ApiOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiOptions
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  // Shared-secret backend auth (D-011): send X-API-Key on every backend call
  // when BACKEND_API_KEY is configured on Railway.
  if (BACKEND_API_KEY) {
    headers['X-API-Key'] = BACKEND_API_KEY;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  return response.json();
}

export function get<T>(path: string, options?: ApiOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function post<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function put<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
  return request<T>('PUT', path, body, options);
}

export async function uploadFile<T>(path: string, file: File, options?: ApiOptions): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const formData = new FormData();
  formData.append('file', file);

  // NB: do NOT set Content-Type · the browser must set the multipart boundary.
  // We still send the shared-secret X-API-Key (D-011) so the upload isn't
  // rejected with 401 when BACKEND_API_KEY is enforced on Railway.
  const headers: Record<string, string> = { ...options?.headers };
  if (BACKEND_API_KEY) {
    headers['X-API-Key'] = BACKEND_API_KEY;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
    signal: options?.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Upload error ${response.status}: ${errText}`);
  }

  return response.json();
}
