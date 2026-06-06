const TEXTAREA_SELECTORS = [
  'textarea[aria-label="コメントを追加…"]',
  'textarea[placeholder*="コメント"]',
  'form[method="POST"] textarea',
  'div[contenteditable="true"][aria-placeholder="コメントを追加…"]',
  'div[contenteditable="true"][aria-label="コメントを追加…"]',
  'div[data-lexical-editor="true"]',
];
const AI_BTN_CLASS = 'instagram-smart-reply-ai-btn';
let isGenerating = false;

function isVisible(el) {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
}

function getTextareaFromContext(el) {
  const form = el.closest('form');
  if (form) {
    for (const sel of TEXTAREA_SELECTORS) {
      const ta = form.querySelector(sel);
      if (ta && isVisible(ta)) return ta;
    }
  }
  const scope =
    el.closest('[role="dialog"]') ||
    el.closest('article') ||
    el.closest('main') ||
    document.body;
  for (const sel of TEXTAREA_SELECTORS) {
    const ta = scope.querySelector(sel);
    if (ta && isVisible(ta)) return ta;
  }
  return null;
}

function getPostText(textarea) {
  const containers = [
    textarea.closest('[role="dialog"]'),
    textarea.closest('article'),
    textarea.closest('main'),
  ].filter(Boolean);

  for (const container of containers) {
    // Instagram detail view: caption is in h1
    const h1 = container.querySelector('h1');
    if (h1 && h1.innerText?.trim().length > 5) {
      return h1.innerText.trim();
    }

    // Fallback: find longest visible text span inside the container
    const candidates = [];
    const spans = container.querySelectorAll('span[dir="auto"], div[dir="auto"], h1[dir="auto"]');
    for (const span of spans) {
      if (!isVisible(span)) continue;
      if (span.contains(textarea) || textarea.contains(span)) continue;
      const text = span.innerText?.trim();
      if (text && text.length > 10) candidates.push({ text, len: text.length });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.len - a.len);
      return candidates[0].text;
    }
  }

  // Last resort: any visible h1 on page
  for (const h1 of document.querySelectorAll('h1')) {
    if (isVisible(h1) && h1.innerText?.trim().length > 5) {
      return h1.innerText.trim();
    }
  }

  return null;
}

function findToolbarContainer(textarea) {
  const form = textarea.closest('form');
  if (form) {
    const buttons = form.querySelectorAll('[role="button"]');
    if (buttons.length > 0) {
      return buttons[buttons.length - 1].parentElement;
    }
  }
  if (textarea.contentEditable === 'true') {
    const row = textarea.parentElement?.parentElement;
    if (row) {
      const last = row.lastElementChild;
      if (last && last !== textarea.parentElement) return last;
      return row;
    }
    return textarea.parentElement;
  }
  return null;
}

function insertTextIntoTextarea(text, textarea) {
  textarea.focus();

  if (textarea.contentEditable === 'true') {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
    textarea.focus();
    return;
  }

  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  textarea.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  }));

  if (!textarea.value || textarea.value !== text) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, text);
    } else {
      textarea.value = text;
    }

    textarea.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  textarea.focus();
}

function isExtensionAlive() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function createAiButton() {
  const btn = document.createElement('div');
  btn.className = AI_BTN_CLASS;
  btn.title = 'AIでコメントを生成';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;' +
    'width:34px;height:34px;cursor:pointer;border-radius:50%;' +
    'font-size:18px;line-height:1;transition:background 0.2s;flex-shrink:0;';
  btn.textContent = '✨';
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,149,246,0.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  return btn;
}

function setBtnState(btn, emoji, disabled) {
  btn.textContent = emoji;
  btn.style.opacity = disabled ? '0.5' : '1';
  btn.style.pointerEvents = disabled ? 'none' : 'auto';
}

async function handleAiButtonClick(btn) {
  if (isGenerating) return;
  if (!isExtensionAlive()) { textareaObserver.disconnect(); return; }

  // Re-find textarea at click time to avoid stale reference
  const textarea = getTextareaFromContext(btn);
  if (!textarea) return;

  isGenerating = true;
  setBtnState(btn, '⏳', true);

  try {
    const postText = getPostText(textarea);
    if (!postText) {
      setBtnState(btn, '❓', false);
      setTimeout(() => setBtnState(btn, '✨', false), 2000);
      return;
    }

    const { apiKey, customPrompt } = await chrome.storage.local.get(['apiKey', 'customPrompt']);
    if (!apiKey) {
      setBtnState(btn, '🔑', false);
      setTimeout(() => setBtnState(btn, '✨', false), 2000);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_REPLY',
      postText,
      prompt: customPrompt || INSTAGRAM_REPLY_DEFAULT_PROMPT,
      apiKey,
    });

    if (response?.success) {
      insertTextIntoTextarea(response.reply, textarea);
    } else {
      setBtnState(btn, '❌', false);
      setTimeout(() => setBtnState(btn, '✨', false), 2000);
    }
  } catch {
    if (!isExtensionAlive()) textareaObserver.disconnect();
    setBtnState(btn, '❌', false);
    setTimeout(() => setBtnState(btn, '✨', false), 2000);
  } finally {
    isGenerating = false;
    if (btn.textContent === '⏳') setBtnState(btn, '✨', false);
    else btn.style.pointerEvents = 'auto';
  }
}

function injectAiButton(textarea) {
  const toolbar = findToolbarContainer(textarea);
  if (!toolbar) return;
  if (toolbar.querySelector(`.${AI_BTN_CLASS}`)) return;

  const btn = createAiButton();
  btn.addEventListener('click', e => {
    e.stopPropagation();
    handleAiButtonClick(btn).catch(() => {});
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAiButtonClick(btn).catch(() => {});
    }
  });
  toolbar.insertBefore(btn, toolbar.firstChild);
}

function scanAndInject() {
  for (const sel of TEXTAREA_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (isVisible(el)) injectAiButton(el);
    }
  }
}

const textareaObserver = new MutationObserver(mutations => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      for (const sel of TEXTAREA_SELECTORS) {
        const textareas = node.matches(sel) ? [node] : node.querySelectorAll(sel);
        for (const textarea of textareas) {
          if (isVisible(textarea)) injectAiButton(textarea);
        }
      }
    }
  }
});

textareaObserver.observe(document.body, { childList: true, subtree: true });

scanAndInject();
