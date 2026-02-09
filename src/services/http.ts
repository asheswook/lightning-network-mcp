import { DEFAULT_TIMEOUT_MS } from "../constants.js";

export async function httpGet(
  url: string,
  headers?: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "lightning-mcp-server/1.0", ...headers },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 200)}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function httpPostJson<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "lightning-mcp-server/1.0",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function graphqlQuery<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
  authHeader?: Record<string, string>
): Promise<T> {
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = variables;

  const result = await httpPostJson<{ data?: T; errors?: Array<{ message: string }> }>(
    url,
    body,
    authHeader
  );

  if (result.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  if (!result.data) {
    throw new Error("GraphQL response has no data");
  }

  return result.data;
}
