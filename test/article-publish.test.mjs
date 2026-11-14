import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldTriggerBuild, getBuildTriggerMode } from '../scripts/article-publish-utils.mjs';

test('published articles trigger a site build', () => {
  assert.equal(shouldTriggerBuild({ status: 'published' }), true);
});

test('draft articles do not trigger a site build', () => {
  assert.equal(shouldTriggerBuild({ status: 'draft' }), false);
});

test('hosted publishing does not depend on a Vercel API', () => {
  assert.equal(
    getBuildTriggerMode({
      hostname: 'avam.nexorastudio-eg.com',
      publishApiUrl: 'https://site-publisher.vercel.app/api/publish'
    }),
    'scheduled-static'
  );
});

test('GitHub Pages uses scheduled article publishing', () => {
  assert.equal(getBuildTriggerMode({ hostname: 'nexorastudiodevv-ctrl.github.io' }), 'scheduled-static');
});

test('localhost still allows the local build trigger', () => {
  assert.equal(getBuildTriggerMode({ hostname: 'localhost' }), 'local-server');
});
