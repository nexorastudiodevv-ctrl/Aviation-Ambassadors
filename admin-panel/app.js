import {
  escapeHtml,
  normalizeArticleSlug,
  saveArticleDocument
} from './article-publish-utils.mjs';

function shouldTriggerBuild(article = {}) {
  return article.status === 'published';
}

const state = {
  currentView: 'dashboard',
  selectedArticleId: null,
  isLoggedIn: false,
  articles: []
};

const views = {
  login: document.getElementById('loginView'),
  dashboard: document.getElementById('dashboardView'),
  editor: document.getElementById('editorView')
};

const form = document.getElementById('articleForm');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');
const editorMessage = document.getElementById('editorMessage');
const saveArticleButton = document.getElementById('saveArticleBtn');
const articlesTableBody = document.getElementById('articlesTableBody');
const editorTitle = document.getElementById('editorTitle');

const fields = {
  title: document.getElementById('titleInput'),
  slug: document.getElementById('slugInput'),
  category: document.getElementById('categoryInput'),
  status: document.getElementById('statusInput'),
  description: document.getElementById('descriptionInput'),
  excerpt: document.getElementById('excerptInput'),
  imageUrl: document.getElementById('imageUrlInput'),
  imageAlt: document.getElementById('imageAltInput'),
  content: document.getElementById('contentInput'),
  affiliateUrl: document.getElementById('affiliateUrlInput'),
  affiliateDescription: document.getElementById('affiliateDescriptionInput'),
  affiliateLabel: document.getElementById('affiliateLabelInput'),
  affiliatePosition: document.getElementById('affiliatePositionInput'),
  publishedAt: document.getElementById('publishedAtInput'),
  articleId: document.getElementById('articleIdInput')
};

let firebaseApp = null;
let db = null;
let auth = null;

function showView(name) {
  state.currentView = name;
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle('hidden', key !== name);
  });
}

function setMessage(text, isError = true) {
  const messageTargets = {
    login: loginMessage,
    dashboard: dashboardMessage,
    editor: editorMessage
  };
  const target = messageTargets[state.currentView] || loginMessage;

  Object.values(messageTargets).forEach((element) => {
    if (element !== target) element.textContent = '';
  });
  target.textContent = text;
  target.style.color = isError ? '#dc2626' : '#16a34a';
}

function resetForm() {
  form.reset();
  fields.status.value = 'published';
  fields.articleId.value = '';
  state.selectedArticleId = null;
  editorTitle.textContent = 'مقال جديد';
}

function generateArticleSlug(title) {
  const readableSlug = title.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  return `${readableSlug || 'article'}-${Date.now()}`;
}

