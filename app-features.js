// app-features.js — themes, feed, AI architect, character bubble
// Loaded after app-core.js; reads/writes shared state declared there.

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES = [
  {
    id: 'modern', label: 'モダン', emoji: '🏙',
    accent: '#2d6a4f', accentHover: '#1b4332', accentLight: 'rgba(45,106,79,0.12)',
    bg: 'linear-gradient(160deg,#f0f4f0 0%,#e8f5e9 50%,#f5f0e8 100%)',
  },
  {
    id: 'washitsu', label: '和室', emoji: '🏯',
    accent: '#7c4d33', accentHover: '#5a3522', accentLight: 'rgba(124,77,51,0.12)',
    bg: 'linear-gradient(160deg,#fdf6ec 0%,#f5e6d3 50%,#ede0c8 100%)',
  },
  {
    id: 'mori', label: '森の書斎', emoji: '🌲',
    accent: '#1a5c38', accentHover: '#0d3d25', accentLight: 'rgba(26,92,56,0.12)',
    bg: 'linear-gradient(160deg,#e8f5e9 0%,#c8e6c9 40%,#dcedc8 100%)',
  },
  {
    id: 'night', label: '夜の図書館', emoji: '🌙',
    accent: '#7c6af7', accentHover: '#5b50d6', accentLight: 'rgba(124,106,247,0.15)',
    bg: 'linear-gradient(160deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)',
  },
  {
    id: 'seaside', label: '海辺の別荘', emoji: '🌊',
    accent: '#0077b6', accentHover: '#005f92', accentLight: 'rgba(0,119,182,0.12)',
    bg: 'linear-gradient(160deg,#e0f7fa 0%,#b2ebf2 40%,#e0f2f1 100%)',
  },
];

function applyTheme(themeId) {
  const t = THEMES.find(th => th.id === themeId) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--accent',       t.accent);
  r.setProperty('--accent-hover', t.accentHover);
  r.setProperty('--accent-light', t.accentLight);
  room.style.background = t.bg;
  document.body.dataset.theme = t.id;
}

function previewTheme(themeId) {
  applyTheme(themeId);
  pendingTheme = themeId;
}

function buildThemeCards() {
  if (!themeGrid) return;
  themeGrid.innerHTML = '';
  THEMES.forEach(t => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card' + (t.id === (state.roomTheme || 'modern') ? ' selected' : '');
    card.innerHTML = `
      <div class="theme-card-preview" style="background:${t.bg}">
        <div class="theme-accent-dot" style="background:${t.accent}"></div>
      </div>
      <span>${t.emoji} ${t.label}</span>`;
    card.addEventListener('click', () => {
      themeGrid.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      previewTheme(t.id);
    });
    themeGrid.appendChild(card);
  });
}

function openSettings() {
  pendingTheme = state.roomTheme || 'modern';
  buildThemeCards();
  settingsModal.hidden = false;
}

function closeSettings() {
  applyTheme(state.roomTheme || 'modern');
  settingsModal.hidden = true;
}

function applySettingsTheme() {
  state.roomTheme = pendingTheme;
  applyTheme(pendingTheme);
  saveState();
  if (isCloudMode && currentUser && cloudRoomId && DB.isAvailable()) {
    DB.upsertRoom({ id: cloudRoomId, user_id: currentUser.id, theme_id: pendingTheme }).catch(() => {});
  }
  settingsModal.hidden = true;
}

// ─── Character Bubble ─────────────────────────────────────────────────────────

function showBubble(text, durationMs = 3000) {
  if (!characterBubble) return;
  characterBubble.textContent = text;
  characterBubble.hidden = false;
  clearTimeout(characterBubble._timer);
  characterBubble._timer = setTimeout(() => { characterBubble.hidden = true; }, durationMs);
}

// ─── Star Particles ───────────────────────────────────────────────────────────

