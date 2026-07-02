export interface FetchJsonOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * fetch() wrapper for the government APIs: parses JSON and retries
 * rate-limited (429) and server (5xx) responses with exponential backoff.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    maxRetries = 3,
    retryDelayMs = 2000,
  } = options;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Request failed with status ${response.status}${
          text ? `: ${text.slice(0, 300)}` : ""
        }`
      );
    }

    const delay = retryDelayMs * 2 ** attempt;
    console.log(
      `[gov-scraper] HTTP ${response.status}, retrying in ${delay}ms (attempt ${
        attempt + 1
      }/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
