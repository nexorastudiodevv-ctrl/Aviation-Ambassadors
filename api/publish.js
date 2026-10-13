async function dispatchGitHubWorkflow(repo, token, payload = {}) {
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
        triggeredBy: 'vercel-api',
        articleSlug: payload.slug || '',
        articleStatus: payload.status || ''
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'GitHub workflow dispatch failed.');
  }

  return { ok: true, triggered: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({
      ok: false,
      message: 'Only POST requests are allowed.'
    });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const status = String(body.status || '').trim();

  if (status !== 'published') {
    res.status(200).json({
      ok: true,
      skipped: true,
      message: 'Article is not published yet.'
    });
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.PUBLISH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY
    || [process.env.VERCEL_GIT_REPO_OWNER, process.env.VERCEL_GIT_REPO_SLUG].filter(Boolean).join('/');

  if (!repo) {
    res.status(500).json({
      ok: false,
      message: 'Missing repository metadata. Set GITHUB_REPOSITORY or Vercel repo env vars.'
    });
    return;
  }

  if (!token) {
    res.status(500).json({
      ok: false,
      message: 'Missing GitHub token. Set GITHUB_TOKEN in the Vercel project environment.'
    });
    return;
  }

  try {
    const result = await dispatchGitHubWorkflow(repo, token, body);
    res.status(200).json({
      ok: true,
      ...result,
      message: 'GitHub workflow dispatch started successfully.'
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message || 'Unable to trigger GitHub workflow.'
    });
  }
}