function createExcerpt(content) {
  return content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function getArticlePayload() {
  const title = fields.title.value.trim();
  const content = fields.content.value.trim();
  const excerpt = fields.excerpt.value.trim() || createExcerpt(content);
  const publishedAtValue = fields.publishedAt.value ? new Date(fields.publishedAt.value).toISOString() : new Date().toISOString();
  const slug = normalizeArticleSlug(fields.slug.value);
  fields.slug.value = slug;

  return {
    slug: slug || generateArticleSlug(title),
    title,
    category: fields.category.value.trim() || 'عام',
    status: fields.status.value,
    description: fields.description.value.trim() || excerpt.slice(0, 200),
    excerpt,
    imageUrl: fields.imageUrl.value.trim(),
    imageAlt: fields.imageAlt.value.trim(),
    content,
    affiliateUrl: fields.affiliateUrl.value.trim(),
    affiliateDescription: fields.affiliateDescription.value.trim(),
    affiliateLabel: fields.affiliateLabel.value.trim(),
    affiliatePosition: fields.affiliatePosition.value,
    publishedAt: publishedAtValue,
    updatedAt: new Date().toISOString()
  };
}

function getPublishedArticleValidationError(payload) {
  const requiredFields = [
    ['title', 'العنوان'],
    ['content', 'المحتوى']
  ];
  const missingFields = requiredFields
    .filter(([field]) => !payload[field])
    .map(([, label]) => label);

  if (missingFields.length) {
    return `لا يمكن نشر المقال قبل تعبئة: ${missingFields.join('، ')}.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
    return 'الرابط المختصر يجب أن يتكون من أحرف إنجليزية صغيرة وأرقام وواصلات فقط.';
  }
  if (payload.title.length > 90 || payload.description.length > 200 || payload.excerpt.length > 240) {
    return 'تحقق من أطوال العنوان ووصف SEO والملخص؛ تجاوز أحدها الحد المسموح.';
  }
  if (payload.content.length > 60000) {
    return 'محتوى المقال تجاوز الحد الأقصى وهو 60,000 حرف.';
  }
  if (payload.imageUrl) {
    let imageUrl;
    try {
      imageUrl = new URL(payload.imageUrl);
    } catch {
      return 'رابط صورة المقال غير صالح.';
    }
    if (imageUrl.protocol !== 'https:') {
      return 'رابط صورة المقال يجب أن يبدأ بـ https://.';
    }
    if (!payload.imageAlt) {
      return 'أضف وصفًا بديلًا للصورة قبل النشر.';
    }
  }

  const affiliateValidationError = getAffiliateValidationError(payload);
  if (affiliateValidationError) return affiliateValidationError;

  return '';
}

function getAffiliateValidationError(payload) {
  const hasAffiliateDetails = Boolean(payload.affiliateDescription || payload.affiliateLabel);
  if (!payload.affiliateUrl) {
    return hasAffiliateDetails || payload.affiliatePosition !== 'none'
      ? 'اختر رابط الشركة لإعداد العرض الترويجي، أو اختر «بدون رابط ترويجي».'
      : '';
  }

  let affiliateUrl;
  try {
    affiliateUrl = new URL(payload.affiliateUrl);
  } catch {
    return 'رابط الشركة الترويجي غير صالح.';
  }
  if (affiliateUrl.protocol !== 'https:') {
    return 'رابط الشركة الترويجي يجب أن يبدأ بـ https://.';
  }
  if (!payload.affiliateLabel) {
    return 'اكتب نص زر الرابط الترويجي.';
  }
  if (!['top', 'middle', 'bottom'].includes(payload.affiliatePosition)) {
    return 'اختر موضع ظهور الرابط الترويجي داخل المقال.';
  }

  return '';
}

function renderArticles(list) {
  state.articles = list;

  const published = list.filter(item => item.status === 'published').length;
  const draft = list.filter(item => item.status === 'draft').length;

  document.getElementById('totalArticles').textContent = String(list.length);
  document.getElementById('publishedCount').textContent = String(published);
  document.getElementById('draftCount').textContent = String(draft);

  if (!list.length) {
    articlesTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#6b7280; padding: 30px;">لا توجد مقالات حتى الآن.</td>
      </tr>
    `;
    return;
  }

  articlesTableBody.innerHTML = list.map(article => `
    <tr>
      <td>${escapeHtml(article.title || 'بدون عنوان')}</td>
      <td>${escapeHtml(article.category || '-')}</td>
      <td>${article.status === 'published' ? 'منشور' : 'مسودة'}</td>
      <td>${formatPublishedAt(article.publishedAt)}</td>
      <td>
        <button type="button" class="action-btn edit-btn" data-id="${escapeHtml(article.id)}">تعديل</button>
        <button type="button" class="action-btn delete" data-id="${escapeHtml(article.id)}">حذف</button>
      </td>
    </tr>
  `).join('');

  const editButtons = document.querySelectorAll('.edit-btn');
  const deleteButtons = document.querySelectorAll('.action-btn.delete');

  editButtons.forEach(btn => btn.addEventListener('click', () => openEditorForArticle(btn.dataset.id)));
  deleteButtons.forEach(btn => btn.addEventListener('click', () => deleteArticle(btn.dataset.id)));
}

function formatPublishedAt(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : escapeHtml(date.toLocaleString('ar-EG'));
}

async function loadArticles() {
  if (!db) return;

  const snapshot = await db.collection('articles').orderBy('publishedAt', 'desc').get();
  const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderArticles(list);
}

async function loadArticlesWithFeedback() {
  try {
    await loadArticles();
  } catch (error) {
    console.error(error);
    setMessage(`تعذّر تحميل المقالات: ${error.message || 'حدث خطأ غير معروف.'}`);
  }
}

function fillFormFromArticle(article) {
  fields.title.value = article.title || '';
  fields.slug.value = article.slug || '';
  fields.category.value = article.category || '';
  fields.status.value = article.status || 'draft';
  fields.description.value = article.description || '';
  fields.excerpt.value = article.excerpt || '';
  fields.imageUrl.value = article.imageUrl || '';
  fields.imageAlt.value = article.imageAlt || '';
  fields.content.value = article.content || '';
  fields.affiliateUrl.value = article.affiliateUrl || '';
  fields.affiliateDescription.value = article.affiliateDescription || '';
  fields.affiliateLabel.value = article.affiliateLabel || '';
  fields.affiliatePosition.value = article.affiliatePosition || 'none';
  fields.articleId.value = article.id || '';

  if (article.publishedAt) {
    const date = new Date(article.publishedAt);
    const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    fields.publishedAt.value = localTime;
  }
}

function openEditorForArticle(id) {
  const article = state.articles.find(item => item.id === id);
  if (!article) return;

  state.selectedArticleId = id;
  editorTitle.textContent = 'تعديل المقال';
  fillFormFromArticle(article);
  showView('editor');
}

function getConfiguredPublishApiUrl() {
  const candidates = [
    window.PUBLISH_API_URL,
    window.VERCEL_PUBLISH_API,
    window.BUILD_TRIGGER_API
  ].filter(Boolean);

  return candidates[0] ? String(candidates[0]).trim().replace(/\/$/, '') : '';
}

function getBuildTriggerMode(location = window.location) {
  const host = (location?.hostname || '').toLowerCase();
  const publishApiUrl = getConfiguredPublishApiUrl();
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(host)
    || host.endsWith('.local');

  if (isLocalHost || location?.protocol === 'file:') {
    return 'local-server';
  }

  if (publishApiUrl) {
    return 'vercel-api';
  }

  return 'static-host';
}

async function triggerSiteBuildIfNeeded(payload) {
  if (!shouldTriggerBuild(payload)) {
    return { ok: true, skipped: true };
  }

  const triggerMode = getBuildTriggerMode(window.location);
  const publishApiUrl = getConfiguredPublishApiUrl();

  if (triggerMode === 'vercel-api') {
    const endpoint = publishApiUrl.includes('/api/publish')
      ? publishApiUrl
      : `${publishApiUrl}/api/publish`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, deferred: false, message: result.message || 'تعذّر إرسال الطلب إلى Vercel API.' };
      }

      return { ok: true, skipped: false, result };
    } catch (error) {
      console.error(error);
      return {
        ok: false,
        deferred: false,
        message: 'تعذّر الاتصال بـ Vercel API لتحديث الموقع.'
      };
    }
  }

  if (triggerMode !== 'local-server') {
    return {
      ok: false,
      deferred: true,
      message: 'هذا الموقع يعمل كصفحة ثابتة، لذلك لا يمكن بناء النشرة فورًا من المتصفح. احفظ المقال في Firebase ثم شغّل سير "Publish Firebase articles" في GitHub Actions أو قم بتهيئة رابط Vercel API في إعدادات اللوحة.'
    };
  }

  try {
    const healthResponse = await fetch('/api/health');
    const health = healthResponse.ok
      ? await healthResponse.json().catch(() => null)
      : null;

    if (health?.ok !== true) {
      return {
        ok: false,
        deferred: true,
        message: 'خادم البناء الفوري غير متاح على هذا العنوان.'
      };
    }

    const response = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, deferred: false, message: result.message || 'Build request failed.' };
    }

    return { ok: true, skipped: false, result };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      deferred: true,
      message: 'تعذّر الاتصال بخادم البناء الفوري.'
    };
  }
}

