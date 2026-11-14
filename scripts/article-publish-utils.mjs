export function shouldTriggerBuild(article = {}) {
  return article.status === 'published';
}

export function getBuildTriggerMode({ hostname = '', protocol = '' } = {}) {
  const host = String(hostname || '').toLowerCase();
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(host)
    || host.endsWith('.local');

  if (isLocalHost || protocol === 'file:') {
    return 'local-server';
  }

  return 'scheduled-static';
}
