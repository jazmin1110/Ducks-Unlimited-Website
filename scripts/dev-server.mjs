// =============================================================================
// Local dev server: runs the website AND the /api functions on your Mac
// =============================================================================
// Vercel runs /api/*.js for us in production. Locally, this file does the same
// job so you can test checkout end to end without deploying.
//
//   node scripts/dev-server.mjs          → http://localhost:3000
//   PORT=4000 node scripts/dev-server.mjs
//
// It reads secrets from the .env file in the project root (never committed).
// No packages to install. It only uses what comes with Node.
// =============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT   = Number(process.env.PORT || 3000);

// ── Treat /api/*.js as modern "import/export" JavaScript ──
// (Vercel does this automatically; plain Node needs to be told.)
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, next) {
    if (url.includes('/api/') && url.split('?')[0].endsWith('.js')) {
      return next(url, { ...context, format: 'module' });
    }
    return next(url, context);
  }
`), import.meta.url);

// ── Load .env into process.env ──
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
} else {
  console.warn('No .env file found. Copy .env.example to .env and fill it in.');
}
process.env.SITE_URL ||= `http://localhost:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ── Run one /api function with Vercel-style req/res helpers ──
async function runApi(name, req, res) {
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end('Not found');
  }

  // Fresh import each time so code edits show up without a restart
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());

  // Parse a JSON body, unless the function wants the raw bytes (webhooks)
  if (mod.config?.api?.bodyParser !== false && req.method !== 'GET') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
  }
  req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (obj)  => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send   = (body) => { res.end(body); return res; };

  await mod.default(req, res);
}

// ── Serve a file from /public ──
function serveStatic(urlPath, res) {
  let p = decodeURIComponent(urlPath.replace(/^\/rw(\/|$)/, '/')); // vercel.json rewrite
  let file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname.startsWith('/api/')) return await runApi(pathname.slice(5), req, res);
    serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
}).on('error', (err) => {
  // Most common problem: the server is already running in another window
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use: the site is probably already running.`);
    console.error(`Open http://localhost:${PORT}, or stop the other one with:  lsof -ti tcp:${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
}).listen(PORT, () => {
  console.log(`Site + API running at http://localhost:${PORT}`);
  console.log(`Payment provider: ${process.env.PAYMENT_PROVIDER || 'paymongo'}`);
});
