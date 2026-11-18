import type { FetchLike } from '../src/lib/github';

export type Route = { status: number; body: unknown };
export type Call = { url: string; headers?: Record<string, string> };

// Answers each URL from routes. A URL with no route rejects, as a network error does.
export function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes[url];
    if (!route) throw new Error(`boom: ${url}`);
    const bytes = route.body instanceof Uint8Array ? route.body : new TextEncoder().encode(String(route.body));
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => String(route.body),
      json: async () => route.body,
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  return { fetch, calls };
}
