(function (root) {
  'use strict';

  var READER_ORIGIN = 'https://r.jina.ai';
  var MAX_RESPONSE_LENGTH = 2 * 1024 * 1024;
  var REQUEST_TIMEOUT = 30000;

  function normalizeUrl(value) {
    var matches = String(value || '').replace(/\\_/g, '_').match(/https?:\/\/[^\s\])}>]+/gi) || [];
    for (var index = 0; index < matches.length; index += 1) {
      try {
        var parsed = new URL(matches[index].replace(/[.,;!?，。；！？]+$/, ''));
        var host = parsed.hostname.toLowerCase();
        if ((host === 'chatgpt.com' || host === 'www.chatgpt.com') && /^\/s\/p_[a-z0-9_-]+\/?$/i.test(parsed.pathname)) {
          return 'https://chatgpt.com' + parsed.pathname.replace(/\/$/, '');
        }
      } catch (error) {
        // Try the next URL when pasted text contains an invalid candidate.
      }
    }
    return '';
  }

  function getReaderUrl(shareUrl) {
    return READER_ORIGIN + '/http://chatgpt.com' + new URL(shareUrl).pathname;
  }

  function extractStream(html) {
    var chunks = [];
    var pattern = /window\.__reactRouterContext\.streamController\.enqueue\(("(?:\\[\s\S]|[^"\\])*")\)/g;
    var match;
    while ((match = pattern.exec(html))) {
      try { chunks.push(JSON.parse(match[1])); } catch (error) { /* Ignore unrelated malformed chunks. */ }
    }
    return chunks.join('');
  }

  function extractJsonArray(stream) {
    var start = stream.indexOf('[');
    if (start === -1) return '';
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var index = start; index < stream.length; index += 1) {
      var character = stream.charAt(index);
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '[' || character === '{') depth += 1;
      else if (character === ']' || character === '}') {
        depth -= 1;
        if (depth === 0) return stream.slice(start, index + 1);
      }
    }
    return '';
  }

  function unflatten(serialized) {
    var values = JSON.parse(serialized);
    if (!Array.isArray(values)) throw new Error('分享页数据格式无法识别。');
    var cache = [];

    function hydrate(reference) {
      if (typeof reference !== 'number') return reference;
      if (reference < 0 || reference >= values.length) return undefined;
      if (Object.prototype.hasOwnProperty.call(cache, reference)) return cache[reference];
      var raw = values[reference];
      if (!raw || typeof raw !== 'object') {
        cache[reference] = raw;
        return raw;
      }
      var result = Array.isArray(raw) ? [] : {};
      cache[reference] = result;
      if (Array.isArray(raw)) {
        raw.forEach(function (item) { result.push(hydrate(item)); });
      } else {
        Object.keys(raw).forEach(function (encodedKey) {
          var keyMatch = /^_(\d+)$/.exec(encodedKey);
          var key = keyMatch ? hydrate(Number(keyMatch[1])) : encodedKey;
          if (typeof key === 'string') result[key] = hydrate(raw[encodedKey]);
        });
      }
      return result;
    }

    return hydrate(0);
  }

  function isTrustedImageUrl(value) {
    try {
      var parsed = new URL(String(value || ''));
      var host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && (
        host === 'chatgpt.com' || host.slice(-12) === '.chatgpt.com' ||
        host === 'openai.com' || host.slice(-11) === '.openai.com' ||
        host === 'oaistatic.com' || host.slice(-14) === '.oaistatic.com'
      );
    } catch (error) {
      return false;
    }
  }

  function parseHtml(html, shareUrl) {
    var serialized = extractJsonArray(extractStream(String(html || '')));
    if (!serialized) throw new Error('分享页没有可解析的数据，链接可能已失效。');
    var rootData = unflatten(serialized);
    var loaderData = rootData && rootData.loaderData;
    var route = loaderData && (loaderData['routes/s.$postId'] || loaderData['routes/s.$postId_']);
    if (!route && loaderData) {
      Object.keys(loaderData).some(function (key) {
        if (key.indexOf('s.$postId') !== -1) route = loaderData[key];
        return !!route;
      });
    }
    var wrapper = route && route.promptSharePostWithProfile;
    var post = wrapper && wrapper.post;
    var attachments = post && Array.isArray(post.attachments) ? post.attachments : [];
    var attachment = attachments.find(function (item) { return item && item.kind === 'prompt_share'; });
    var content = attachment && attachment.prompt_share && attachment.prompt_share.content;
    var title = String(content && content.title || post && (post.og_title || post.text) || '').trim();
    var prompt = String(content && content.prompt || '').trim();
    var generatedImage = content && content.generated_image;
    var imageUrl = generatedImage && generatedImage.image_url;
    if (!isTrustedImageUrl(imageUrl)) imageUrl = isTrustedImageUrl(post && post.preview_image_url) ? post.preview_image_url : '';
    if (!title || !prompt) throw new Error('这个分享页没有公开可导入的绘画提示词。');
    return {
      shareUrl: normalizeUrl(shareUrl),
      title: title,
      prompt: prompt,
      imageUrl: imageUrl || '',
      model: 'ChatGPT',
      promptPart: 'complete',
      syntax: 'natural_language'
    };
  }

  function fetchShare(value) {
    var shareUrl = normalizeUrl(value);
    if (!shareUrl) return Promise.reject(new Error('请输入有效的 ChatGPT 绘画分享链接。'));
    if (typeof root.fetch !== 'function') return Promise.reject(new Error('当前浏览器不支持在线解析。'));
    var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timeout = root.setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT);
    return root.fetch(getReaderUrl(shareUrl), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'X-Return-Format': 'html' },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('分享页读取失败（' + response.status + '）。');
      return response.text();
    }).then(function (html) {
      if (!html || html.length > MAX_RESPONSE_LENGTH) throw new Error('分享页返回内容异常。');
      return parseHtml(html, shareUrl);
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('解析超时，请稍后重试。');
      throw error;
    }).finally(function () {
      root.clearTimeout(timeout);
    });
  }

  root.EstChatGPTShare = {
    normalizeUrl: normalizeUrl,
    parseHtml: parseHtml,
    fetch: fetchShare
  };
})(typeof window === 'undefined' ? globalThis : window);
