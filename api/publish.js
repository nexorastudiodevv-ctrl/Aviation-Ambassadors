import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

class ConfigurationError extends Error {}

function getFirebaseAdminAuth(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new ConfigurationError('Missing FIREBASE_SERVICE_ACCOUNT configuration.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new ConfigurationError('FIREBASE_SERVICE_ACCOUNT must contain valid JSON.');
  }

  const appName = 'article-publisher';
  let app;
  try {
    app = getApps().find((candidate) => candidate.name === appName)
      || initializeApp({ credential: cert(serviceAccount) }, appName);
  } catch {
    throw new ConfigurationError('FIREBASE_SERVICE_ACCOUNT is not a valid Firebase service account.');
  }

  return getAuth(app);
}

async function dispatchGitHubWorkflow(repo, token, payload) {
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/publish-firebase-articles.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        triggeredBy: 'admin-dashboard',
        articleSlug: payload.slug,
        articleStatus: payload.status
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'GitHub workflow dispatch failed.');
  }

  return { triggered: true };
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

export function createPublishHandler({
  env = process.env,
  verifyAdminToken = (token) => getFirebaseAdminAuth(env).verifyIdToken(token),
  dispatchWorkflow = dispatchGitHubWorkflow
} = {}) {
  return async function handler(req, res) {
    const allowedOrigins = String(env.ADMIN_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const origin = String(req.headers.origin || '').replace(/\/$/, '');

    if (!allowedOrigins.length) {
      sendJson(res, 500, {
        ok: false,
        message: 'Missing ADMIN_ALLOWED_ORIGINS configuration.'
      });
      return;
    }

    if (!origin || !allowedOrigins.includes(origin)) {
      sendJson(res, 403, {
        ok: false,
        message: 'This dashboard origin is not allowed.'
      });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, {
        ok: false,
        message: 'Only POST requests are allowed.'
      });
      return;
    }

    const authorization = String(req.headers.authorization || '');
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      sendJson(res, 401, {
        ok: false,
        message: 'Sign in with an administrator account before publishing.'
      });
      return;
    }

    let claims;
    try {
      claims = await verifyAdminToken(tokenMatch[1]);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        sendJson(res, 500, { ok: false, message: error.message });
        return;
      }
      sendJson(res, 401, {
        ok: false,
        message: 'The Firebase sign-in token is invalid or expired.'
      });
      return;
    }

    if (claims.admin !== true) {
      sendJson(res, 403, {
        ok: false,
        message: 'Publishing requires the Firebase admin claim.'
      });
      return;
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        sendJson(res, 400, { ok: false, message: 'Request body must be valid JSON.' });
        return;
      }
    }

    if (String(body.status || '').trim() !== 'published') {
      sendJson(res, 200, {
        ok: true,
        skipped: true,
        message: 'Article is not published yet.'
      });
      return;
    }

    const slug = String(body.slug || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      sendJson(res, 400, {
        ok: false,
        message: 'Published articles must have a valid slug.'
      });
      return;
    }

    const token = env.GITHUB_TOKEN || env.GH_TOKEN || env.PUBLISH_TOKEN;
    const repo = env.GITHUB_REPOSITORY
      || [env.VERCEL_GIT_REPO_OWNER, env.VERCEL_GIT_REPO_SLUG].filter(Boolean).join('/');

    if (!repo) {
      sendJson(res, 500, {
        ok: false,
        message: 'Missing repository metadata. Set GITHUB_REPOSITORY or Vercel repo environment variables.'
      });
      return;
    }

    if (!token) {
      sendJson(res, 500, {
        ok: false,
        message: 'Missing GitHub token. Set GITHUB_TOKEN in the Vercel project environment.'
      });
      return;
    }

    try {
      const result = await dispatchWorkflow(repo, token, { slug, status: 'published' });
      sendJson(res, 200, {
        ok: true,
        ...result,
        message: 'GitHub publishing workflow started.'
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to trigger GitHub workflow.'
      });
    }
  };
}

export default createPublishHandler();
