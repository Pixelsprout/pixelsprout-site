import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { getTransformedRoutes } from '@vercel/routing-utils';

export type Fault = 'none' | 'recompress-with-header' | 'recompress-body-only';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

// A static server that sends the headers vercel.json declares, through the same route
// conversion that Vercel uses. A fault makes it compress a .br file a second time, as the
// 2025 Vercel bug did.
export async function serveLikeVercel(dir: string, vercelJson: unknown, fault: Fault = 'none') {
  const { routes, error } = getTransformedRoutes(vercelJson as never);
  if (error) throw new Error(error.message);
  const server: Server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const path = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    let body: Buffer;
    try {
      body = await readFile(join(dir, normalize(path)));
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    const headers: Record<string, string> = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' };
    for (const route of routes ?? []) {
      if ('headers' in route && route.headers && new RegExp(route.src).test(path)) Object.assign(headers, route.headers);
    }
    if (fault !== 'none' && path.endsWith('.br')) {
      body = brotliCompressSync(body);
      if (fault === 'recompress-with-header') headers['Content-Encoding'] = 'br, br';
    }
    res.writeHead(200, headers).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