function spawnStars(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const cx   = rect.left + rect.width  / 2;
  const cy   = rect.top  + rect.height / 2;
  for (let i = 0; i < 8; i++) {
    const star = document.createElement('div');
    star.className = 'star-particle';
    star.textContent = '⭐';
    const angle = (i / 8) * Math.PI * 2;
    const dist  = 55 + Math.random() * 30;
    star.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    star.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    star.style.left = cx + 'px';
    star.style.top  = cy + 'px';
    document.body.appendChild(star);
    star.addEventListener('animationend', () => star.remove());
  }
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

const MOCK_FEED = [
  { id:'m1', profiles:{ display_name:'田中さん', avatar_emoji:'🦉' }, seeds:{ emoji:'📚', title:'アトミック・ハビッツ' },
    diary_text:'1%の改善を積み重ねる大切さを学んだ。小さな習慣が人生を変える。', views_count:24, created_at: new Date(Date.now()-3600000*2).toISOString() },
  { id:'m2', profiles:{ display_name:'山本さん', avatar_emoji:'🌸' }, seeds:{ emoji:'💡', title:'第一原理思考' },
    diary_text:'イーロン・マスクが使う問題解決法。前提を疑い、基礎から考え直す。', views_count:15, created_at: new Date(Date.now()-3600000*8).toISOString() },
  { id:'m3', profiles:{ display_name:'鈴木さん', avatar_emoji:'🎯' }, seeds:{ emoji:'🧠', title:'ポモドーロ・テクニック' },
    diary_text:'25分集中＋5分休憩のサイクル。集中力が劇的に改善した！', views_count:38, created_at: new Date(Date.now()-86400000).toISOString() },
  { id:'m4', profiles:{ display_name:'加藤さん', avatar_emoji:'🚀' }, seeds:{ emoji:'🔬', title:'第二の脳（Building a Second Brain）' },
    diary_text:'情報を外部に保存して、創造的な思考に脳を使う。PKMの革命。', views_count:52, created_at: new Date(Date.now()-86400000*2).toISOString() },
  { id:'m5', profiles:{ display_name:'伊藤さん', avatar_emoji:'💎' }, seeds:{ emoji:'⭐', title:'マインドフルネス瞑想' },
    diary_text:'毎朝10分の瞑想で、1日の集中力が変わった。継続は力なり。', views_count:19, created_at: new Date(Date.now()-86400000*3).toISOString() },
];

function formatRelativeTime(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins || 1}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

function openFeedModal() {
  feedModal.hidden = false;
  buildFeed();
}

function closeFeedModal() {
  feedModal.hidden = true;
}

async function buildFeed() {
  if (!feedList) return;
  feedList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">読み込み中...</p>';
  let posts = [];
  if (isCloudMode && DB.isAvailable()) {
    try {
      const { data, error } = await DB.loadFeed();
      if (!error && data && data.length) posts = data;
      else posts = MOCK_FEED;
    } catch { posts = MOCK_FEED; }
  } else {
    posts = MOCK_FEED;
  }
  feedList.innerHTML = '';
  if (!posts.length) {
    feedList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">まだ投稿がありません</p>';
    return;
  }
  posts.forEach(post => feedList.appendChild(buildPostCard(post)));
}

function buildPostCard(post) {
  const card = document.createElement('div');
  card.className = 'post-card';
  const viewed  = feedViewedPosts.has(post.id);
  const views   = feedViewCounts.get(post.id) ?? post.views_count;
  const profile = post.profiles || {};
  const seed    = post.seeds   || {};
  card.innerHTML = `
    <div class="post-header">
      <span class="post-avatar">${escapeHtml(profile.avatar_emoji || '👤')}</span>
      <div class="post-meta">
        <span class="post-name">${escapeHtml(profile.display_name || '匿名')}</span>
        <span class="post-time">${formatRelativeTime(post.created_at)}</span>
      </div>
    </div>
    <div class="post-seed-chip">${escapeHtml(seed.emoji || '📝')} ${escapeHtml(seed.title || '')}</div>
    ${post.diary_text ? `<p class="post-diary">${escapeHtml(post.diary_text)}</p>` : ''}
    <div class="post-footer">
      <button class="inran-btn${viewed ? ' viewed' : ''}" data-post-id="${escapeHtml(post.id)}">
        ⭐ 内覧 <span class="inran-count">${views}</span>
      </button>
    </div>`;
  card.querySelector('.inran-btn').addEventListener('click', e => handleInran(e, post));
  return card;
}

function handleInran(e, post) {
  const btn = e.currentTarget;
  if (feedViewedPosts.has(post.id)) return;
  feedViewedPosts.add(post.id);
  const newCount = (feedViewCounts.get(post.id) ?? post.views_count) + 1;
  feedViewCounts.set(post.id, newCount);
  btn.classList.add('viewed');
  btn.querySelector('.inran-count').textContent = newCount;
  spawnStars(btn);
  if (isCloudMode && currentUser && DB.isAvailable()) {
    DB.addView(post.id, currentUser.id).catch(() => {});
  }
}

// ─── AI Architect ─────────────────────────────────────────────────────────────

function showAiStep(n) {
  [aiStep1, aiStep2, aiStep3].forEach((s, i) => { if (s) s.hidden = i + 1 !== n; });
}

function openAiModal() {
  if (!aiModal) return;
  showAiStep(1);
  if (aiInput) { aiInput.value = ''; }
  if (aiCharCount) aiCharCount.textContent = '0 / 2000';
  aiExtracted = null;
  aiModal.hidden = false;
  if (aiInput) aiInput.focus();
}

function closeAiModal() {
  if (aiModal) aiModal.hidden = true;
}

function mockAnalyze(text) {
  const lower = text.toLowerCase();
  let emoji = '💡';
  if (/読|本|書|book|read/.test(lower))  emoji = '📚';
  else if (/プログラム|コード|code|develop|開発/.test(lower)) emoji = '💻';
  else if (/健康|運動|sleep|exercise|筋/.test(lower))        emoji = '🏃';
  else if (/音楽|music|song|melody/.test(lower))            emoji = '🎵';
  else if (/数学|math|統計|data/.test(lower))               emoji = '📊';
  else if (/科学|science|研究|experiment/.test(lower))      emoji = '🔬';
  else if (/旅|travel|adventure|旅行/.test(lower))          emoji = '🌍';
  else if (/投資|money|finance|お金/.test(lower))           emoji = '💎';

  const words = text.replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const title  = words.slice(0, 6).join(' ').slice(0, 30) || 'AI抽出メモ';
  const chunk  = Math.floor(text.length / 3);
  const points = [
    text.slice(0,        chunk).trim().slice(0, 60),
    text.slice(chunk,    chunk * 2).trim().slice(0, 60),
    text.slice(chunk * 2).trim().slice(0, 60),
  ].filter(Boolean);
  return { emoji, title, points };
}

async function callAnthropicAPI(text) {
  const apiKey = window.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('no key');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `以下のテキストから最も重要な知識を抽出してください。
JSON形式で返してください: {"emoji":"適切な絵文字1文字","title":"タイトル（30文字以内）","points":["ポイント1（60字以内）","ポイント2（60字以内）","ポイント3（60字以内）"]}

テキスト:\n${text.slice(0, 1500)}`,
      }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  return JSON.parse(data.content[0].text);
}

