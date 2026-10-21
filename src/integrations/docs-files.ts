import { cp, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

// The docs loader writes the roc docs HTML, the guide images and the fonts here, each at its path on the site.
export const docsFilesDir = (cacheDir: URL) => new URL('rocco-docs/', cacheDir);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const exists = (path: string) => stat(path).then((info) => info.isFile(), () => false);

// Serves the files in dev and copies them into the build. Astro never sees them as pages.
export function docsFiles(): AstroIntegration {
  let root = '';
  return {
    name: 'pixelsprout:docs-files',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(docsFilesDir(config.cacheDir));
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(async (req, res, next) => {
          const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
          const path = join(root, normalize(pathname));
          if (!path.startsWith(root)) return next();
          const index = join(path, 'index.html');
          if (!pathname.endsWith('/') && (await exists(index))) {
            res.writeHead(301, { Location: `${pathname}/` }).end();
            return;
          }
          const file = pathname.endsWith('/') ? index : path;
          if (!(await exists(file))) return next();
          res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
        });
      },
      'astro:build:done': async ({ dir }) => {
        if (await stat(root).then(() => true, () => false)) await cp(root, fileURLToPath(dir), { recursive: true });
      },
    },
  };
}
