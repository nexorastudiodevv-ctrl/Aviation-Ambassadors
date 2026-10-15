(function () {
  const cardsContainer = document.getElementById('firebaseArticleCards');
  const statusMessage = document.getElementById('firebaseArticlesStatus');
  if (!cardsContainer) return;
  if (!window.firebase || !window.FIREBASE_CONFIG?.projectId) {
    statusMessage.textContent = 'تعذّر الاتصال بخدمة المقالات.';
    return;
  }

  const db = firebase.firestore();

  function toDate(value) {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  function articleDate(value) {
    return toDate(value).toLocaleDateString('ar-EG');
  }

  function createArticleCard(article) {
    const card = document.createElement('article');
    card.className = 'article-card';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${article.category || 'عام'}${article.publishedAt ? ` · نُشر في ${articleDate(article.publishedAt)}` : ''}`;

    const title = document.createElement('h2');
    title.textContent = article.title || 'مقال بدون عنوان';

    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt || '';

    const link = document.createElement('a');
    link.href = `article.html?slug=${encodeURIComponent(article.id)}`;
    link.textContent = `اقرأ المقال: ${article.title || 'اقرأ المقال'}`;

    card.append(tag, title, excerpt, link);
    return card;
  }

  function loadPublishedArticles() {
    db.collection('articles')
      .where('status', '==', 'published')
      .onSnapshot((snapshot) => {
        const articles = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .sort((left, right) => toDate(right.publishedAt) - toDate(left.publishedAt));

        cardsContainer.replaceChildren(...articles.map(createArticleCard));
        if (statusMessage) statusMessage.textContent = '';
      }, (error) => {
        console.error('Unable to load published Firebase articles:', error);
        if (statusMessage) {
          statusMessage.textContent = 'تعذّر تحميل المقالات الجديدة الآن. أعد تحميل الصفحة بعد قليل.';
        }
      });
  }

  loadPublishedArticles();
})();
