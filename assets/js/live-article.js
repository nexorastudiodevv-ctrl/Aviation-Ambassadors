(function () {
  const articleElement = document.getElementById('liveArticle');
  const statusElement = document.getElementById('articleStatus');
  const slug = new URLSearchParams(window.location.search).get('slug') || '';

  function showStatus(message) {
    statusElement.textContent = message;
  }

  function articleDate(value) {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function createAffiliateCta(article) {
    if (!article.affiliateUrl) return null;

    let url;
    try {
      url = new URL(article.affiliateUrl);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || !article.affiliateLabel) return null;

    const wrapper = document.createElement('aside');
    wrapper.className = 'affiliate-cta';
    wrapper.setAttribute('aria-label', 'رابط ترويجي');

    if (article.affiliateDescription) {
      const description = document.createElement('p');
      description.textContent = article.affiliateDescription;
      wrapper.append(description);
    }

    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'sponsored nofollow noopener noreferrer';
    link.textContent = article.affiliateLabel;
    wrapper.append(link);

    const disclosure = document.createElement('small');
    disclosure.textContent = 'إفصاح: قد نحصل على عمولة عند إتمام حجز عبر هذا الرابط، وفق شروط الشركة.';
    wrapper.append(disclosure);
    return wrapper;
  }

  function renderArticle(article) {
    const title = String(article.title || 'مقال سفر');
    document.title = `${title} | سفراء الطيران`;
    const description = article.description || article.excerpt || '';
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const openGraphTitle = document.querySelector('meta[property="og:title"]');
    const openGraphDescription = document.querySelector('meta[property="og:description"]');
    if (descriptionMeta) descriptionMeta.content = description;
    if (openGraphTitle) openGraphTitle.content = title;
    if (openGraphDescription) openGraphDescription.content = description;
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.append(canonicalLink);
    }
    canonicalLink.href = `${window.location.origin}/pages/articles/${encodeURIComponent(slug)}.html`;

    const content = document.createElement('div');
    content.innerHTML = DOMPurify.sanitize(marked.parse(String(article.content || ''), { async: false }), {
      ALLOWED_TAGS: ['a', 'blockquote', 'br', 'code', 'em', 'h2', 'h3', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'ul'],
      ALLOWED_ATTR: ['href', 'title']
    });

    const titleElement = document.createElement('h1');
    titleElement.textContent = title;
    const category = document.createElement('span');
    category.className = 'tag';
    category.textContent = `${article.category || 'عام'}${article.publishedAt ? ` · نُشر في ${articleDate(article.publishedAt)}` : ''}`;

    const children = [];
    if (article.imageUrl) {
      try {
        const imageUrl = new URL(article.imageUrl);
        if (imageUrl.protocol === 'https:') {
          const figure = document.createElement('figure');
          figure.className = 'article-hero';
          const image = document.createElement('img');
          image.src = imageUrl.href;
          image.alt = article.imageAlt || '';
          image.loading = 'eager';
          figure.append(image);
          children.push(figure);
        }
      } catch (error) {
        console.warn('Skipping invalid article image URL:', error);
      }
    }
    children.push(category, titleElement);

    const affiliate = createAffiliateCta(article);
    if (affiliate && article.affiliatePosition === 'top') children.push(affiliate);
    children.push(content);
    if (affiliate && article.affiliatePosition === 'middle') {
      const firstParagraph = content.querySelector('p');
      if (firstParagraph) firstParagraph.after(affiliate);
      else children.push(affiliate);
    } else if (affiliate && article.affiliatePosition !== 'top') {
      children.push(affiliate);
    }

    const footer = document.createElement('div');
    footer.className = 'article-footer';
    const backLink = document.createElement('a');
    backLink.href = 'blog.html';
    backLink.textContent = 'كل أدلة السفر';
    footer.append(backLink);
    children.push(footer);
    articleElement.replaceChildren(...children);
  }

  async function loadArticle() {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      showStatus('رابط المقال غير صالح.');
      return;
    }
    if (!window.firebase || !window.FIREBASE_CONFIG?.projectId || !window.marked || !window.DOMPurify) {
      showStatus('تعذّر تهيئة عرض المقال. أعد تحميل الصفحة بعد قليل.');
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      const snapshot = await firebase.firestore().collection('articles').doc(slug).get();
      if (!snapshot.exists || snapshot.data().status !== 'published') {
        showStatus('المقال غير موجود أو لم يتم نشره بعد.');
        return;
      }
      renderArticle(snapshot.data());
    } catch (error) {
      console.error('Unable to load Firebase article:', error);
      showStatus('تعذّر تحميل المقال الآن. أعد تحميل الصفحة بعد قليل.');
    }
  }

  loadArticle();
})();
