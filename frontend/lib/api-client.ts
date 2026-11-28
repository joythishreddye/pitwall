export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** A response that came back with an error status; `status` lets a page tell a missing record (404) from a failure. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`API error: ${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      ...fetchOptions,
      method: "GET",
      signal: fetchOptions.signal ?? AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }

    return response.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      ...fetchOptions,
      method: "POST",
      signal: fetchOptions.signal ?? AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }

    return response.json() as Promise<T>;
  }
}

export const api = new ApiClient(API_BASE);
