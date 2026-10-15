(function () {
  const cardsContainer = document.getElementById('homeArticleCards');
  if (!cardsContainer) return;
  if (!window.firebase || !window.FIREBASE_CONFIG?.projectId) {
    console.error('Firebase is not configured for the homepage article list.');
    return;
  }

  function toDate(value) {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  function createCard(article) {
    const card = document.createElement('article');
    card.className = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';

    const category = document.createElement('p');
    category.className = 'text-xs font-bold text-ink-soft/75';
    category.textContent = article.category || 'عام';

    const title = document.createElement('h3');
    title.className = 'mt-3 text-xl font-black';
    title.textContent = article.title || 'مقال سفر';

    const excerpt = document.createElement('p');
    excerpt.className = 'mt-3 text-sm leading-7 text-slate-600';
    excerpt.textContent = article.excerpt || '';

    const link = document.createElement('a');
    link.href = `pages/article.html?slug=${encodeURIComponent(article.id)}`;
    link.className = 'mt-4 inline-block font-bold text-ink-soft hover:text-ink';
    link.textContent = 'اقرأ المقال ←';

    card.append(category, title, excerpt, link);
    return card;
  }

  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  firebase.firestore().collection('articles')
    .where('status', '==', 'published')
    .onSnapshot((snapshot) => {
      const articles = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((left, right) => toDate(right.publishedAt) - toDate(left.publishedAt))
        .slice(0, 3);

      if (articles.length) {
        cardsContainer.replaceChildren(...articles.map(createCard));
      }
    }, (error) => {
      console.error('Unable to load published Firebase articles on the homepage:', error);
    });
})();
