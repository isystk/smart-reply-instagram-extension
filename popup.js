const apiKeyEl = document.getElementById('apiKey');
const promptEl = document.getElementById('customPrompt');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['apiKey', 'customPrompt'], ({ apiKey, customPrompt }) => {
  if (apiKey) apiKeyEl.value = apiKey;
  promptEl.value = customPrompt !== undefined ? customPrompt : INSTAGRAM_REPLY_DEFAULT_PROMPT;
});

saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyEl.value.trim();
  const customPrompt = promptEl.value;

  if (!apiKey) {
    statusEl.textContent = 'APIキーを入力してください';
    statusEl.className = 'error';
    return;
  }

  chrome.storage.local.set({ apiKey, customPrompt }, () => {
    statusEl.textContent = '保存しました';
    statusEl.className = 'success';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = '';
    }, 2000);
  });
});

const resetBtn = document.getElementById('reset');

resetBtn.addEventListener('click', () => {
  promptEl.value = INSTAGRAM_REPLY_DEFAULT_PROMPT;
  chrome.storage.local.remove(['customPrompt'], () => {
    statusEl.textContent = 'デフォルトに戻しました';
    statusEl.className = 'success';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = '';
    }, 2000);
  });
});