async function saveArticle() {
  if (!db || !auth.currentUser) {
    setMessage('يجب تسجيل الدخول أولاً.');
    return;
  }

  const payload = getArticlePayload();

  if (!payload.title || !payload.slug || !payload.content) {
    setMessage('يرجى تعبئة العنوان، الرابط المختصر والمحتوى.');
    return;
  }

  const originalButtonText = saveArticleButton.textContent || 'حفظ المقال';
  const isPublished = shouldTriggerBuild(payload);
  if (isPublished) {
    const validationError = getPublishedArticleValidationError(payload);
    if (validationError) {
      setMessage(validationError);
      if (!payload.excerpt) fields.excerpt.focus();
      return;
    }
  }
  const affiliateValidationError = getAffiliateValidationError(payload);
  if (affiliateValidationError) {
    setMessage(affiliateValidationError);
    if (!payload.affiliateUrl) fields.affiliateUrl.focus();
    else if (!payload.affiliateLabel) fields.affiliateLabel.focus();
    else fields.affiliatePosition.focus();
    return;
  }

  let articleWasSaved = false;
  saveArticleButton.disabled = true;
  saveArticleButton.textContent = isPublished ? 'جارٍ الحفظ والنشر...' : 'جارٍ الحفظ...';
  setMessage(isPublished ? 'جارٍ حفظ المقال ونشره مباشرة على الموقع...' : 'جارٍ حفظ المسودة...', false);

  try {
    const savedArticleId = await saveArticleDocument(
      db,
      state.selectedArticleId,
      payload,
      new Date().toISOString()
    );
    state.selectedArticleId = savedArticleId;
    fields.articleId.value = savedArticleId;
    articleWasSaved = true;

    const triggerResult = await triggerSiteBuildIfNeeded(payload);
    if (!triggerResult.ok && !triggerResult.skipped) {
      setMessage(triggerResult.message || 'تعذّر نشر المقال بعد الحفظ.');
      return;
    }

    await loadArticles();

    showView('dashboard');
    resetForm();
    setMessage(isPublished
      ? (triggerResult.skipped ? 'تم حفظ المقال بنجاح، لكن النشر تم تأجيله.' : 'تم حفظ المقال ونشره مباشرة على الموقع.')
      : 'تم حفظ المسودة بنجاح.', false);
  } catch (error) {
    console.error(error);
    setMessage(articleWasSaved
      ? `تم حفظ المقال، لكن تعذّر تحديث القائمة: ${error.message}`
      : `فشل حفظ المقال: ${error.message}`);
  } finally {
    saveArticleButton.disabled = false;
    saveArticleButton.textContent = originalButtonText;
  }
}

