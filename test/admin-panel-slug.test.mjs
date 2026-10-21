import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  normalizeArticleSlug,
  saveArticleDocument
} from '../admin-panel/article-publish-utils.mjs';

test('normalizes slugs typed with mobile dash and direction characters', () => {
  assert.equal(
    normalizeArticleSlug('\u200fAIRPORT\u2011TRAVEL\u2013RULES077\u200f'),
    'airport-travel-rules077'
  );
});

test('converts spaces and underscores to single slug separators', () => {
  assert.equal(normalizeArticleSlug('airport  travel_rules'), 'airport-travel-rules');
});

test('leaves unsupported characters for validation to report', () => {
  assert.equal(normalizeArticleSlug('دليل-السفر'), 'دليل-السفر');
});

test('escapes HTML characters before article values are rendered', () => {
  assert.equal(
    escapeHtml(`<img src="x" onerror='alert(1)'>&`),
    '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;'
  );
});

function createMockFirestore(initialDocuments = {}) {
  const documents = new Map(
    Object.entries(initialDocuments).map(([id, data]) => [id, { ...data }])
  );
  const operations = [];
  const db = {
    collection(name) {
      assert.equal(name, 'articles');
      return {
        doc(id) {
          return { id };
        }
      };
    },
    async runTransaction(callback) {
      const transaction = {
        async get(reference) {
          return {
            exists: documents.has(reference.id),
            data: () => documents.get(reference.id)
          };
        },
        set(reference, data) {
          operations.push(['set', reference.id, data]);
          documents.set(reference.id, { ...data });
        },
        update(reference, data) {
          operations.push(['update', reference.id, data]);
          documents.set(reference.id, { ...documents.get(reference.id), ...data });
        },
        delete(reference) {
          operations.push(['delete', reference.id]);
          documents.delete(reference.id);
        }
      };
      return callback(transaction);
    }
  };

  return { db, documents, operations };
}

test('refuses to overwrite an existing article when creating', async () => {
  const { db, documents, operations } = createMockFirestore({
    'existing-article': { title: 'Existing' }
  });

  await assert.rejects(
    saveArticleDocument(db, null, { slug: 'existing-article', title: 'Replacement' }, 'now'),
    /يوجد مقال بهذا الرابط المختصر بالفعل/
  );
  assert.equal(documents.get('existing-article').title, 'Existing');
  assert.deepEqual(operations, []);
});

test('moves an edited article to a new slug without losing its creation date', async () => {
  const { db, documents, operations } = createMockFirestore({
    'old-article': { title: 'Old title', createdAt: 'original-date' }
  });

  const savedId = await saveArticleDocument(
    db,
    'old-article',
    { slug: 'new-article', title: 'Updated title' },
    'fallback-date'
  );

  assert.equal(savedId, 'new-article');
  assert.equal(documents.has('old-article'), false);
  assert.deepEqual(documents.get('new-article'), {
    slug: 'new-article',
    title: 'Updated title',
    createdAt: 'original-date'
  });
  assert.deepEqual(operations.map(([operation]) => operation), ['set', 'delete']);
});

test('refuses to move an edited article onto another article slug', async () => {
  const { db, documents, operations } = createMockFirestore({
    'old-article': { title: 'Old title' },
    'existing-article': { title: 'Existing' }
  });

  await assert.rejects(
    saveArticleDocument(db, 'old-article', { slug: 'existing-article' }, 'now'),
    /يوجد مقال آخر بهذا الرابط المختصر/
  );
  assert.equal(documents.has('old-article'), true);
  assert.equal(documents.get('existing-article').title, 'Existing');
  assert.deepEqual(operations, []);
});
