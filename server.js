// A tiny static server for the built game. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);
const cache = new Map();

async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const body = await readFile(path);
  const ext = extname(path);
  const entry = { body, gzip: compressible.has(ext) ? gzipSync(body) : null, type: types[ext] || 'application/octet-stream' };
  cache.set(path, entry);
  return entry;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    const info = await stat(path).catch(() => null);
    if (!info || info.isDirectory()) path = join(root, 'index.html');
    const file = await load(path);
    const hashed = url.pathname.startsWith('/assets/');
    const headers = {
      'content-type': file.type,
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    const gz = file.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gz) headers['content-encoding'] = 'gzip';
    if (file.gzip) headers.vary = 'accept-encoding';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : gz ? file.gzip : file.body);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`Silverback is up on port ${port}`));