async function deleteArticle(id) {
  if (!db || !auth?.currentUser) {
    setMessage('سجّل الدخول بحساب المشرف قبل حذف المقال.');
    return;
  }

  const article = state.articles.find(item => item.id === id);
  const confirmed = window.confirm(`هل أنت متأكد من حذف المقال "${article?.title || id}"؟`);
  if (!confirmed) return;

  const deleteButton = [...document.querySelectorAll('.action-btn.delete')]
    .find(button => button.dataset.id === id);
  const originalButtonText = deleteButton?.textContent || 'حذف';
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.textContent = 'جارٍ الحذف...';
  }
  setMessage('جارٍ حذف المقال...', false);

  try {
    await db.collection('articles').doc(id).delete();
    state.articles = state.articles.filter(item => item.id !== id);
    renderArticles(state.articles);
    setMessage('تم حذف المقال بنجاح.', false);
  } catch (error) {
    console.error(error);
    setMessage(error.code === 'permission-denied'
      ? 'رفضت قواعد Firestore الحذف. تأكد أن حسابك يحمل صلاحية المشرف admin.'
      : `فشل حذف المقال: ${error.message || 'حدث خطأ غير معروف.'}`);
  } finally {
    if (deleteButton) {
      deleteButton.disabled = false;
      deleteButton.textContent = originalButtonText;
    }
  }
}

async function initializeFirebase() {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId || window.FIREBASE_CONFIG.projectId.includes('YOUR_')) {
    setMessage('يرجى تحديث ملف firebase-config.js بمعلومات مشروع Firebase الحقيقي.');
    return;
  }

  firebaseApp = firebase.initializeApp(window.FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged((user) => {
    const loggedIn = !!user;
    state.isLoggedIn = loggedIn;
    document.getElementById('logoutBtn').classList.toggle('hidden', !loggedIn);

    if (loggedIn) {
      showView('dashboard');
      loadArticlesWithFeedback();
    } else {
      showView('login');
      resetForm();
    }
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    setMessage('تم تسجيل الدخول بنجاح.', false);
  } catch (error) {
    console.error(error);
    setMessage('بيانات الدخول غير صحيحة أو لا يوجد مستخدم admin.');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await auth.signOut();
});

document.getElementById('loadArticlesBtn').addEventListener('click', loadArticlesWithFeedback);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveArticle();
});
document.querySelector('[data-view="dashboard"]').addEventListener('click', () => {
  if (state.isLoggedIn) {
    showView('dashboard');
  }
});
document.querySelector('[data-view="new-article"]').addEventListener('click', () => {
  if (state.isLoggedIn) {
    resetForm();
    showView('editor');
  }
});

initializeFirebase();