async function analyzeText(text) {
  try {
    return await callAnthropicAPI(text);
  } catch {
    return mockAnalyze(text);
  }
}

async function runAnalysis() {
  if (!aiInput) return;
  const text = aiInput.value.trim();
  if (!text) { aiInput.focus(); return; }
  showAiStep(2);
  const result = await analyzeText(text);
  aiExtracted = result;
  if (aiPreviewEmoji) aiPreviewEmoji.textContent = result.emoji || '💡';
  if (aiPreviewTitle) aiPreviewTitle.textContent = result.title || '無題';
  if (aiPointsList) {
    aiPointsList.innerHTML = '';
    (result.points || []).forEach(pt => {
      const li = document.createElement('li');
      li.textContent = pt;
      aiPointsList.appendChild(li);
    });
  }
  showAiStep(3);
  showBubble('抽出完了！配置しますか？🌱', 4000);
}

function placeSeedFromAI() {
  if (!aiExtracted) return;
  const pos  = pickSpawnPosition();
  const seed = migrateSeed({
    id: crypto.randomUUID(),
    title:    (aiExtracted.title || 'AI抽出').slice(0, 60),
    emoji:    aiExtracted.emoji || '💡',
    category: 'idea',
    memo:     (aiExtracted.points || []).map((p, i) => `${i+1}. ${p}`).join('\n'),
    x: pos.x, y: pos.y,
    createdAt: Date.now(),
  });
  state.seeds.push(seed);
  saveState(); render(); closeAiModal();
  syncSeedToCloud(seed);
  showBubble('知識の種を配置しました！✨', 3000);
  setTimeout(() => openSeedModal(seed.id), 160);
}
