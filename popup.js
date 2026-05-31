const DEFAULT_PROMPT =
  '以下のInstagram投稿に対して、\n自然なコメントを1件だけ作成してください。\n\n【最重要】\n- "会話している感じ" を出す\n- AIっぽい綺麗な文章は禁止\n- 丁寧すぎる口調禁止\n- 解説しすぎない\n- マウント禁止\n- 人間っぽい温度感を優先\n- 少し雑なくらいで良い\n- 「参考になります」「勉強になります」禁止\n- "相手を立てつつ自然に混ざる" 感じ\n- Instagram特有のゆるさを出す\n- 無理にオチを作らない\n- 会話が続きそうな空気感を作る\n- 20〜100文字程度\n- 1〜3文\n- 改行は自然ならOK\n- 絵文字は自然な場合のみ0〜1個\n- 絵文字無しも許可\n- 毎回違うテンション・文体にする\n- 相手の言語で回答する（相手が日本語なら日本語、英語なら英語）\n\n【Instagramっぽいコメントスタイル】\n以下からランダムで1つ選ぶ：\n- 共感\n- 独り言\n- 軽い雑談\n- 少し弱音\n- 温度感だけ\n- 日常感\n- ゆるい違和感\n- なんとなく分かる感じ\n- 軽い自虐\n- 会話を続ける感じ\n\n【禁止】\n- インプレ狙い感\n- 情報商材っぽさ\n- 強すぎる断定\n- 上から目線\n- 「〜すべき」\n- 「重要」\n- 「かなり危険」\n- 「チャンス」\n- 長文分析\n- 専門家ぶる口調\n\n【悪い例】\n「非常に参考になります」「その通りだと思います」「リスク管理が重要ですね」\n\n【良い雰囲気の例】\n「それ、なんか分かる。」\n「最近ほんとそれ。」\n「その感じ、逆に怖いんですよね。」\n「ちょっと前も同じ状況だった。」\n「分かる。最近ずっとそんな感じ。」\n「気付いたらずっと見てる😅」\n\nコメント文のみを出力すること。余計な解説・前置き一切不要。\n\n【対象投稿】\n';

const apiKeyEl = document.getElementById('apiKey');
const promptEl = document.getElementById('customPrompt');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['apiKey', 'customPrompt'], ({ apiKey, customPrompt }) => {
  if (apiKey) apiKeyEl.value = apiKey;
  promptEl.value = customPrompt !== undefined ? customPrompt : DEFAULT_PROMPT;
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
  promptEl.value = DEFAULT_PROMPT;
  chrome.storage.local.remove(['customPrompt'], () => {
    statusEl.textContent = 'デフォルトに戻しました';
    statusEl.className = 'success';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = '';
    }, 2000);
  });
});
