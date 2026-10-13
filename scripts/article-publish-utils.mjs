export function shouldTriggerBuild(article = {}) {
  return article.status === 'published';
}

export function getBuildTriggerMode({ hostname = '', protocol = '', publishApiUrl = '' } = {}) {
  const host = String(hostname || '').toLowerCase();
  const configuredApiUrl = String(publishApiUrl || '').trim();
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(host)
    || host.endsWith('.local');

  if (isLocalHost || protocol === 'file:') {
    return 'local-server';
  }

  if (configuredApiUrl) {
    return 'vercel-api';
  }

  return 'static-host';
}
