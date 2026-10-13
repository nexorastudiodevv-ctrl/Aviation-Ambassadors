import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldTriggerBuild, getBuildTriggerMode } from '../scripts/article-publish-utils.mjs';

test('published articles trigger a site build', () => {
  assert.equal(shouldTriggerBuild({ status: 'published' }), true);
});

test('draft articles do not trigger a site build', () => {
  assert.equal(shouldTriggerBuild({ status: 'draft' }), false);
});

test('GitHub Pages can use a Vercel API trigger when configured', () => {
  assert.equal(
    getBuildTriggerMode({
      hostname: 'nexorastudiodevv-ctrl.github.io',
      publishApiUrl: 'https://site-publisher.vercel.app/api/publish'
    }),
    'vercel-api'
  );
});

test('GitHub Pages uses the deferred no-server flow', () => {
  assert.equal(getBuildTriggerMode({ hostname: 'nexorastudiodevv-ctrl.github.io' }), 'static-host');
});

test('localhost still allows the local build trigger', () => {
  assert.equal(getBuildTriggerMode({ hostname: 'localhost' }), 'local-server');
});
