import { authEnabled, getApiAccessToken } from "../lib/auth-client";
import type { AppBootstrap } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  async function run(refresh = false) {
    const token = await getApiAccessToken(refresh);
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (body && !(body instanceof FormData))
      headers.set("Content-Type", "application/json");
    return fetch(`/api${path}`, {
      method,
      headers,
      credentials: "include",
      signal,
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  }
  let response = await run();
  if (response.status === 401 && authEnabled) response = await run(true);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: { msg: string }) => item.msg).join("; ")
      : detail;
    throw new ApiError(
      response.status,
      message || `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, "GET", undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>(path, "POST", body),
  put: <T>(path: string, body: unknown) => request<T>(path, "PUT", body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, "PATCH", body),
  delete: (path: string) => request<void>(path, "DELETE"),
  getAppBootstrap: () => request<AppBootstrap>("/app-bootstrap"),
  closeAccount: (reason: string | null) =>
    request<void>("/me/close-account", "POST", { reason }),
};
