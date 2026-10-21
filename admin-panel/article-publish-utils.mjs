export function normalizeArticleSlug(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function saveArticleDocument(db, selectedArticleId, payload, createdAt) {
  const articles = db.collection('articles');
  const destinationRef = articles.doc(payload.slug);

  return db.runTransaction(async (transaction) => {
    if (!selectedArticleId) {
      const destinationSnapshot = await transaction.get(destinationRef);
      if (destinationSnapshot.exists) {
        throw new Error('يوجد مقال بهذا الرابط المختصر بالفعل. اختر رابطًا آخر.');
      }

      transaction.set(destinationRef, { ...payload, createdAt });
      return destinationRef.id;
    }

    const sourceRef = articles.doc(selectedArticleId);
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists) {
      throw new Error('تعذّر العثور على المقال الأصلي. حدّث القائمة ثم حاول مجددًا.');
    }

    if (selectedArticleId === payload.slug) {
      transaction.update(sourceRef, payload);
      return sourceRef.id;
    }

    const destinationSnapshot = await transaction.get(destinationRef);
    if (destinationSnapshot.exists) {
      throw new Error('يوجد مقال آخر بهذا الرابط المختصر. اختر رابطًا مختلفًا.');
    }

    const sourceData = sourceSnapshot.data();
    transaction.set(destinationRef, {
      ...payload,
      createdAt: sourceData.createdAt || createdAt
    });
    transaction.delete(sourceRef);
    return destinationRef.id;
  });
}
