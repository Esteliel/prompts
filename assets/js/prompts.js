(function () {
  'use strict';

  var STORAGE_KEY = 'esteliel.prompt-manager.v1';
  var LOCAL_OWNER_KEY = STORAGE_KEY + '.owner';
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
  var category = document.getElementById('prompt-category');
  var modelFilter = document.getElementById('prompt-model-filter');
  var syntaxFilter = document.getElementById('prompt-syntax-filter');
  var summary = document.getElementById('prompt-summary');
  var empty = document.getElementById('prompt-empty');
  var emptyTitle = document.getElementById('prompt-empty-title');
  var emptyCopy = document.getElementById('prompt-empty-copy');
  var dialog = document.getElementById('prompt-dialog');
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

  var localState = readLocalPrompts();
  var state = {
    prompts: localState.prompts,
    localPersisted: localState.persisted,
    localOwner: localState.owner,
    query: '',
    kind: '',
    category: '',
    model: '',
    syntax: '',
    client: null,
    user: null,
    syncing: false,
    formImages: { existing: [], pending: [] }
  };

  function readLocalPrompts() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return { prompts: parsed.map(normalizePrompt).filter(Boolean), persisted: true, owner: window.localStorage.getItem(LOCAL_OWNER_KEY) || '' };
        }
      }
    } catch (error) {
      // Private browsing and disabled storage should not make the page unusable.
    }
    return { prompts: seedPrompts.map(normalizePrompt), persisted: false, owner: '' };
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
      id: String(prompt.id || createId()),
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
      updatedAt: Number.isNaN(updatedTime) ? new Date().toISOString() : new Date(updatedTime).toISOString()
    };
  }

  function normalizeImage(image) {
    if (!image || typeof image !== 'object') return null;
    var path = String(image.path || '').trim().slice(0, 300);
    var url = String(image.url || '').trim();
    if (!path && !/^https?:\/\//i.test(url)) return null;
    if (!/^https?:\/\//i.test(url)) url = '';
    return {
      path: path,
      name: String(image.name || image.alt || '示例图片').trim().slice(0, 120) || '示例图片',
      alt: String(image.alt || image.name || '提示词示例图片').trim().slice(0, 160) || '提示词示例图片',
      url: url
    };
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
    return state.prompts.filter(function (prompt) {
      var matchesKind = !state.kind || prompt.kind === state.kind;
      var matchesCategory = !state.category || prompt.category === state.category;
      var matchesModel = !state.model || prompt.model === state.model;
      var matchesSyntax = !state.syntax || prompt.syntax === state.syntax;
      if (!matchesKind || !matchesCategory || !matchesModel || !matchesSyntax) return false;
      if (!query) return true;
      var searchable = [prompt.title, prompt.category, prompt.description, prompt.content, prompt.model, prompt.promptPart, prompt.syntax].concat(prompt.tags).join(' ').toLocaleLowerCase();
      return searchable.indexOf(query) !== -1;
    });
  }

  function renderCategories() {
    var categories = state.prompts.map(function (prompt) { return prompt.category; }).filter(unique).sort();
    var options = '<option value="">全部分类</option>' + categories.map(function (item) {
      return '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
    }).join('');
    category.innerHTML = options;
    category.value = categories.indexOf(state.category) === -1 ? '' : state.category;
    state.category = category.value;

    var models = state.prompts.map(function (prompt) { return prompt.model; }).filter(Boolean).filter(unique).sort();
    modelFilter.innerHTML = '<option value="">全部模型</option>' + models.map(function (item) {
      return '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
    }).join('');
    modelFilter.value = models.indexOf(state.model) === -1 ? '' : state.model;
    state.model = modelFilter.value;

    var syntaxes = state.prompts.map(function (prompt) { return prompt.syntax; }).filter(Boolean).filter(unique).sort();
    syntaxFilter.innerHTML = '<option value="">全部格式</option>' + syntaxes.map(function (item) {
      return '<option value="' + escapeHtml(item) + '">' + escapeHtml(SYNTAX_LABELS[item] || item) + '</option>';
    }).join('');
    syntaxFilter.value = syntaxes.indexOf(state.syntax) === -1 ? '' : state.syntax;
    state.syntax = syntaxFilter.value;
    kindFilter.value = state.kind;
  }

  function render() {
    renderCategories();
    var visible = getFilteredPrompts();
    summary.textContent = state.prompts.length + ' 条提示词 · 当前显示 ' + visible.length + ' 条';
    list.innerHTML = visible.map(renderCard).join('');
    var noPrompts = state.prompts.length === 0;
    empty.hidden = visible.length !== 0;
    emptyTitle.textContent = noPrompts ? '还没有提示词' : '还没有匹配的提示词';
    emptyCopy.textContent = noPrompts ? '新建一条提示词，把常用工作流收进来。' : '换个关键词，或者清除筛选试试。';
    hydrateImageUrls();
  }

  function renderCard(prompt) {
    var tags = prompt.tags.map(function (tag) {
      return '<span class="prompt-tag">' + escapeHtml(tag) + '</span>';
    }).join('');
    var preview = prompt.content.length > 420 ? prompt.content.slice(0, 420) + '…' : prompt.content;
    var typeLabel = prompt.kind === 'image' ? '绘画提示词' : '普通提示词';
    var badges = '<span class="prompt-card__badge">' + escapeHtml(typeLabel) + '</span>';
    if (prompt.kind === 'image') {
      badges += '<span class="prompt-card__badge prompt-card__badge--accent">' + escapeHtml(PROMPT_PART_LABELS[prompt.promptPart] || prompt.promptPart) + '</span>';
      if (prompt.model) badges += '<span class="prompt-card__badge">' + escapeHtml(prompt.model) + '</span>';
      badges += '<span class="prompt-card__badge">' + escapeHtml(SYNTAX_LABELS[prompt.syntax] || prompt.syntax) + '</span>';
    }
    var images = prompt.exampleImages.map(function (image) {
      var immediateUrl = image.url && /^https?:\/\//i.test(image.url) ? image.url : '';
      return '<a class="prompt-card__image-link" href="' + (immediateUrl ? escapeHtml(immediateUrl) : '#') + '" target="_blank" rel="noreferrer" data-image-path="' + escapeHtml(image.path) + '">' +
        '<figure class="prompt-card__image-figure">' +
          '<img class="prompt-card__image"' + (immediateUrl ? ' src="' + escapeHtml(immediateUrl) + '"' : ' hidden') + ' data-image-path="' + escapeHtml(image.path) + '" alt="' + escapeHtml(image.alt) + '">' +
          '<span class="prompt-card__image-placeholder"' + (immediateUrl ? ' hidden' : '') + '>示例图</span>' +
        '</figure>' +
      '</a>';
    }).join('');
    var imageBlock = images ? '<div class="prompt-card__images" aria-label="示例图片">' + images + '</div>' : '';
    return '<article class="prompt-card' + (prompt.kind === 'image' ? ' prompt-card--image' : '') + '" data-prompt-id="' + escapeHtml(prompt.id) + '">' +
      '<header class="prompt-card__header"><div><h2>' + escapeHtml(prompt.title) + '</h2><span class="prompt-card__type">' + escapeHtml(typeLabel) + '</span></div><span class="prompt-card__category">' + escapeHtml(prompt.category) + '</span></header>' +
      '<p class="prompt-card__description">' + escapeHtml(prompt.description || '暂无简介') + '</p>' +
      '<div class="prompt-card__badges" aria-label="提示词属性">' + badges + '</div>' +
      imageBlock +
      '<pre class="prompt-card__content"><code>' + escapeHtml(preview) + '</code></pre>' +
      '<div class="prompt-card__tags" aria-label="标签">' + tags + '</div>' +
      '<footer class="prompt-card__footer">' +
        '<button class="button button--quiet" type="button" data-action="copy" aria-label="复制：' + escapeHtml(prompt.title) + '">复制</button>' +
        '<button class="button button--quiet" type="button" data-action="edit" aria-label="编辑：' + escapeHtml(prompt.title) + '">编辑</button>' +
        '<button class="button button--quiet" type="button" data-action="delete" aria-label="删除：' + escapeHtml(prompt.title) + '">删除</button>' +
      '</footer>' +
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

  function openForm(prompt) {
    if (dialog.open) return;
    form.reset();
    document.getElementById('prompt-id').value = prompt ? prompt.id : '';
    document.getElementById('prompt-title').value = prompt ? prompt.title : '';
    document.getElementById('prompt-form-category').value = prompt ? prompt.category : '';
    document.getElementById('prompt-tags').value = prompt ? prompt.tags.join('，') : '';
    document.getElementById('prompt-description').value = prompt ? prompt.description : '';
    document.getElementById('prompt-content').value = prompt ? prompt.content : '';
    formKind.value = prompt && prompt.kind === 'image' ? 'image' : 'text';
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
    Array.prototype.forEach.call(imageFields, function (field) { field.hidden = !isImage; });
  }

  function renderFormImages() {
    if (!imagePreview) return;
    var existing = state.formImages.existing.map(function (image, index) {
      var src = image.url && /^https?:\/\//i.test(image.url) ? image.url : '';
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
    var paths = images.map(function (image) { return image.path; }).filter(Boolean);
    if (!paths.length) return Promise.resolve();
    return state.client.storage.from('prompt-examples').remove(paths).then(function (result) {
      if (result.error) throw result.error;
    });
  }

  function copyPrompt(prompt, button) {
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
        button.textContent = '复制';
        button.classList.remove('is-copied');
      }, 1600);
    }).catch(function () {
      button.textContent = '复制失败';
      window.setTimeout(function () { button.textContent = '复制'; }, 1600);
    });
  }

  function exportPrompts() {
    var blob = new Blob([JSON.stringify(state.prompts, null, 2)], { type: 'application/json' });
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
        if (!window.confirm('导入将替换当前的 ' + state.prompts.length + ' 条提示词，确定继续吗？')) {
          importInput.value = '';
          return;
        }
        state.prompts = imported;
        state.query = '';
        state.kind = '';
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
    var account = document.querySelector('.prompt-account');
    if (account) account.dataset.status = status || '';
  }

  function updateSignedInStatus(detail, status) {
    var email = state.user && state.user.email ? state.user.email : '当前账户';
    setAuthStatus('已登录：' + email, detail || '提示词会在登录的浏览器之间同步。', status || 'online');
    signInButton.hidden = true;
    signOutButton.hidden = false;
  }

  function updateSignedOutStatus() {
    setAuthStatus('未登录 · 仅当前浏览器', '登录后可在不同浏览器之间同步提示词。', 'offline');
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }

  function openAuthDialog() {
    if (!authDialog || !state.client || authDialog.open) return;
    authForm.reset();
    setAuthMessage('');
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
      .select('id,user_id,title,category,tags,description,content,kind,prompt_part,model,syntax,example_images,updated_at')
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
    if (!prompts.length) return Promise.resolve();
    return state.client.from('prompts').upsert(prompts.map(toRemoteRow), { onConflict: 'user_id,id' }).then(function (result) {
      if (result.error) throw result.error;
    });
  }

  function deleteRemote(id) {
    return state.client.from('prompts').delete().eq('id', id).eq('user_id', state.user.id).then(function (result) {
      if (result.error) throw result.error;
    });
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
      if (state.localOwner && state.localOwner !== state.user.id) {
        state.prompts = seedPrompts.map(normalizePrompt);
        state.localPersisted = false;
      }
      var remotePrompts = (await getRemoteRows()).map(fromRemoteRow).filter(Boolean);
      var localPrompts = state.localPersisted ? state.prompts : [];
      if (!remotePrompts.length) {
        if (state.prompts.length) {
          var shouldUpload = !state.localPersisted || window.confirm('云端还没有提示词，是否上传当前浏览器中的 ' + state.prompts.length + ' 条？');
          if (shouldUpload) await upsertRemote(state.prompts);
          else state.prompts = [];
        }
      } else if (state.localPersisted) {
        state.prompts = mergePrompts(remotePrompts, localPrompts);
        await upsertRemote(state.prompts);
      } else {
        state.prompts = remotePrompts;
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
    if (!state.client || !state.user) return;
    updateSignedInStatus('正在保存到云端……', 'syncing');
    upsertRemote([prompt]).then(function () {
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    }).catch(function (error) {
      updateSignedInStatus('云端保存失败，内容已保留在本地', 'error');
      if (window.console && console.error) console.error('Prompt save failed:', error);
    });
  }

  function syncDeleteToCloud(id) {
    if (!state.client || !state.user) return;
    updateSignedInStatus('正在从云端删除……', 'syncing');
    deleteRemote(id).then(function () {
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
      var remotePrompts = (await getRemoteRows()).map(fromRemoteRow).filter(Boolean);
      var localIds = state.prompts.map(function (prompt) { return prompt.id; });
      var stalePrompts = remotePrompts.filter(function (prompt) { return localIds.indexOf(prompt.id) === -1; });
      for (var index = 0; index < stalePrompts.length; index += 1) {
        await deleteRemote(stalePrompts[index].id);
        await removeStoredImages(stalePrompts[index].exampleImages);
      }
      await upsertRemote(state.prompts);
      updateSignedInStatus('已同步 · ' + state.prompts.length + ' 条提示词', 'online');
    } catch (error) {
      updateSignedInStatus('云端更新失败，内容已保留在本地', 'error');
      if (window.console && console.error) console.error('Prompt list sync failed:', error);
    }
  }

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
    state.client.auth.onAuthStateChange(function (event, session) {
      state.user = session && session.user ? session.user : null;
      if (state.user) {
        updateSignedInStatus('正在准备同步……', 'syncing');
        window.setTimeout(syncCloud, 0);
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

  document.addEventListener('click', function (event) {
    var imageLink = event.target.closest('.prompt-card__image-link');
    if (imageLink && imageLink.getAttribute('href') === '#') event.preventDefault();
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
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
      if (state.client) state.client.auth.signOut();
      return;
    }
    if (action === 'export') return exportPrompts();
    if (action === 'import') return importInput.click();
    if (action === 'clear-filters') {
      state.query = '';
      state.kind = '';
      state.category = '';
      state.model = '';
      state.syntax = '';
      search.value = '';
      render();
      return;
    }
    var card = button.closest('[data-prompt-id]');
    if (!card) return;
    var prompt = state.prompts.find(function (item) { return item.id === card.getAttribute('data-prompt-id'); });
    if (!prompt) return;
    if (action === 'copy') return copyPrompt(prompt, button);
    if (action === 'edit') return openForm(prompt);
    if (action === 'delete' && window.confirm('确定删除“' + prompt.title + '”吗？')) {
      state.prompts = state.prompts.filter(function (item) { return item.id !== prompt.id; });
      savePrompts();
      render();
      syncDeleteToCloud(prompt.id);
      removeStoredImages(prompt.exampleImages).catch(function (error) {
        if (window.console && console.error) console.error('Prompt image cleanup failed:', error);
      });
    }
  });

  search.addEventListener('input', function (event) {
    state.query = event.target.value.trim();
    render();
  });

  kindFilter.addEventListener('change', function (event) {
    state.kind = event.target.value;
    render();
  });

  category.addEventListener('change', function (event) {
    state.category = event.target.value;
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
