import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map',
]);

// Cache in memoria solo per gli asset con hash nel nome (immutabili).
const assetCache = new Map();

const cacheControlFor = (pathname, ext) => {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (pathname === '/' || pathname === '/index.html') return 'no-cache';
  if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') return 'no-cache';
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=3600';
};

const send = (res, status, body, headers) => {
  res.writeHead(status, headers);
  res.end(body);
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    send(response, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const requestedPath = resolve(join(ROOT, normalize(pathname)));
  const isInsideRoot = requestedPath === ROOT || requestedPath.startsWith(ROOT + sep);

  if (!isInsideRoot) {
    send(response, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const ext = extname(requestedPath).toLowerCase();
  let filePath = requestedPath;
  let body;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      body = await readFile(filePath);
    } else {
      body = await readFile(filePath);
    }
  } catch {
    // SPA fallback: ogni rotta senza estensione torna index.html.
    if (ext && ext !== '.html') {
      send(response, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    filePath = join(ROOT, 'index.html');
    try {
      body = await readFile(filePath);
    } catch {
      send(response, 503, 'Build non trovata. Esegui prima "npm run build".', {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      return;
    }
  }

  const finalPathname = '/' + filePath.slice(ROOT.length + 1).split(sep).join('/');
  const finalExt = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[finalExt] || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': cacheControlFor(finalPathname === '/index.html' ? '/' : finalPathname, finalExt),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  const acceptsGzip = String(request.headers['accept-encoding'] || '').includes('gzip');
  const cacheKey = `${finalPathname}:${body.length}`;
  let payload = body;

  if (COMPRESSIBLE.has(finalExt) && body.length > 1024) {
    const cached = assetCache.get(cacheKey);
    if (cached) {
      payload = cached;
    } else {
      payload = gzipSync(body);
      if (assetCache.size > 64) assetCache.clear();
      assetCache.set(cacheKey, payload);
    }
    if (acceptsGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
    } else {
      payload = body;
    }
  }

  headers['Content-Length'] = String(payload.length);
  if (request.method === 'HEAD') {
    response.writeHead(200, headers);
    response.end();
    return;
  }

  send(response, 200, payload, headers);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Stimia in ascolto su http://0.0.0.0:${PORT} (static: ${ROOT})`);
});
