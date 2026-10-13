import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const PORT = Number(process.env.PORT || 3000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(rawUrl) {
  const decoded = decodeURIComponent(rawUrl || '/');
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  return relative || 'index.html';
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStaticFile(filePath) {
  const fileStats = await stat(filePath);
  if (fileStats.isDirectory()) {
    return null;
  }

  const content = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return {
    type: mimeTypes[extension] || 'application/octet-stream',
    content
  };
}

async function runBuildScript() {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build-firebase-articles.mjs'], {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, stdout, stderr });
      } else {
        reject(new Error(stderr || `Build exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, status: 'ready' }));
      return;
    }

    if (pathname === '/api/publish') {
      const rawBody = await readRequestBody(req);
      let payload = {};

      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        payload = {};
      }

      if (payload.status !== 'published') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, skipped: true, message: 'Article is not published yet.' }));
        return;
      }

      try {
        const result = await runBuildScript();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, skipped: false, message: 'Site rebuilt successfully.', ...result }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: error.message || 'Publish build failed.' }));
      }
      return;
    }

    const requestedPath = safePath(pathname);
    const candidate = path.join(rootDir, requestedPath);
    const fileToServe = candidate.startsWith(rootDir) ? candidate : rootDir;

    const staticFile = await serveStaticFile(fileToServe);
    if (!staticFile) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': staticFile.type });
    res.end(staticFile.content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: error.message || 'Server error.' }));
  }
});

server.listen(PORT, () => {
  console.log(`Admin publishing server is running on http://localhost:${PORT}`);
});
