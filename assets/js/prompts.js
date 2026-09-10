(function () {
  'use strict';

  var STORAGE_KEY = 'esteliel.prompt-manager.v1';
  var LOCAL_OWNER_KEY = STORAGE_KEY + '.owner';
  // 普通网站内置提示词；绘画提示词从 assets/data/painting-prompts/ 按文件加载。
  var seedPrompts = [
    {
      id: 'writing-polish',
      title: '文章润色助手',
      category: '写作',
      tags: ['中文', '润色'],
      description: '保留原意，改善一段文字的节奏、清晰度和语气。',
      content: '请帮我润色下面的文字。保留原意和事实，不要凭空补充信息。\n\n要求：\n1. 先给出润色后的版本。\n2. 再用 3 条要点说明主要改动。\n3. 使用自然、克制的中文。\n\n原文：\n{{在这里粘贴文字}}'
    },
    {
      id: 'meeting-summary',
      title: '会议纪要整理',
      category: '工作',
      tags: ['总结', '结构化'],
      description: '将零散的会议记录整理成可执行的纪要。',
      content: '请把下面的会议记录整理成结构清晰的会议纪要。\n\n输出格式：\n- 会议主题\n- 关键结论\n- 待办事项（负责人 / 截止时间 / 状态）\n- 待确认问题\n\n不要猜测记录中没有出现的信息；缺失内容请标记为“待补充”。\n\n会议记录：\n{{在这里粘贴记录}}'
    },
    {
      id: 'code-review',
      title: '代码审查助手',
      category: '编程',
      tags: ['代码', '审查'],
      description: '检查代码质量、潜在问题和改进方向。',
      content: '请审查下面的代码，指出问题并给出改进建议：\n\n{{粘贴代码}}'
    },
    {
      id: 'linux-Terminal',
      title: 'linux终端',
      category: '编程',
      tags: ['终端', '命令'],
      description: '模拟linux终端，执行命令并返回结果。',
      content: '我想让你扮演一个linux终端。我将键入命令，您将回复终端应该显示的内容。我希望您只回复一个唯一代码块内的终端输出，而不是其他任何内容。不要写解释。不要键入命令，除非我指示你这样做。当我需要用英语告诉你一些事情时，我会把文本放在{像这样}的大括号里。我的第一个命令是pwd'
    },
    {
      id: 'idea-expander',
      title: '把想法变成计划',
      category: '思考',
      tags: ['拆解', '行动'],
      description: '从一个模糊的想法出发，拆出下一步能执行的计划。',
      content: '我有一个想法：{{描述想法}}\n\n请先用一句话复述你对它的理解，然后帮我：\n1. 明确目标和成功标准。\n2. 列出实现它需要解决的 3—5 个关键问题。\n3. 给出一个一周内可以开始的最小行动计划。\n4. 指出最大的风险，以及一个低成本的验证方式。'
    }
  ];

  var list = document.getElementById('prompt-list');
  if (!list) return;

  var search = document.getElementById('prompt-search');
  var kindFilter = document.getElementById('prompt-kind');
  var categoryNav = document.getElementById('prompt-category-nav');
  var modelFilter = document.getElementById('prompt-model-filter');
  var syntaxFilter = document.getElementById('prompt-syntax-filter');
  var summary = document.getElementById('prompt-summary');
  var empty = document.getElementById('prompt-empty');
  var emptyTitle = document.getElementById('prompt-empty-title');
  var emptyCopy = document.getElementById('prompt-empty-copy');
  var dialog = document.getElementById('prompt-dialog');
  var previewDialog = document.getElementById('prompt-preview-dialog');
  var previewTitle = document.getElementById('prompt-preview-title');
  var previewCategory = document.getElementById('prompt-preview-category');
  var previewDescription = document.getElementById('prompt-preview-description');
  var previewContent = document.getElementById('prompt-preview-content');
  var previewMeta = document.getElementById('prompt-preview-meta');
  var previewImage = document.getElementById('prompt-preview-image');
  var previewImagePlaceholder = document.getElementById('prompt-preview-image-placeholder');
  var previewImageCounter = document.getElementById('prompt-preview-image-counter');
  var previewThumbs = document.getElementById('prompt-preview-thumbs');
  var form = document.getElementById('prompt-form');
  var importInput = document.getElementById('prompt-import');
  var authStatus = document.getElementById('prompt-auth-status');
  var authDetail = document.getElementById('prompt-auth-detail');
  var signInButton = document.querySelector('[data-action="sign-in"]');
  var signOutButton = document.querySelector('[data-action="sign-out"]');
  var authDialog = document.getElementById('prompt-auth-dialog');
  var authForm = document.getElementById('prompt-auth-form');
  var authEmail = document.getElementById('prompt-auth-email');
  var authMessage = document.getElementById('prompt-auth-message');
  var authSubmit = authForm ? authForm.querySelector('[type="submit"]') : null;
  var formKind = document.getElementById('prompt-form-kind');
  var formPart = document.getElementById('prompt-part');
  var formModel = document.getElementById('prompt-model');
  var formSyntax = document.getElementById('prompt-syntax');
  var imageInput = document.getElementById('prompt-images');
  var imagePreview = document.getElementById('prompt-image-preview');
  var imageFields = document.querySelectorAll('.prompt-image-field');

  var PROMPT_PART_LABELS = {
    complete: '完整提示词',
    style: '画风',
    character: '角色',
    action: '动作',
    clothing: '服装'
  };
  var SYNTAX_LABELS = {
    natural_language: '自然语言',
    danbooru: 'Danbooru 标签',
    mixed: '混合格式',
    other: '其他'
  };
  var DEFAULT_CATEGORIES = ['编程', '办公', '角色卡', '语言', '教育', '设计', '绘画'];
  var BUILTIN_MANIFEST_PATH = 'assets/data/painting-prompts/index.json';
  // 保留已发布过的绘画提示词 ID，避免旧浏览器数据在清单加载失败时变成自定义项。
  var LEGACY_BUILTIN_PROMPT_IDS = ['anime-style'];
  var BUILTIN_PROMPT_IDS = Object.create(null);
  var BUILTIN_PROMPTS = [];
  setBuiltinCatalog(seedPrompts);

  var localState = readLocalPrompts();
  var state = {
    prompts: localState.prompts,
    localPersisted: localState.persisted,
    localOwner: localState.owner,
    query: '',
    kind: 'text',
    space: 'hall',
    shared: [],
    publishedIds: [],
    communityReady: false,
    category: '',
    model: '',
    syntax: '',
    client: null,
    user: null,
    syncing: false,
    formImages: { existing: [], pending: [] },
    preview: { promptId: '', imageIndex: 0 }
  };
  var builtinReady = loadBuiltinPrompts();

  function readLocalPrompts() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Remember persisted builtin identity until the asynchronous catalog arrives.
          parsed.forEach(function (prompt) {
            if (prompt && prompt.isBuiltin === true && prompt.id) BUILTIN_PROMPT_IDS[String(prompt.id)] = true;
          });
          return { prompts: mergeBuiltinPrompts(parsed.map(normalizePrompt).filter(Boolean)), persisted: true, owner: window.localStorage.getItem(LOCAL_OWNER_KEY) || '' };
        }
      }
    } catch (error) {
      // Private browsing and disabled storage should not make the page unusable.
    }
    return { prompts: BUILTIN_PROMPTS.slice(), persisted: false, owner: '' };
  }

  function mergeBuiltinPrompts(prompts) {
    var merged = Object.create(null);
    (prompts || []).forEach(function (prompt) {
      if (prompt) merged[prompt.id] = prompt;
    });
    BUILTIN_PROMPTS.forEach(function (prompt) {
      var current = merged[prompt.id];
      if (!current || current.isBuiltin) merged[prompt.id] = prompt;
    });
    return Object.keys(merged).map(function (id) { return merged[id]; }).sort(function (a, b) {
      return dateValue(b.updatedAt) - dateValue(a.updatedAt);
    });
  }

  function getUserPrompts(prompts) {
    return (prompts || state.prompts).filter(function (prompt) { return !prompt.isBuiltin; });
  }

  function setBuiltinCatalog(prompts) {
    var catalog = Array.isArray(prompts) ? prompts.filter(Boolean) : [];
    var ids = Object.create(null);
    LEGACY_BUILTIN_PROMPT_IDS.forEach(function (id) { ids[id] = true; });
    catalog.forEach(function (prompt) {
      if (prompt && prompt.id) ids[String(prompt.id)] = true;
    });
    BUILTIN_PROMPT_IDS = ids;
    BUILTIN_PROMPTS = catalog.map(function (prompt) {
      return normalizePrompt(Object.assign({}, prompt, { isBuiltin: true }));
    }).filter(Boolean);
  }

  function loadBuiltinPrompts() {
    if (typeof window.fetch !== 'function') return Promise.resolve();
    var manifestUrl = new URL(BUILTIN_MANIFEST_PATH, document.baseURI).toString();
    return window.fetch(manifestUrl, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error('内置绘画提示词清单加载失败：' + response.status);
      return response.json();
    }).then(function (manifest) {
      var files = Array.isArray(manifest) ? manifest : manifest && Array.isArray(manifest.files) ? manifest.files : [];
      files = files.map(function (file) { return String(file || '').trim(); })
        .filter(function (file) { return /^[a-z0-9][a-z0-9._-]*\.json$/i.test(file); })
        .filter(unique);
      var baseUrl = new URL('assets/data/painting-prompts/', document.baseURI);
      return Promise.all(files.map(function (file) {
        return window.fetch(new URL(file, baseUrl).toString(), { credentials: 'same-origin' }).then(function (response) {
          if (!response.ok) throw new Error(file + '：' + response.status);
          return response.json();
        }).catch(function (error) {
          if (window.console && console.error) console.error('Painting builtin prompt failed:', error);
          return null;
        });
      }));
    }).then(function (prompts) {
      setBuiltinCatalog(seedPrompts.concat(prompts.filter(Boolean)));
      state.prompts = mergeBuiltinPrompts(state.prompts);
      if (state.localPersisted) savePrompts();
      render();
    }).catch(function (error) {
      if (window.console && console.error) console.error('Painting builtin catalog failed:', error);
    });
  }

  function savePrompts() {
    state.localPersisted = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prompts));
      if (state.user) {
        state.localOwner = state.user.id;
        window.localStorage.setItem(LOCAL_OWNER_KEY, state.user.id);
      }
    } catch (error) {
      // Keep the in-memory list available if storage is unavailable.
    }
  }

  function normalizePrompt(prompt) {
    if (!prompt || typeof prompt !== 'object') return null;
    var id = String(prompt.id || createId());
    var title = String(prompt.title || '').trim();
    var content = String(prompt.content || '').trim();
    if (!title || !content) return null;
    var tags = Array.isArray(prompt.tags) ? prompt.tags : String(prompt.tags || '').split(/[,，]/);
    var updatedTime = Date.parse(prompt.updatedAt || '');
    var kind = prompt.kind === 'image' ? 'image' : 'text';
    var promptPart = Object.prototype.hasOwnProperty.call(PROMPT_PART_LABELS, prompt.promptPart) ? prompt.promptPart : 'complete';
    var syntax = Object.prototype.hasOwnProperty.call(SYNTAX_LABELS, prompt.syntax) ? prompt.syntax : 'natural_language';
    var exampleImages = Array.isArray(prompt.exampleImages) ? prompt.exampleImages.map(normalizeImage).filter(Boolean).slice(0, 8) : [];
    return {
      id: id,
      sourceId: String(prompt.sourceId || '').slice(0, 240),
      title: title.slice(0, 80),
      category: String(prompt.category || '未分类').trim().slice(0, 30) || '未分类',
      tags: tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean).filter(unique).slice(0, 12),
      description: String(prompt.description || '').trim().slice(0, 160),
      content: content,
      kind: kind,
      promptPart: kind === 'image' ? promptPart : 'complete',
      model: kind === 'image' ? String(prompt.model || '').trim().slice(0, 80) : '',
      syntax: kind === 'image' ? syntax : 'natural_language',
      exampleImages: kind === 'image' ? exampleImages : [],
      isBuiltin: !!BUILTIN_PROMPT_IDS[id] && prompt.isBuiltin !== false,
      updatedAt: Number.isNaN(updatedTime) ? new Date().toISOString() : new Date(updatedTime).toISOString()
    };
  }

  function normalizeImage(image) {
    // 内置提示词可以用简写：exampleImages: ["images/example.png"]。
    var source = typeof image === 'string' ? { url: image } : image;
    if (!source || typeof source !== 'object') return null;
    var path = String(source.path || '').trim().slice(0, 300);
    var url = String(source.url || '').trim().slice(0, 500);
    if (!path && !isImageUrl(url)) return null;
    return {
      path: path,
      name: String(source.name || source.alt || getImageName(url) || '示例图片').trim().slice(0, 120) || '示例图片',
      alt: String(source.alt || source.name || '提示词示例图片').trim().slice(0, 160) || '提示词示例图片',
      url: url
    };
  }

  function isImageUrl(url) {
    var value = String(url || '').trim();
    if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return false;
    return /^https?:\/\//i.test(value) || !/^\/\//.test(value);
  }

  function resolveImageUrl(url) {
    var value = String(url || '').trim();
    if (!isImageUrl(value)) return '';
    try {
      return new URL(value, document.baseURI).toString();
    } catch (error) {
      return '';
    }
  }

  function getImmediateImageUrl(image) {
    return image ? resolveImageUrl(image.url) : '';
  }

  function getImageName(url) {
    var value = String(url || '').split(/[?#]/)[0];
    var parts = value.split('/');
    return parts[parts.length - 1] || '';
  }

  function unique(value, index, values) {
    return values.indexOf(value) === index;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFilteredPrompts() {
    var query = state.query.toLocaleLowerCase();
    return getSpacePrompts().filter(function (prompt) {
      var matchesKind = !state.kind || prompt.kind === state.kind;
      var matchesCategory = !state.category || prompt.category === state.category;
      var matchesModel = !state.model || (prompt.model || '未分类') === state.model;
      var matchesSyntax = !state.syntax || prompt.syntax === state.syntax;
      if (!matchesKind || !matchesCategory || !matchesModel || !matchesSyntax) return false;
      if (!query) return true;
      var searchable = [prompt.title, prompt.category, prompt.description, prompt.content, prompt.model, prompt.promptPart, prompt.syntax].concat(prompt.tags).join(' ').toLocaleLowerCase();
      return searchable.indexOf(query) !== -1;
    });
  }

  function getSpacePrompts() {
    return state.space === 'personal' ? getUserPrompts() : BUILTIN_PROMPTS.concat(state.shared);
  }

  function renderCategories() {
    var prompts = getSpacePrompts().filter(function (prompt) { return prompt.kind === state.kind; });
    var isImage = state.kind === 'image';
    var field = isImage ? 'model' : 'category';
    var selected = isImage ? state.model : state.category;
    var categories = prompts.map(function (prompt) { return prompt[field] || '未分类'; }).filter(unique).sort();
    if (selected && categories.indexOf(selected) === -1) selected = '';
    if (isImage) state.model = selected; else state.category = selected;
    document.getElementById('prompt-category-title').textContent = isImage ? '模型 / 平台' : '场景分类';
    categoryNav.innerHTML = [''].concat(categories).map(function (item) {
      var count = item ? prompts.filter(function (prompt) { return (prompt[field] || '未分类') === item; }).length : prompts.length;
      return '<button class="prompt-category-nav__item" type="button" data-category="' + escapeHtml(item) + '" aria-current="' + (selected === item) + '"><span>' + escapeHtml(item || (isImage ? '全部模型' : '全部场景')) + '</span><small>' + count + '</small></button>';
    }).join('');
    syntaxFilter.parentElement.hidden = !isImage;
    syntaxFilter.innerHTML = '<option value="">全部格式</option>' + Object.keys(SYNTAX_LABELS).map(function (key) { return '<option value="' + key + '">' + SYNTAX_LABELS[key] + '</option>'; }).join('');
    syntaxFilter.value = state.syntax;
    kindFilter.value = state.kind;
    document.querySelectorAll('[data-kind]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.kind === state.kind)); });
    document.querySelectorAll('[data-space]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.space === state.space)); });
    document.getElementById('prompt-page-title').textContent = state.space === 'personal' ? '我的提示词库' : isImage ? '用提示词，打开想象力' : '发现好用的提示词';
    document.getElementById('prompt-page-description').textContent = state.space === 'personal' ? '收藏、创作与整理，让灵感随时可用。' : isImage ? '探索画风、角色与场景，找到下一张作品的灵感。' : '收集灵感，让每一次对话更有价值。';
    document.querySelector('.prompt-meta__actions').hidden = state.space !== 'personal';
  }

  function render() {
    renderCategories();
    var visible = getFilteredPrompts();
    summary.textContent = '找到 ' + visible.length + ' 条提示词';
    var paintingMode = visible.length > 0 && visible.every(function (prompt) { return prompt.kind === 'image'; });
    list.classList.toggle('prompt-grid--painting', paintingMode);
    list.innerHTML = visible.map(renderCard).join('');
    var noPrompts = getSpacePrompts().length === 0;
    empty.hidden = visible.length !== 0;
    emptyTitle.textContent = noPrompts ? '还没有提示词' : '还没有匹配的提示词';
    emptyCopy.textContent = noPrompts ? '新建一条提示词，把常用工作流收进来。' : '换个关键词，或者清除筛选试试。';
    hydrateImageUrls();
    translateUI();
  }

  function cardActions(prompt) {
    var footer = '<button class="button button--quiet" type="button" data-action="copy">复制</button>';
    if (state.space === 'hall') {
      var collected = getUserPrompts().some(function (item) { return item.sourceId === prompt.id; });
      footer += '<button class="button button--quiet" type="button" data-action="favorite"' + (collected ? ' disabled' : '') + '>' + (collected ? '已收藏' : '☆ 收藏') + '</button>';
    } else {
      footer += '<button class="button button--quiet" type="button" data-action="edit">编辑</button>';
      var published = state.publishedIds.indexOf(prompt.id) !== -1;
      footer += '<button class="button button--quiet" type="button" data-action="publish">' + (published ? '更新共享' : '公开共享') + '</button>';
      if (published) footer += '<button class="button button--quiet" type="button" data-action="unpublish">撤回共享</button>';
      footer += '<button class="button button--quiet" type="button" data-action="delete">删除</button>';
    }
    return footer;
  }

  function renderCard(prompt) {
    if (prompt.kind === 'image') return renderPaintingCard(prompt);
    return '<article class="prompt-card" data-prompt-id="' + escapeHtml(prompt.id) + '">' +
      '<header class="prompt-card__header"><span class="prompt-card__symbol" aria-hidden="true">⌘</span><span class="prompt-card__category">' + escapeHtml(prompt.category) + '</span></header>' +
      '<h2><button class="prompt-title-button" type="button" data-action="preview">' + escapeHtml(prompt.title) + '</button></h2>' +
      '<p class="prompt-card__description">' + escapeHtml(prompt.description || '暂无简介') + '</p>' +
      '<pre class="prompt-card__content">' + escapeHtml(prompt.content.slice(0, 260)) + '</pre>' +
      '<div class="prompt-card__tags">' + prompt.tags.map(function (tag) { return '<span class="prompt-tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div>' +
      '<footer class="prompt-card__footer">' + cardActions(prompt) + '</footer></article>';
  }

  function renderPaintingCard(prompt) {
    var firstImage = prompt.exampleImages[0];
    var immediateUrl = getImmediateImageUrl(firstImage);
    var imagePathAttribute = firstImage && firstImage.path && !immediateUrl ? ' data-image-path="' + escapeHtml(firstImage.path) + '"' : '';
    var image = firstImage ? '<img class="prompt-card__image"' + (immediateUrl ? ' src="' + escapeHtml(immediateUrl) + '"' : ' hidden') + imagePathAttribute + ' alt="' + escapeHtml(firstImage.alt) + '">' : '';
    var placeholder = '<span class="prompt-card__image-placeholder"' + (immediateUrl ? ' hidden' : '') + '>' + (firstImage ? '示例图' : '暂无示例图') + '</span>';
    var badges = '<span class="prompt-card__badge">' + escapeHtml(PROMPT_PART_LABELS[prompt.promptPart] || prompt.promptPart) + '</span>';
    if (prompt.model) badges += '<span class="prompt-card__badge">' + escapeHtml(prompt.model) + '</span>';
    badges += '<span class="prompt-card__badge">' + escapeHtml(SYNTAX_LABELS[prompt.syntax] || prompt.syntax) + '</span>';
    var footer = cardActions(prompt);
    return '<article class="prompt-card prompt-card--image prompt-card--gallery" data-prompt-id="' + escapeHtml(prompt.id) + '">' +
      '<button class="prompt-card__visual" type="button" data-action="preview" aria-label="查看：' + escapeHtml(prompt.title) + '">' +
        '<figure class="prompt-card__image-figure">' + image + placeholder + '</figure>' +
        '<span class="prompt-card__visual-shade"></span>' +
        '<span class="prompt-card__visual-copy"><strong>' + escapeHtml(prompt.title) + '</strong><small>' + escapeHtml(prompt.description || '绘画提示词') + '</small></span>' +
        '<span class="prompt-card__visual-badges" aria-label="提示词属性">' + badges + '</span>' +
      '</button>' +
      '<footer class="prompt-card__footer">' + footer + '</footer>' +
      '</article>';
  }

  function hydrateImageUrls() {
    if (!state.client || !state.user || !state.client.storage) return;
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.prompt-card__image[data-image-path]'));
    var paths = nodes.map(function (node) { return node.getAttribute('data-image-path'); }).filter(Boolean).filter(unique);
    if (!paths.length) return;
    state.client.storage.from('prompt-examples').createSignedUrls(paths, 3600).then(function (result) {
      if (result.error) throw result.error;
      var urlByPath = Object.create(null);
      (result.data || []).forEach(function (item) {
        if (item && item.path && item.signedUrl) urlByPath[item.path] = item.signedUrl;
      });
      nodes.forEach(function (node) {
        var path = node.getAttribute('data-image-path');
        var url = urlByPath[path];
        if (!url) return;
        node.src = url;
        node.hidden = false;
        var link = node.closest('.prompt-card__image-link');
        if (link) link.href = url;
        var placeholder = node.parentElement.querySelector('.prompt-card__image-placeholder');
        if (placeholder) placeholder.hidden = true;
      });
    }).catch(function (error) {
      if (window.console && console.error) console.error('Prompt image URL failed:', error);
    });
  }

  function findPrompt(id) {
    return state.prompts.concat(state.shared).find(function (prompt) { return prompt.id === id; });
  }

  function openPreview(prompt) {
    if (!previewDialog || !prompt) return;
    state.preview = { promptId: prompt.id, imageIndex: 0 };
    renderPreview();
    if (typeof previewDialog.showModal === 'function') previewDialog.showModal();
    else previewDialog.setAttribute('open', 'open');
  }

  function closePreview() {
    if (!previewDialog) return;
    if (typeof previewDialog.close === 'function' && previewDialog.open) previewDialog.close();
    else previewDialog.removeAttribute('open');
  }

  function renderPreview() {
    var prompt = findPrompt(state.preview.promptId);
    if (!prompt || !previewDialog) return;
    var images = prompt.exampleImages || [];
    var imageIndex = Math.max(0, Math.min(state.preview.imageIndex, images.length - 1));
    state.preview.imageIndex = images.length ? imageIndex : 0;
    previewTitle.textContent = prompt.title;
    previewCategory.textContent = prompt.category;
    previewDescription.textContent = prompt.description || '绘画提示词';
    previewContent.textContent = prompt.content;
    var meta = [PROMPT_PART_LABELS[prompt.promptPart] || prompt.promptPart];
    if (prompt.model) meta.push(prompt.model);
    meta.push(SYNTAX_LABELS[prompt.syntax] || prompt.syntax);
    if (prompt.kind !== 'image') meta = prompt.tags;
    previewDialog.classList.toggle('prompt-preview-dialog--text', prompt.kind !== 'image');
    previewMeta.innerHTML = meta.map(function (item) {
      return '<span class="prompt-preview__meta-item">' + escapeHtml(item) + '</span>';
    }).join('');

    var previous = document.getElementById('prompt-preview-prev');
    var next = document.getElementById('prompt-preview-next');
    var hasImages = images.length > 0;
    if (previewImageCounter) previewImageCounter.textContent = hasImages ? (state.preview.imageIndex + 1) + ' / ' + images.length : '无示例图';
    if (previous) previous.hidden = !hasImages || images.length < 2;
    if (next) next.hidden = !hasImages || images.length < 2;
    previewThumbs.innerHTML = images.map(function (image, index) {
      var immediateUrl = getImmediateImageUrl(image);
      var imagePathAttribute = image.path && !immediateUrl ? ' data-preview-image-path="' + escapeHtml(image.path) + '"' : '';
      return '<button class="prompt-preview__thumb' + (index === state.preview.imageIndex ? ' is-active' : '') + '" type="button" data-action="preview-image" data-image-index="' + index + '" aria-label="查看第 ' + (index + 1) + ' 张示例图">' +
        '<img' + (immediateUrl ? ' src="' + escapeHtml(immediateUrl) + '"' : '') + imagePathAttribute + ' alt="' + escapeHtml(image.alt) + '">' +
      '</button>';
    }).join('');
    setPreviewImage(prompt, state.preview.imageIndex);
    hydratePreviewThumbs();
    var saveButton = document.querySelector('[data-action="preview-duplicate"]');
    saveButton.disabled = false;
    saveButton.textContent = state.space === 'hall' ? '☆ 收藏' : '复制为自定义';
    translateUI();
  }

  function setPreviewImage(prompt, imageIndex) {
    var images = prompt.exampleImages || [];
    var image = images[imageIndex];
    if (!image) {
      previewImage.hidden = true;
      previewImage.removeAttribute('src');
      previewImagePlaceholder.hidden = false;
      previewImagePlaceholder.textContent = '暂无示例图';
      return;
    }
    var immediateUrl = getImmediateImageUrl(image);
    previewImage.alt = image.alt;
    previewImagePlaceholder.textContent = '示例图加载中……';
    if (immediateUrl) {
      previewImage.src = immediateUrl;
      previewImage.hidden = false;
      previewImagePlaceholder.hidden = true;
    } else {
      previewImage.removeAttribute('src');
      previewImage.hidden = true;
      previewImagePlaceholder.hidden = false;
    }
    if (!immediateUrl && image.path && state.client && state.user && state.client.storage) {
      state.client.storage.from('prompt-examples').createSignedUrls([image.path], 3600).then(function (result) {
        if (result.error) throw result.error;
        if (state.preview.promptId !== prompt.id || state.preview.imageIndex !== imageIndex) return;
        var signed = result.data && result.data[0] && result.data[0].signedUrl;
        if (!signed) return;
        previewImage.src = signed;
        previewImage.hidden = false;
        previewImagePlaceholder.hidden = true;
      }).catch(function (error) {
        if (state.preview.promptId !== prompt.id || state.preview.imageIndex !== imageIndex) return;
        if (window.console && console.error) console.error('Preview image URL failed:', error);
        previewImagePlaceholder.textContent = '示例图暂不可用';
      });
    }
  }

  function hydratePreviewThumbs() {
    if (!state.client || !state.user || !state.client.storage || !previewThumbs) return;
    var nodes = Array.prototype.slice.call(previewThumbs.querySelectorAll('[data-preview-image-path]'));
    var paths = nodes.map(function (node) { return node.getAttribute('data-preview-image-path'); }).filter(Boolean).filter(unique);
    if (!paths.length) return;
    state.client.storage.from('prompt-examples').createSignedUrls(paths, 3600).then(function (result) {
      if (result.error) throw result.error;
      var urlByPath = Object.create(null);
      (result.data || []).forEach(function (item) {
        if (item && item.path && item.signedUrl) urlByPath[item.path] = item.signedUrl;
      });
      nodes.forEach(function (node) {
        var url = urlByPath[node.getAttribute('data-preview-image-path')];
        if (url) node.src = url;
      });
    }).catch(function (error) {
      if (window.console && console.error) console.error('Preview thumbnails failed:', error);
    });
  }

  function openForm(prompt) {
    if (dialog.open) return;
    form.reset();
    document.getElementById('prompt-id').value = prompt ? prompt.id : '';
    document.getElementById('prompt-title').value = prompt ? prompt.title : '';
    document.getElementById('prompt-form-category').value = prompt ? prompt.category : '';
    document.getElementById('prompt-tags').value = prompt ? prompt.tags.join('，') : '';
    document.getElementById('prompt-description').value = prompt ? prompt.description : '';
    document.getElementById('prompt-content').value = prompt ? prompt.content : '';
    formKind.value = prompt ? prompt.kind : state.kind;
    formPart.value = prompt && prompt.promptPart ? prompt.promptPart : 'complete';
    formModel.value = prompt && prompt.model ? prompt.model : '';
    formSyntax.value = prompt && prompt.syntax ? prompt.syntax : 'natural_language';
    state.formImages = {
      existing: prompt && prompt.exampleImages ? prompt.exampleImages.map(function (image) { return Object.assign({}, image); }) : [],
      pending: []
    };
    imageInput.value = '';
    toggleImageFields();
    renderFormImages();
    document.getElementById('prompt-dialog-title').textContent = prompt ? '编辑提示词' : '新建提示词';
    setFormError('');
    translateUI();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
    window.setTimeout(function () { document.getElementById('prompt-title').focus(); }, 0);
  }

  function closeForm() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function setFormError(message) {
    var error = document.getElementById('prompt-form-error');
    error.textContent = message;
    error.hidden = !message;
  }

  function toggleImageFields() {
    var isImage = formKind.value === 'image';
    Array.prototype.forEach.call(imageFields, function (field) {
      field.hidden = !isImage;
      field.style.display = isImage ? '' : 'none';
    });
  }

  function renderFormImages() {
    if (!imagePreview) return;
    var existing = state.formImages.existing.map(function (image, index) {
      var src = getImmediateImageUrl(image);
      return '<div class="prompt-image-preview__item">' +
        (src ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(image.alt) + '">' : '') +
        '<span class="prompt-image-preview__name" title="' + escapeHtml(image.name) + '">' + escapeHtml(image.name) + '</span>' +
        '<button class="prompt-image-preview__remove" type="button" data-action="remove-image" data-image-index="' + index + '" aria-label="移除 ' + escapeHtml(image.name) + '">×</button>' +
      '</div>';
    }).join('');
    var pending = state.formImages.pending.map(function (file, index) {
      return '<div class="prompt-image-preview__item">' +
        '<span class="prompt-image-preview__name" title="' + escapeHtml(file.name) + '">待上传：' + escapeHtml(file.name) + '</span>' +
        '<button class="prompt-image-preview__remove" type="button" data-action="remove-pending-image" data-image-index="' + index + '" aria-label="移除 ' + escapeHtml(file.name) + '">×</button>' +
      '</div>';
    }).join('');
    imagePreview.innerHTML = existing + pending;
  }

  function readForm() {
    var tags = document.getElementById('prompt-tags').value.split(/[,，]/).map(function (tag) {
      return tag.trim();
    }).filter(Boolean).filter(unique).slice(0, 12);
    return normalizePrompt({
      id: document.getElementById('prompt-id').value || createId(),
      title: document.getElementById('prompt-title').value,
      category: document.getElementById('prompt-form-category').value,
      tags: tags,
      description: document.getElementById('prompt-description').value,
      content: document.getElementById('prompt-content').value,
      kind: formKind.value,
      promptPart: formPart.value,
      model: formModel.value,
      syntax: formSyntax.value,
      sourceId: (findPrompt(document.getElementById('prompt-id').value) || {}).sourceId,
      exampleImages: state.formImages.existing,
      updatedAt: new Date().toISOString()
    });
  }

  function setFormSaving(isSaving) {
    var submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = isSaving;
      submit.textContent = isSaving ? '正在保存……' : '保存提示词';
    }
  }

  function getFileExtension(file) {
    var byType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
    if (byType[file.type]) return byType[file.type];
    var match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1].slice(0, 8) : 'jpg';
  }

  async function uploadPendingImages(promptId, files) {
    if (!files.length) return [];
    if (!state.user || !state.client || !state.client.storage) throw new Error('上传示例图片前请先登录。');
    var bucket = state.client.storage.from('prompt-examples');
    var uploaded = [];
    try {
      for (var index = 0; index < files.length; index += 1) {
        var file = files[index];
        var path = state.user.id + '/' + promptId + '/' + createId() + '.' + getFileExtension(file);
        var result = await bucket.upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/*' });
        if (result.error) throw result.error;
        uploaded.push({ path: path, name: file.name, alt: file.name, url: '' });
      }
      return uploaded;
    } catch (error) {
      if (uploaded.length) await bucket.remove(uploaded.map(function (image) { return image.path; }));
      throw error;
    }
  }

  function removeStoredImages(images) {
    if (!state.user || !state.client || !state.client.storage || !images || !images.length) return Promise.resolve();
    var paths = images.map(function (image) { return image.path; }).filter(function (path) { return path && path.indexOf(state.user.id + '/') === 0; });
    if (!paths.length) return Promise.resolve();
    return state.client.storage.from('prompt-examples').remove(paths).then(function (result) {
      if (result.error) throw result.error;
    });
  }

  function copyPrompt(prompt, button) {
    var originalLabel = button.textContent;
    var write = Promise.resolve().then(function () {
      if (!window.navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable');
      return window.navigator.clipboard.writeText(prompt.content);
    }).catch(function () {
      return new Promise(function (resolve, reject) {
        var textarea = document.createElement('textarea');
        textarea.value = prompt.content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        var copied = false;
        try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
        textarea.remove();
        if (copied) resolve();
        else reject(new Error('copy failed'));
      });
    });
    write.then(function () {
      button.textContent = '已复制';
      button.classList.add('is-copied');
      window.setTimeout(function () {
        button.textContent = originalLabel;
        button.classList.remove('is-copied');
      }, 1600);
    }).catch(function () {
      button.textContent = '复制失败';
      window.setTimeout(function () { button.textContent = originalLabel; }, 1600);
    });
  }

  function duplicatePrompt(prompt) {
    var copy = normalizePrompt({
      id: createId(),
      title: prompt.title + '（自定义）',
      category: prompt.category,
      tags: prompt.tags,
      description: prompt.description,
      content: prompt.content,
      kind: prompt.kind,
      promptPart: prompt.promptPart,
      model: prompt.model,
      syntax: prompt.syntax,
      // 内置项不应把站点/存储路径带进用户副本，只保留可复用的公开图片地址。
      exampleImages: prompt.exampleImages.map(function (image) {
        return { path: '', name: image.name, alt: image.alt, url: image.url || '' };
      }),
      updatedAt: new Date().toISOString(),
      isBuiltin: false
    });
    if (!copy) return;
    state.prompts.unshift(copy);
    savePrompts();
    render();
    syncOneToCloud(copy);
  }

  function exportPrompts() {
    var blob = new Blob([JSON.stringify(getUserPrompts(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'esteliel-prompts.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function importPrompts(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        var imported = parsed.map(normalizePrompt).filter(Boolean);
        if (!imported.length) throw new Error('empty');
        if (!window.confirm('导入将替换当前的 ' + getUserPrompts(state.prompts).length + ' 条自定义提示词，网站内置提示词会保留，确定继续吗？')) {
          importInput.value = '';
          return;
        }
        state.prompts = mergeBuiltinPrompts(imported);
        state.query = '';
        state.kind = 'text';
        state.space = 'personal';
        state.category = '';
        state.model = '';
        state.syntax = '';
        search.value = '';
        savePrompts();
        render();
        syncAllToCloud();
      } catch (error) {
        window.alert('导入失败：请确认文件是有效的提示词 JSON。');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  }

  function setAuthStatus(title, detail, status) {
    if (authStatus) authStatus.textContent = title;
    if (authDetail) authDetail.textContent = detail;
    translateUI();
    var account = document.querySelector('.prompt-account');
    if (account) account.dataset.status = status || '';
  }

  function updateSignedInStatus(detail, status) {
    var email = state.user && state.user.email ? state.user.email : '当前账户';
    setAuthStatus('已登录：' + email, detail || '提示词会在登录的浏览器之间同步。', status || 'online');
    signInButton.hidden = true;
    signOutButton.hidden = false;
    var metadata = state.user.user_metadata || {};
    var name = String(metadata.display_name || metadata.full_name || metadata.name || email.split('@')[0]);
    document.getElementById('prompt-user-menu').hidden = false;
    document.getElementById('prompt-avatar-initial').textContent = Array.from(name.trim())[0] || 'U';
    document.getElementById('prompt-user-name').textContent = name;
    document.getElementById('prompt-user-email').textContent = state.user.email || '';
    document.querySelector('[data-action="account-menu"]').title = name;
  }

  function updateSignedOutStatus() {
    setAuthStatus('未登录 · 仅当前浏览器', '登录后可在不同浏览器之间同步提示词。', 'offline');
    signInButton.hidden = false;
    signOutButton.hidden = true;
    document.getElementById('prompt-user-menu').hidden = true;
    closeHeaderMenus(false);
    document.getElementById('prompt-user-name').textContent = '';
    document.getElementById('prompt-user-email').textContent = '';
    document.getElementById('prompt-avatar-initial').textContent = '';
  }

  function openAuthDialog() {
    if (!state.client) return toast('云端连接不可用，请稍后重试。');
    if (!authDialog || authDialog.open) return;
    authForm.reset();
    setAuthMessage('');
    translateUI();
    if (typeof authDialog.showModal === 'function') authDialog.showModal();
    else authDialog.setAttribute('open', 'open');
    window.setTimeout(function () { authEmail.focus(); }, 0);
  }

  function closeAuthDialog() {
    if (!authDialog) return;
    if (typeof authDialog.close === 'function' && authDialog.open) authDialog.close();
    else authDialog.removeAttribute('open');
  }

  function setAuthMessage(message, isError) {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.hidden = !message;
    authMessage.dataset.error = isError ? 'true' : 'false';
  }

  async function requestMagicLink(email) {
    var result = await state.client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    if (result.error) throw result.error;
  }

  function getRemoteRows() {
    return state.client.from('prompts')
      .select('*')
      .eq('user_id', state.user.id)
      .order('updated_at', { ascending: false })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data || [];
      });
  }

  function toRemoteRow(prompt) {
    return {
      id: prompt.id,
      user_id: state.user.id,
      source_id: prompt.sourceId,
      title: prompt.title,
      category: prompt.category,
      tags: prompt.tags,
      description: prompt.description,
      content: prompt.content,
      kind: prompt.kind,
      prompt_part: prompt.promptPart,
      model: prompt.model,
      syntax: prompt.syntax,
      example_images: prompt.exampleImages,
      updated_at: prompt.updatedAt
    };
  }

  function fromRemoteRow(row) {
    return normalizePrompt({
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      category: row.category,
      tags: row.tags,
      description: row.description,
      content: row.content,
      kind: row.kind,
      promptPart: row.prompt_part,
      model: row.model,
      syntax: row.syntax,
      exampleImages: row.example_images,
      updatedAt: row.updated_at
    });
  }

  function upsertRemote(prompts) {
    var userPrompts = getUserPrompts(prompts);
    if (!userPrompts.length) return Promise.resolve();
    return state.client.from('prompts').upsert(userPrompts.map(toRemoteRow), { onConflict: 'user_id,id' }).then(function (result) {
      if (result.error) throw result.error;
    });
  }

  async function deleteRemote(id) {
    // Imports can remove published items too; clean their public image copies first.
    var shared = await state.client.from('shared_prompts').select('image_paths').eq('user_id', state.user.id).eq('id', id).maybeSingle();
    if (shared.error) throw shared.error;
    if (shared.data && shared.data.image_paths.length) {
      var cleanup = await state.client.storage.from('shared-examples').remove(shared.data.image_paths);
      if (cleanup.error) throw cleanup.error;
    }
    var result = await state.client.from('prompts').delete().eq('id', id).eq('user_id', state.user.id);
    if (result.error) throw result.error;
  }

  function mergePrompts(remotePrompts, localPrompts) {
    var merged = Object.create(null);
    remotePrompts.concat(localPrompts).forEach(function (prompt) {
      var current = merged[prompt.id];
      if (!current || dateValue(prompt.updatedAt) >= dateValue(current.updatedAt)) merged[prompt.id] = prompt;
    });
    return Object.keys(merged).map(function (id) { return merged[id]; }).sort(function (a, b) {
      return dateValue(b.updatedAt) - dateValue(a.updatedAt);
    });
  }

  function dateValue(value) {
    var time = Date.parse(value || '');
    return Number.isNaN(time) ? 0 : time;
  }

  async function syncCloud() {
    if (!state.client || !state.user || state.syncing) return;
    state.syncing = true;
    updateSignedInStatus('正在从云端读取提示词……', 'syncing');
    try {
      await builtinReady;
      if (state.localOwner && state.localOwner !== state.user.id) {
        state.prompts = BUILTIN_PROMPTS.slice();
        state.localPersisted = false;
      }
      var remotePrompts = (await getRemoteRows()).map(fromRemoteRow).filter(Boolean);
      var remoteUserPrompts = getUserPrompts(remotePrompts);
      var localUserPrompts = state.localPersisted ? getUserPrompts(state.prompts) : [];
      if (!remoteUserPrompts.length) {
        if (localUserPrompts.length) {
          var shouldUpload = !state.localPersisted || window.confirm('云端还没有提示词，是否上传当前浏览器中的 ' + localUserPrompts.length + ' 条？');
          if (shouldUpload) await upsertRemote(localUserPrompts);
          else localUserPrompts = [];
        }
        state.prompts = mergeBuiltinPrompts(localUserPrompts);
      } else if (state.localPersisted) {
        state.prompts = mergeBuiltinPrompts(mergePrompts(remoteUserPrompts, localUserPrompts));
        await upsertRemote(getUserPrompts(state.prompts));
      } else {
        state.prompts = mergeBuiltinPrompts(remoteUserPrompts);
      }
      state.localPersisted = true;
      savePrompts();
      render();
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    } catch (error) {
      updateSignedInStatus('云端同步失败，当前继续使用本地数据', 'error');
      if (window.console && console.error) console.error('Prompt sync failed:', error);
    } finally {
      state.syncing = false;
    }
  }

  function syncOneToCloud(prompt) {
    if (prompt.isBuiltin || !state.client || !state.user) return;
    updateSignedInStatus('正在保存到云端……', 'syncing');
    upsertRemote([prompt]).then(function () {
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    }).catch(function (error) {
      updateSignedInStatus('云端保存失败，内容已保留在本地', 'error');
      if (window.console && console.error) console.error('Prompt save failed:', error);
    });
  }

  function syncDeleteToCloud(id, images) {
    if (!state.client || !state.user) return;
    updateSignedInStatus('正在从云端删除……', 'syncing');
    deleteRemote(id).then(function () {
      loadCommunity();
      return removeStoredImages(images || []);
    }).then(function () {
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    }).catch(function (error) {
      updateSignedInStatus('云端删除失败，内容仍保留在云端', 'error');
      if (window.console && console.error) console.error('Prompt delete failed:', error);
    });
  }

  async function syncAllToCloud() {
    if (!state.client || !state.user) return;
    updateSignedInStatus('正在更新云端列表……', 'syncing');
    try {
      await builtinReady;
      var remotePrompts = (await getRemoteRows()).map(fromRemoteRow).filter(Boolean);
      var localUserPrompts = getUserPrompts(state.prompts);
      var localIds = localUserPrompts.map(function (prompt) { return prompt.id; });
      var stalePrompts = getUserPrompts(remotePrompts).filter(function (prompt) { return localIds.indexOf(prompt.id) === -1; });
      for (var index = 0; index < stalePrompts.length; index += 1) {
        await deleteRemote(stalePrompts[index].id);
        await removeStoredImages(stalePrompts[index].exampleImages);
      }
      await upsertRemote(localUserPrompts);
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    } catch (error) {
      updateSignedInStatus('云端更新失败，内容已保留在本地', 'error');
      if (window.console && console.error) console.error('Prompt list sync failed:', error);
    }
  }

  function toast(message) {
    var node = document.getElementById('prompt-toast');
    node.textContent = language === 'en' && translations[message] ? translations[message] : message; node.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { node.hidden = true; }, 5000);
  }

  async function loadCommunity() {
    if (!state.client) return;
    var status = document.getElementById('prompt-community-status');
    try {
      var result = await state.client.from('shared_prompts').select('id,user_id,payload,updated_at').order('updated_at', { ascending: false });
      if (result.error) throw result.error;
      state.publishedIds = [];
      state.shared = (result.data || []).map(function (row) {
        if (state.user && row.user_id === state.user.id) state.publishedIds.push(row.id);
        return normalizePrompt(Object.assign({}, row.payload, { id: 'shared:' + row.user_id + ':' + row.id, isBuiltin: false, updatedAt: row.updated_at }));
      }).filter(Boolean);
      state.communityReady = true;
      status.hidden = true;
      render();
    } catch (error) {
      state.communityReady = false;
      status.textContent = '共享大厅暂时无法连接，仍可浏览站点精选和使用个人库。';
      status.hidden = false;
    }
  }

  async function favoritePrompt(prompt, button) {
    if (getUserPrompts().some(function (item) { return item.sourceId === prompt.id; })) return toast('已经收藏到个人库。');
    // Public image copies are downloaded into the collector's own private storage.
    var remoteImages = prompt.exampleImages.filter(function (image) { return image.url && image.url.indexOf('/storage/v1/object/public/shared-examples/') !== -1; });
    if (remoteImages.length && !state.user) { toast('登录后可连同示例图片一起收藏。'); openAuthDialog(); return; }
    button.disabled = true;
    var collectedUploads = [];
    var copy = normalizePrompt(Object.assign({}, prompt, { id: createId(), sourceId: prompt.id, isBuiltin: false, updatedAt: new Date().toISOString() }));
    try {
      var images = [];
      for (var index = 0; index < copy.exampleImages.length; index += 1) {
        var image = copy.exampleImages[index];
        if (remoteImages.indexOf(prompt.exampleImages[index]) !== -1) {
          var response = await fetch(image.url);
          if (!response.ok) throw new Error('示例图读取失败');
          var blob = await response.blob();
          if (blob.size > 8 * 1024 * 1024) throw new Error('示例图片过大');
          var uploaded = await uploadPendingImages(copy.id, [new File([blob], image.name, { type: blob.type })]);
          collectedUploads = collectedUploads.concat(uploaded);
          images = images.concat(uploaded);
        } else if (image.url) images.push(Object.assign({}, image, { path: '' }));
      }
      copy.exampleImages = images;
      state.prompts.unshift(copy); savePrompts(); syncOneToCloud(copy); render();
      toast('已收藏到个人提示词库。');
    } catch (error) { await removeStoredImages(collectedUploads).catch(function () {}); toast('收藏失败，请稍后重试。'); button.disabled = false; }
  }

  async function publishPrompt(prompt, retract, button) {
    if (!state.user) { toast('登录后即可公开共享。'); openAuthDialog(); return; }
    if (!state.communityReady) { toast('共享服务尚未就绪，请稍后重试。'); return; }
    if (!retract && !window.confirm('将“' + prompt.title + '”的内容及示例图片公开到共享大厅，所有人都可以查看与收藏。确定发布吗？')) return;
    button.disabled = true;
    var userId = state.user.id;
    var uploadedPaths = [];
    try {
      var old = await state.client.from('shared_prompts').select('image_paths').eq('user_id', userId).eq('id', prompt.id).maybeSingle();
      if (old.error) throw old.error;
      if (retract) {
        if (old.data && old.data.image_paths.length) {
          var retractedImages = await state.client.storage.from('shared-examples').remove(old.data.image_paths);
          if (retractedImages.error) throw retractedImages.error;
        }
        var removed = await state.client.from('shared_prompts').delete().eq('user_id', userId).eq('id', prompt.id);
        if (removed.error) throw removed.error;
      } else {
        await upsertRemote([prompt]);
        var payload = Object.assign({}, prompt, { sourceId: '', exampleImages: [] });
        for (var index = 0; index < prompt.exampleImages.length; index += 1) {
          var image = prompt.exampleImages[index];
          if (image.path) {
            var downloaded = await state.client.storage.from('prompt-examples').download(image.path);
            if (downloaded.error) throw downloaded.error;
            var path = userId + '/' + prompt.id + '/' + createId() + '.' + getFileExtension({ type: downloaded.data.type, name: image.name });
            var uploaded = await state.client.storage.from('shared-examples').upload(path, downloaded.data, { contentType: downloaded.data.type, cacheControl: '60' });
            if (uploaded.error) throw uploaded.error;
            uploadedPaths.push(path);
            var publicUrl = state.client.storage.from('shared-examples').getPublicUrl(path).data.publicUrl;
            payload.exampleImages.push({ path: '', url: publicUrl, name: image.name, alt: image.alt });
          } else if (image.url) payload.exampleImages.push(Object.assign({}, image, { path: '' }));
        }
        var saved = await state.client.from('shared_prompts').upsert({ user_id: userId, id: prompt.id, payload: payload, image_paths: (old.data ? old.data.image_paths : []).concat(uploadedPaths).filter(unique), updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' });
        if (saved.error) throw saved.error;
      }
      uploadedPaths = [];
      if (!retract && old.data && old.data.image_paths.length) {
        var cleanup = await state.client.storage.from('shared-examples').remove(old.data.image_paths);
        if (cleanup.error) toast('共享状态已更新，旧图片清理失败，请稍后重试。');
      }
      await loadCommunity();
      toast(retract ? '已撤回共享。已被收藏的副本不受影响。' : '已发布到共享大厅。');
    } catch (error) {
      if (uploadedPaths.length) await state.client.storage.from('shared-examples').remove(uploadedPaths);
      toast('共享操作失败，个人库内容已保留，请检查云端配置后重试。');
    } finally { button.disabled = false; }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var button = document.querySelector('[data-action="theme"]');
    button.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    try { localStorage.setItem(STORAGE_KEY + '.theme', theme); } catch (error) { /* Storage is optional. */ }
  }

  var language = 'zh-CN';
  var translations = {
    '欢迎来到 Esteliel 提示词共享大厅。': 'Welcome to the Esteliel prompt community.',
    '收藏喜欢的提示词到个人库，编辑自己的内容，并通过「公开共享」发布到大厅。公开前请检查内容与图片，确保不含隐私且拥有分享权限。': 'Save prompts to your library, edit your own content and publish it with Share publicly. Review your content and images before publishing: remove private information and ensure you have permission to share.',
    '公开共享保存的是当前版本；修改后可点击「更新共享」。撤回后大厅不再展示，其他人已经收藏的副本仍会保留。': 'Sharing publishes a snapshot. Use Update shared copy after editing. Unsharing removes it from the community; copies already saved by others remain.',
    '未登录 · 仅当前浏览器': 'Signed out · saved on this browser', '登录后可在不同浏览器之间同步提示词。': 'Sign in to sync your library across browsers.',
    '绘画提示词组成': 'Prompt component', '可直接使用的完整提示词': 'Complete prompt', '完整提示词': 'Complete prompt',
    '画风': 'Style', '角色': 'Character', '动作': 'Action', '服装': 'Clothing', '自然语言': 'Natural language', 'Danbooru 标签': 'Danbooru tags', '混合格式': 'Mixed', '其他': 'Other',
    '登录后图片会保存到云端；单张不超过 8 MB，最多 8 张。': 'Sign in to upload up to 8 images, each no larger than 8 MB.',
    '输入邮箱后，我们会发送一封登录链接。无需设置密码。': 'Enter your email to receive a sign-in link. No password needed.',
    '已收藏到个人提示词库。': 'Saved to your library.', '已经收藏到个人库。': 'Already saved to your library.',
    '登录后即可公开共享。': 'Sign in to share publicly.', '登录后可连同示例图片一起收藏。': 'Sign in to save the example images with this prompt.',
    '云端连接不可用，请稍后重试。': 'Cloud connection unavailable. Please try again later.',
    '共享服务尚未就绪，请稍后重试。': 'Community service is unavailable. Please try again later.',
    '共享大厅暂时无法连接，仍可浏览站点精选和使用个人库。': 'Community is unavailable. You can still browse featured prompts and use your library.',
    '语言': 'Language', '账户菜单': 'Account menu', '切换明暗主题': 'Toggle color theme',
    '提示词': 'Prompts', '绘画提示词': 'Image prompts', '系统公告': 'Announcements', '登录': 'Sign in', '退出登录': 'Sign out',
    '共享大厅': 'Community', '个人提示词': 'My library', '场景分类': 'Categories', '模型 / 平台': 'Models / platforms',
    '全部场景': 'All categories', '全部模型': 'All models', '全部格式': 'All formats', '提示词格式': 'Format',
    '发现好用的提示词': 'Discover your next great prompt', '用提示词，打开想象力': 'Bring your imagination to life', '我的提示词库': 'My prompt library',
    '收集灵感，让每一次对话更有价值。': 'Collect inspiration. Make every conversation count.',
    '探索画风、角色与场景，找到下一张作品的灵感。': 'Explore styles, characters and scenes for your next creation.',
    '收藏、创作与整理，让灵感随时可用。': 'Save, create and organize your inspiration.',
    '＋ 新建提示词': '+ Create prompt', '搜索提示词': 'Search prompts', '复制': 'Copy', '☆ 收藏': '☆ Save', '已收藏': 'Saved',
    '编辑': 'Edit', '删除': 'Delete', '公开共享': 'Share publicly', '更新共享': 'Update shared copy', '撤回共享': 'Unshare',
    '导出 JSON': 'Export JSON', '导入 JSON': 'Import JSON', '清除筛选': 'Clear filters', '暂无示例图': 'No example image',
    '新建提示词': 'Create prompt', '编辑提示词': 'Edit prompt', '取消': 'Cancel', '保存提示词': 'Save prompt', '标题': 'Title',
    '分类': 'Category', '标签': 'Tags', '简介': 'Description', '提示词内容': 'Prompt content', '类型': 'Type',
    '普通提示词': 'Text prompt', '模型': 'Model', '示例图片': 'Example images', '邮箱': 'Email', '登录以同步': 'Sign in to sync',
    '发送登录链接': 'Send sign-in link', '复制提示词': 'Copy prompt', '复制为自定义': 'Save editable copy',
    '还没有匹配的提示词': 'No matching prompts', '还没有提示词': 'Your library is empty',
    '换个关键词，或者清除筛选试试。': 'Try another keyword or clear the filters.',
    '新建一条提示词，把常用工作流收进来。': 'Create a prompt or save one from the community.'
  };
  var translatedNodes = new WeakMap();
  function translateUI() {
    document.documentElement.lang = language;
    document.querySelectorAll('.prompt-banner__tools [aria-label]').forEach(function (element) {
      var label = element.dataset.originalLabel || element.getAttribute('aria-label');
      element.dataset.originalLabel = label;
      element.setAttribute('aria-label', language === 'en' && translations[label] ? translations[label] : label);
      if (element.hasAttribute('title') && element.dataset.action !== 'account-menu') element.title = element.getAttribute('aria-label');
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('script, style, #prompt-user-name, #prompt-user-email, #prompt-avatar-initial, .prompt-card h2, .prompt-card__description, .prompt-card__content, .prompt-card__tags, .prompt-card__visual-copy, #prompt-preview-title, #prompt-preview-content, #prompt-preview-description, textarea')) continue;
      var original = translatedNodes.get(node);
      if (original && node.textContent.trim() === translations[original]) node.textContent = original;
      var text = node.textContent.trim();
      if (translations[text]) { translatedNodes.set(node, text); if (language === 'en') node.textContent = translations[text]; }
    }
    if (language === 'en') summary.textContent = getFilteredPrompts().length + ' prompts found';
    search.placeholder = language === 'en' ? 'Search titles, content or tags' : '搜索标题、内容或标签';
  }
  document.getElementById('prompt-language').addEventListener('change', function (event) {
    language = event.target.value;
    closeHeaderMenus(true);
    try { localStorage.setItem(STORAGE_KEY + '.language', language); } catch (error) { /* Optional. */ }
    render();
  });
  try {
    language = localStorage.getItem(STORAGE_KEY + '.language') === 'en' ? 'en' : 'zh-CN';
    setTheme(localStorage.getItem(STORAGE_KEY + '.theme') || 'light');
  } catch (error) { setTheme('light'); }
  document.getElementById('prompt-language').value = language;

  function initSupabase() {
    var config = window.ESTELIEL_SUPABASE;
    if (!config || !config.url || !config.publishableKey || !window.supabase || typeof window.supabase.createClient !== 'function') {
      updateSignedOutStatus();
      return;
    }
    try {
      state.client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (error) {
      setAuthStatus('云端配置不可用', '当前继续使用本地数据。', 'error');
      return;
    }
    loadCommunity();
    state.client.auth.onAuthStateChange(function (event, session) {
      state.user = session && session.user ? session.user : null;
      if (state.user) {
        updateSignedInStatus('正在准备同步……', 'syncing');
        window.setTimeout(function () { syncCloud(); loadCommunity(); }, 0);
      } else {
        updateSignedOutStatus();
      }
    });
    state.client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      state.user = result.data.session ? result.data.session.user : null;
      if (state.user) syncCloud();
      else updateSignedOutStatus();
    }).catch(function (error) {
      updateSignedOutStatus();
      if (window.console && console.error) console.error('Supabase session failed:', error);
    });
  }

  function closeHeaderMenus(restoreFocus) {
    document.querySelectorAll('.prompt-header-menu [aria-expanded="true"]').forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
      document.getElementById(button.getAttribute('aria-controls')).hidden = true;
      if (restoreFocus && !button.closest('[hidden]')) button.focus();
    });
  }

  function toggleHeaderMenu(button) {
    var wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeHeaderMenus(false);
    if (wasOpen) return;
    var panel = document.getElementById(button.getAttribute('aria-controls'));
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('select, button').focus();
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.querySelector('.prompt-header-menu [aria-expanded="true"]')) {
      closeHeaderMenus(true);
      event.preventDefault();
    }
  });
  document.addEventListener('focusin', function (event) {
    if (!event.target.closest('.prompt-header-menu')) closeHeaderMenus(false);
  });
  var banner = document.querySelector('.prompt-banner');
  function measureBanner() {
    document.documentElement.style.setProperty('--banner-height', banner.offsetHeight + 'px');
  }
  measureBanner();
  if (window.ResizeObserver) new ResizeObserver(measureBanner).observe(banner);
  else window.addEventListener('resize', measureBanner);

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.prompt-header-menu')) closeHeaderMenus(false);
    var imageLink = event.target.closest('.prompt-card__image-link');
    if (imageLink && imageLink.getAttribute('href') === '#') event.preventDefault();
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    if (action === 'account-menu' || action === 'language-menu') return toggleHeaderMenu(button);
    if (action === 'switch-kind' || action === 'switch-space') {
      if (action === 'switch-kind') state.kind = button.dataset.kind;
      else state.space = button.dataset.space;
      state.category = ''; state.model = ''; state.syntax = ''; state.query = ''; search.value = '';
      render();
      if (action === 'switch-space' && state.space === 'hall') loadCommunity();
      return;
    }
    if (action === 'theme') return setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    if (action === 'announcements') return document.getElementById('prompt-notice-dialog').showModal();
    if (action === 'close-notice') return document.getElementById('prompt-notice-dialog').close();
    if (action === 'new') return openForm();
    if (action === 'cancel') return closeForm();
    if (action === 'remove-image') {
      state.formImages.existing.splice(Number(button.getAttribute('data-image-index')), 1);
      renderFormImages();
      return;
    }
    if (action === 'remove-pending-image') {
      state.formImages.pending.splice(Number(button.getAttribute('data-image-index')), 1);
      renderFormImages();
      return;
    }
    if (action === 'sign-in') return openAuthDialog();
    if (action === 'cancel-auth') return closeAuthDialog();
    if (action === 'sign-out') {
      if (!state.client) return;
      button.disabled = true;
      state.client.auth.signOut().then(function (result) {
        if (result.error) throw result.error;
        state.user = null;
        updateSignedOutStatus();
        signInButton.focus();
      }).catch(function () { toast(language === 'en' ? 'Sign out failed. Please try again.' : '退出登录失败，请重试。'); })
        .finally(function () { button.disabled = false; });
      return;
    }
    if (action === 'export') return exportPrompts();
    if (action === 'import') return importInput.click();
    if (action === 'clear-filters') {
      state.query = '';
      state.kind = state.kind || 'text';
      state.category = '';
      state.model = '';
      state.syntax = '';
      search.value = '';
      render();
      return;
    }
    if (action === 'close-preview') return closePreview();
    if (action === 'preview-copy') {
      var previewPromptForCopy = findPrompt(state.preview.promptId);
      if (previewPromptForCopy) copyPrompt(previewPromptForCopy, button);
      return;
    }
    if (action === 'preview-duplicate') {
      var previewPromptForDuplicate = findPrompt(state.preview.promptId);
      if (previewPromptForDuplicate) {
        if (state.space === 'hall') favoritePrompt(previewPromptForDuplicate, button);
        else duplicatePrompt(previewPromptForDuplicate);
        closePreview();
      }
      return;
    }
    if (action === 'preview-image' || action === 'preview-prev' || action === 'preview-next') {
      var previewPrompt = findPrompt(state.preview.promptId);
      if (!previewPrompt) return;
      var imageCount = previewPrompt.exampleImages.length;
      if (!imageCount) return;
      if (action === 'preview-image') {
        state.preview.imageIndex = Number(button.getAttribute('data-image-index')) || 0;
      } else if (action === 'preview-prev') {
        state.preview.imageIndex = (state.preview.imageIndex - 1 + imageCount) % imageCount;
      } else {
        state.preview.imageIndex = (state.preview.imageIndex + 1) % imageCount;
      }
      renderPreview();
      return;
    }
    if (action === 'preview') {
      var previewCard = button.closest('[data-prompt-id]');
      var previewCardPrompt = previewCard && findPrompt(previewCard.getAttribute('data-prompt-id'));
      if (previewCardPrompt) openPreview(previewCardPrompt);
      return;
    }
    var card = button.closest('[data-prompt-id]');
    if (!card) return;
    var prompt = findPrompt(card.getAttribute('data-prompt-id'));
    if (!prompt) return;
    if (action === 'favorite') return favoritePrompt(prompt, button);
    if (action === 'publish' || action === 'unpublish') return publishPrompt(prompt, action === 'unpublish', button);
    if (action === 'copy') return copyPrompt(prompt, button);
    if (action === 'duplicate') return duplicatePrompt(prompt);
    if (action === 'edit') {
      if (prompt.isBuiltin) return;
      return openForm(prompt);
    }
    if (action === 'delete') {
      if (state.publishedIds.indexOf(prompt.id) !== -1) return toast('请先撤回共享，再删除个人提示词。');
      if (prompt.isBuiltin || !window.confirm('确定删除“' + prompt.title + '”吗？')) return;
      state.prompts = state.prompts.filter(function (item) { return item.id !== prompt.id; });
      savePrompts();
      render();
      syncDeleteToCloud(prompt.id, prompt.exampleImages);
    }
  });

  if (previewDialog) {
    previewDialog.addEventListener('click', function (event) {
      if (event.target === previewDialog) closePreview();
    });
  }

  search.addEventListener('input', function (event) {
    state.query = event.target.value.trim();
    render();
  });

  kindFilter.addEventListener('change', function (event) {
    state.kind = event.target.value;
    render();
  });

  categoryNav.addEventListener('click', function (event) {
    var button = event.target.closest('[data-category]');
    if (!button) return;
    if (state.kind === 'image') state.model = button.getAttribute('data-category') || '';
    else state.category = button.getAttribute('data-category') || '';
    render();
  });

  modelFilter.addEventListener('change', function (event) {
    state.model = event.target.value;
    render();
  });

  syntaxFilter.addEventListener('change', function (event) {
    state.syntax = event.target.value;
    render();
  });

  formKind.addEventListener('change', function () {
    toggleImageFields();
    if (formKind.value !== 'image') {
      state.formImages.pending = [];
      renderFormImages();
    }
  });

  imageInput.addEventListener('change', function (event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    var available = 8 - state.formImages.existing.length - state.formImages.pending.length;
    var accepted = [];
    files.forEach(function (file) {
      if (accepted.length >= available) return;
      if (!/^image\//i.test(file.type) || file.size > 8 * 1024 * 1024) return;
      accepted.push(file);
    });
    state.formImages.pending = state.formImages.pending.concat(accepted);
    imageInput.value = '';
    renderFormImages();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var prompt = readForm();
    if (!prompt) {
      setFormError('标题和提示词内容不能为空。');
      return;
    }
    var previous = state.prompts.find(function (item) { return item.id === prompt.id; });
    var pending = formKind.value === 'image' ? state.formImages.pending.slice() : [];
    if (pending.length && !state.user) {
      setFormError('上传示例图片前请先登录同步账户。');
      return;
    }
    setFormSaving(true);
    try {
      if (pending.length) prompt.exampleImages = prompt.exampleImages.concat(await uploadPendingImages(prompt.id, pending));
    } catch (error) {
      setFormError(error.message || '示例图片上传失败，请稍后重试。');
      setFormSaving(false);
      return;
    }
    var existingIndex = state.prompts.findIndex(function (item) { return item.id === prompt.id; });
    if (existingIndex === -1) state.prompts.unshift(prompt);
    else state.prompts[existingIndex] = prompt;
    var removedImages = previous ? previous.exampleImages.filter(function (oldImage) {
      return !prompt.exampleImages.some(function (image) { return image.path && image.path === oldImage.path; });
    }) : [];
    state.space = 'personal'; state.kind = prompt.kind; state.category = ''; state.model = ''; state.query = ''; search.value = '';
    savePrompts();
    setFormSaving(false);
    closeForm();
    render();
    syncOneToCloud(prompt);
    if (removedImages.length) removeStoredImages(removedImages).catch(function (error) {
      if (window.console && console.error) console.error('Prompt image cleanup failed:', error);
    });
  });

  authForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var email = authEmail.value.trim();
    if (!email || !state.client) return;
    authSubmit.disabled = true;
    setAuthMessage('正在发送登录链接……', false);
    requestMagicLink(email).then(function () {
      setAuthMessage('登录链接已发送，请检查邮箱后回到此页面。', false);
    }).catch(function (error) {
      setAuthMessage('发送失败：' + (error.message || '请稍后重试。'), true);
    }).finally(function () {
      authSubmit.disabled = false;
    });
  });

  importInput.addEventListener('change', function (event) { importPrompts(event.target.files[0]); });
  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY || state.user) return;
    var next = readLocalPrompts();
    state.prompts = next.prompts;
    state.localPersisted = next.persisted;
    state.localOwner = next.owner;
    render();
  });

  render();
  initSupabase();
})();
