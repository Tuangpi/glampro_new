import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import type { ApiErrorBody, ApiResponse, PaginatedResponse, QueryParams } from "@glampro/shared";

import { showToast } from "@/components/ui/toast-store";
import { clearSession, getAccessToken, setAuthNotice } from "@/lib/auth-storage";
import { normalisePaginated } from "@/lib/apiUtils";

/**
 * The single axios instance for the whole app.
 *
 * `baseURL` is a same-origin `/api` in both development (Vite proxy) and
 * production (nginx), so no CORS configuration is needed in the browser.
 */
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const status: number | undefined = error.response?.status;

    if (status === 401) {
      const hadToken = Boolean(getAccessToken());
      clearSession();

      if (hadToken) {
        const data = error.response?.data as Partial<ApiErrorBody> | undefined;
        if (data?.code === "SESSION_INVALIDATED" || data?.code === "SESSION_EXPIRED") {
          setAuthNotice(data.message ?? "Your session has expired. Please log in again.");
        }
        // Hard redirect: the session is gone, so nothing in the React tree is
        // worth preserving.
        window.location.assign("/login");
      }
    } else if (status !== undefined && status >= 500) {
      // Surface unexpected server failures globally; pages still handle their
      // own 4xx cases.
      const data = error.response?.data as Partial<ApiErrorBody> | undefined;
      showToast("error", data?.message ?? "An unexpected server error occurred. Please try again.");
    }

    return Promise.reject(error);
  },
);

export function buildQueryString(params?: QueryParams): string {
  if (!params) return "";

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/** GET returning unwrapped data (envelopes are transparently unwrapped). */
export async function get<T>(url: string, params?: QueryParams): Promise<T> {
  const response = await api.get<ApiResponse<T> | T>(url + buildQueryString(params));
  return extractData<T>(response.data);
}

/** GET returning a `PaginatedResponse`, normalised from any supported shape. */
export async function getPaginated<T>(
  url: string,
  params?: QueryParams,
  dataKey = "data",
): Promise<PaginatedResponse<T>> {
  const response = await api.get<unknown>(url + buildQueryString(params));
  return normalisePaginated<T>(response.data as Record<string, unknown>, dataKey);
}

export async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.post<ApiResponse<T> | T>(url, data);
  return extractData<T>(response.data);
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.put<ApiResponse<T> | T>(url, data);
  return extractData<T>(response.data);
}

export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.patch<ApiResponse<T> | T>(url, data);
  return extractData<T>(response.data);
}

export async function del<T>(url: string): Promise<T> {
  const response = await api.delete<ApiResponse<T> | T>(url);
  return extractData<T>(response.data);
}

/**
 * Unwraps `{ data: T }` when present, so endpoints may return either shape
 * while the mobile client keeps its historical contract.
 */
function extractData<T>(payload: ApiResponse<T> | T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiResponse<T>).data;
  }
  return payload as T;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "statusCode" in value && "message" in value;
}

/** Human-readable message for any thrown value (axios error, HttpError body, Error). */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (isApiErrorBody(data)) return data.message;
    return error.message;
  }
  if (isApiErrorBody(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

/** Field-level validation problems from a 422, keyed by dotted request path. */
export function getValidationDetails(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {};

  const details = (error.response?.data as Partial<ApiErrorBody> | undefined)?.details;
  if (!Array.isArray(details)) return {};

  return details.reduce<Record<string, string>>((accumulator, entry) => {
    if (entry && typeof entry === "object" && "path" in entry && "message" in entry) {
      const { path, message } = entry as { path: string; message: string };
      accumulator[path] = message;
    }
    return accumulator;
  }, {});
}

export default api;
