/** Dependency-free local preview: node tools/serve-web.mjs [directory] [port]. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const isWithin = (root, path) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export async function startStaticServer({ directory = 'dist', port = 0 } = {}) {
  const root = await realpath(resolve(directory));
  const index = resolve(root, 'index.html');
  if (!(await stat(index)).isFile()) throw new Error(`No web build found in ${root}`);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }

  const handle = async (req, res) => {
    const send = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      send(405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.includes('\0')) throw new Error('Invalid path');
    } catch {
      send(400, 'Invalid path');
      return;
    }
    let path = resolve(root, `.${pathname}`);
    if (!isWithin(root, path)) {
      send(403, 'Forbidden');
      return;
    }

    let info;
    try {
      info = await stat(path);
      if (info.isDirectory()) {
        path = resolve(path, 'index.html');
        info = await stat(path);
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      // Expo's single-page export can serve extensionless application routes.
      if (extname(pathname)) {
        send(404, 'Not found');
        return;
      }
      path = index;
      info = await stat(path);
    }
    if (!info.isFile() || !isWithin(root, await realpath(path))) {
      send(403, 'Forbidden');
      return;
    }

    let start = 0;
    let end = info.size - 1;
    let status = 200;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range && (range[1] || range[2])) {
        start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
      }
      if (!range || (!range[1] && !range[2]) || start > end || end < 0 || start >= info.size) {
        res.setHeader('Content-Range', `bytes */${info.size}`);
        send(416, 'Requested range not satisfiable');
        return;
      }
      status = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    res.writeHead(status, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': Math.max(0, end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD' || info.size === 0) res.end();
    else await pipeline(createReadStream(path, { start, end }), res);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.destroyed) return;
      if (res.headersSent) res.destroy(error);
      else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Could not serve this file');
      }
    });
  });
  let closing;
  const close = () => {
    closing ||= new Promise((resolveClose, reject) => {
      server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolveClose();
      });
      server.closeAllConnections();
    });
    return closing;
  };

  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolveListen();
      });
    });
    return { url: `http://127.0.0.1:${server.address().port}`, close };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const server = await startStaticServer({
      directory: process.argv[2] || process.env.DIST || 'dist',
      port: Number(process.argv[3] || process.env.PORT || 0),
    });
    console.log(`Deep Breather preview: ${server.url}`);
    const stop = () => server.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
