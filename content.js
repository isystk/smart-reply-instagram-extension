const DEFAULT_PROMPT =
  '以下のInstagram投稿に対して、\n自然なコメントを1件だけ作成してください。\n\n【最重要】\n- "会話している感じ" を出す\n- AIっぽい綺麗な文章は禁止\n- 丁寧すぎる口調禁止\n- 解説しすぎない\n- マウント禁止\n- 人間っぽい温度感を優先\n- 少し雑なくらいで良い\n- 「参考になります」「勉強になります」禁止\n- "相手を立てつつ自然に混ざる" 感じ\n- Instagram特有のゆるさを出す\n- 無理にオチを作らない\n- 会話が続きそうな空気感を作る\n- 20〜100文字程度\n- 1〜3文\n- 改行は自然ならOK\n- 絵文字は自然な場合のみ0〜1個\n- 絵文字無しも許可\n- 毎回違うテンション・文体にする\n\n【Instagramっぽいコメントスタイル】\n以下からランダムで1つ選ぶ：\n- 共感\n- 独り言\n- 軽い雑談\n- 少し弱音\n- 温度感だけ\n- 日常感\n- ゆるい違和感\n- なんとなく分かる感じ\n- 軽い自虐\n- 会話を続ける感じ\n\n【禁止】\n- インプレ狙い感\n- 情報商材っぽさ\n- 強すぎる断定\n- 上から目線\n- 「〜すべき」\n- 「重要」\n- 「かなり危険」\n- 「チャンス」\n- 長文分析\n- 専門家ぶる口調\n\n【悪い例】\n「非常に参考になります」「その通りだと思います」「リスク管理が重要ですね」\n\n【良い雰囲気の例】\n「それ、なんか分かる。」\n「最近ほんとそれ。」\n「その感じ、逆に怖いんですよね。」\n「ちょっと前も同じ状況だった。」\n「分かる。最近ずっとそんな感じ。」\n「気付いたらずっと見てる😅」\n\nコメント文のみを出力すること。余計な解説・前置き一切不要。\n\n【対象投稿】\n';

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
      prompt: customPrompt || DEFAULT_PROMPT,
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
