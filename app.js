(() => {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────────

  const STORAGE_KEY    = 'knowledge_estate_v1';
  const SM2_DEFAULT_EF = 2.5;
  const SM2_MIN_EF     = 1.3;

  const EMOJI_LIST = [
    '📚','📖','💡','🔍','🎯','🌱','🏆','🧠',
    '💎','🔑','⭐','🚀','🎨','🔬','🌿','📝',
    '🧩','💻','📊','🎵','🌍','🔭','🏛','💬',
  ];

  const CATEGORIES = [
    { id: 'all',      label: 'すべて',       emoji: '🌐' },
    { id: 'book',     label: '読書',         emoji: '📚' },
    { id: 'idea',     label: 'アイデア',     emoji: '💡' },
    { id: 'learning', label: '学習',         emoji: '🧠' },
    { id: 'project',  label: 'プロジェクト', emoji: '🚀' },
    { id: 'insight',  label: '気づき',       emoji: '⭐' },
  ];

  // Room zones: [x%, y%]
  const SPAWN_ZONES = [
    [12, 28], [30, 22], [50, 18], [68, 24], [80, 18],
    [15, 52], [35, 48], [55, 44], [72, 50],
    [10, 70], [28, 68], [48, 66], [65, 72],
  ];

  // ─── SM-2 Helpers ─────────────────────────────────────────────────────────────

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function dateAfterDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function isDueToday(seed) {
    if (!seed.nextReviewDate) return true;
    return seed.nextReviewDate <= todayISO();
  }

  function formatShortDate(isoDate) {
    const days = Math.round((new Date(isoDate) - new Date(todayISO())) / 86400000);
    if (days <= 0) return '今日';
    if (days === 1) return '明日';
    if (days < 7)  return `${days}日後`;
    if (days < 30) return `${Math.round(days / 7)}週間後`;
    return `${Math.round(days / 30)}ヶ月後`;
  }

  function previewInterval(seed, quality) {
    let interval    = seed.srInterval    || 0;
    let repetitions = seed.srRepetitions || 0;
    let ef          = seed.srEaseFactor  || SM2_DEFAULT_EF;
    if (quality >= 3) {
      if (repetitions === 0)      interval = 1;
      else if (repetitions === 1) interval = 6;
      else                        interval = Math.round(interval * ef);
    } else {
      interval = 1;
    }
    return dateAfterDays(interval);
  }

  function applyReview(seed, quality) {
    let interval    = seed.srInterval    || 0;
    let repetitions = seed.srRepetitions || 0;
    let ef          = seed.srEaseFactor  || SM2_DEFAULT_EF;
    if (quality >= 3) {
      if (repetitions === 0)      interval = 1;
      else if (repetitions === 1) interval = 6;
      else                        interval = Math.round(interval * ef);
      repetitions++;
    } else {
      interval = 1; repetitions = 0;
    }
    ef = Math.max(SM2_MIN_EF, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    seed.srInterval     = interval;
    seed.srRepetitions  = repetitions;
    seed.srEaseFactor   = ef;
    seed.nextReviewDate = dateAfterDays(interval);
    seed.lastReviewedAt = Date.now();
  }

  function migrateSeed(seed) {
    if (seed.srInterval     === undefined) seed.srInterval     = 0;
    if (seed.srRepetitions  === undefined) seed.srRepetitions  = 0;
    if (seed.srEaseFactor   === undefined) seed.srEaseFactor   = SM2_DEFAULT_EF;
    if (seed.nextReviewDate === undefined) seed.nextReviewDate = null;
    return seed;
  }

  // ─── State ────────────────────────────────────────────────────────────────────

  let state         = { seeds: [], nextId: 1 };
  let editingId     = null;
  let addCategory   = 'book';
  let filterDueOnly = false;
  let aiExtracted   = null; // { title, emoji, points }

  // ─── Persistence ──────────────────────────────────────────────────────────────

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state = JSON.parse(raw); state.seeds = state.seeds.map(migrateSeed); }
    } catch { /* use default */ }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ─── DOM refs — Core ──────────────────────────────────────────────────────────

  const room            = document.getElementById('room');
  const seedsContainer  = document.getElementById('seedsContainer');
  const emptyState      = document.getElementById('emptyState');
  const statTotal       = document.getElementById('statTotal');
  const statDue         = document.getElementById('statDue');
  const statLearned     = document.getElementById('statLearned');
  const filterDueBtn    = document.getElementById('filterDueBtn');
  const filterBadge     = document.getElementById('filterBadge');
  const characterBubble = document.getElementById('characterBubble');

  // Seed modal
  const seedModal      = document.getElementById('seedModal');
  const modalClose     = document.getElementById('modalClose');
  const currentEmoji   = document.getElementById('currentEmoji');
  const emojiBtn       = document.getElementById('emojiBtn');
  const emojiGrid      = document.getElementById('emojiGrid');
  const modalTitle     = document.getElementById('modalTitle');
  const modalMemo      = document.getElementById('modalMemo');
  const modalSave      = document.getElementById('modalSave');
  const modalDelete    = document.getElementById('modalDelete');
  const reviewMetaText = document.getElementById('reviewMetaText');
  const reviewBtns     = document.querySelectorAll('.review-btn');

  // Add modal
  const addModal      = document.getElementById('addModal');
  const addModalClose = document.getElementById('addModalClose');
  const addSeedBtn    = document.getElementById('addSeedBtn');
  const emptyAddBtn   = document.getElementById('emptyAddBtn');
  const addTitle      = document.getElementById('addTitle');
  const addConfirmBtn = document.getElementById('addConfirmBtn');
  const categoryChips = document.getElementById('categoryChips');

  // AI modal
  const aiModal        = document.getElementById('aiModal');
  const aiAddBtn       = document.getElementById('aiAddBtn');
  const aiModalClose   = document.getElementById('aiModalClose');
  const aiStep1        = document.getElementById('aiStep1');
  const aiStep2        = document.getElementById('aiStep2');
  const aiStep3        = document.getElementById('aiStep3');
  const aiInput        = document.getElementById('aiInput');
  const aiCharCount    = document.getElementById('aiCharCount');
  const aiAnalyzeBtn   = document.getElementById('aiAnalyzeBtn');
  const aiBackBtn      = document.getElementById('aiBackBtn');
  const aiRetryBtn     = document.getElementById('aiRetryBtn');
  const aiPlaceBtn     = document.getElementById('aiPlaceBtn');
  const aiPreviewEmoji = document.getElementById('aiPreviewEmoji');
  const aiPreviewTitle = document.getElementById('aiPreviewTitle');
  const aiPointsList   = document.getElementById('aiPointsList');

  // ─── Render ───────────────────────────────────────────────────────────────────

  function render() {
    seedsContainer.innerHTML = '';
    const seeds    = state.seeds;
    const dueCount = seeds.filter(isDueToday).length;

    emptyState.hidden = seeds.length > 0;

    seeds.forEach((seed) => {
      const due = isDueToday(seed);
      const el  = document.createElement('div');
      el.className  = 'seed' + (filterDueOnly && !due ? ' dimmed' : '');
      el.dataset.id = seed.id;
      el.style.left = seed.x + '%';
      el.style.top  = seed.y + '%';

      const body = document.createElement('div');
      const cls  = ['seed-body'];
      if (due)                    cls.push('due');
      if (seed.srRepetitions > 0) cls.push('reviewed');
      body.className   = cls.join(' ');
      body.textContent = seed.emoji;

      const label = document.createElement('div');
      label.className  = 'seed-label';
      label.textContent = seed.title || '無題';

      el.appendChild(body);
      el.appendChild(label);
      el.addEventListener('click', () => openSeedModal(seed.id));
      seedsContainer.appendChild(el);
    });

    statTotal.textContent   = seeds.length;
    statDue.textContent     = dueCount;
    statLearned.textContent = seeds.filter(s => s.srRepetitions > 0).length;

    filterBadge.textContent = dueCount;
    filterBadge.hidden      = dueCount === 0;
    filterDueBtn.classList.toggle('active', filterDueOnly);
  }

  // ─── Emoji Grid ───────────────────────────────────────────────────────────────

  function buildEmojiGrid() {
    emojiGrid.innerHTML = '';
    EMOJI_LIST.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-option'; btn.textContent = emoji; btn.type = 'button';
      btn.addEventListener('click', () => { currentEmoji.textContent = emoji; emojiGrid.hidden = true; });
      emojiGrid.appendChild(btn);
    });
  }

  // ─── Category Chips ───────────────────────────────────────────────────────────

  function buildCategoryChips() {
    categoryChips.innerHTML = '';
    CATEGORIES.filter(c => c.id !== 'all').forEach(cat => {
      const btn = document.createElement('button');
      btn.className   = 'chip' + (cat.id === addCategory ? ' selected' : '');
      btn.textContent = cat.emoji + ' ' + cat.label;
      btn.type        = 'button';
      btn.addEventListener('click', () => { addCategory = cat.id; buildCategoryChips(); });
      categoryChips.appendChild(btn);
    });
  }

  // ─── Spawn Position ───────────────────────────────────────────────────────────

  function pickSpawnPosition() {
    const used   = state.seeds.map(s => ({ x: s.x, y: s.y }));
    const ROOM_W = room.clientWidth  || 360;
    const ROOM_H = room.clientHeight || 600;
    for (const [zx, zy] of SPAWN_ZONES) {
      const far = used.every(u => {
        const dx = (u.x - zx) / 100 * ROOM_W;
        const dy = (u.y - zy) / 100 * ROOM_H;
        return Math.hypot(dx, dy) > 72;
      });
      if (far) return { x: zx + (Math.random() * 6 - 3), y: zy + (Math.random() * 6 - 3) };
    }
    return { x: 8 + Math.random() * 82, y: 15 + Math.random() * 60 };
  }

  // ─── Seed Modal ───────────────────────────────────────────────────────────────

  function openSeedModal(id) {
    const seed = state.seeds.find(s => s.id === id);
    if (!seed) return;
    editingId = id;
    currentEmoji.textContent = seed.emoji;
    modalTitle.value         = seed.title || '';
    modalMemo.value          = seed.memo  || '';
    emojiGrid.hidden         = true;

    if (seed.nextReviewDate) {
      const dist = isDueToday(seed) ? '今日（復習してください）' : formatShortDate(seed.nextReviewDate);
      reviewMetaText.textContent = `次回の復習: ${dist}`;
    } else {
      reviewMetaText.textContent = '次回の復習: 未設定（初回評価してください）';
    }
    reviewBtns.forEach(btn => {
      const q = parseInt(btn.dataset.quality, 10);
      btn.querySelector('.review-btn-sub').textContent = formatShortDate(previewInterval(seed, q));
    });

    seedModal.hidden = false;
    modalTitle.focus();
  }

  function closeSeedModal() {
    seedModal.hidden = true; editingId = null; emojiGrid.hidden = true;
  }

  function saveSeed() {
    if (editingId === null) return;
    const seed = state.seeds.find(s => s.id === editingId);
    if (!seed) return;
    seed.emoji = currentEmoji.textContent;
    seed.title = modalTitle.value.trim() || '無題';
    seed.memo  = modalMemo.value;
    saveState(); render(); closeSeedModal();
  }

  function applyReviewAndClose(quality) {
    if (editingId === null) return;
    const seed = state.seeds.find(s => s.id === editingId);
    if (!seed) return;
    seed.emoji = currentEmoji.textContent;
    seed.title = modalTitle.value.trim() || '無題';
    seed.memo  = modalMemo.value;
    applyReview(seed, quality);
    saveState(); render(); closeSeedModal();
  }

  function deleteSeed() {
    if (editingId === null) return;
    if (!confirm('この知識の種を削除しますか?')) return;
    state.seeds = state.seeds.filter(s => s.id !== editingId);
    saveState(); render(); closeSeedModal();
  }

  // ─── Add Modal ────────────────────────────────────────────────────────────────

  function openAddModal() {
    addTitle.value = ''; addCategory = 'book';
    buildCategoryChips(); addModal.hidden = false; addTitle.focus();
  }
  function closeAddModal() { addModal.hidden = true; }

  function confirmAdd() {
    const title = addTitle.value.trim();
    if (!title) { addTitle.focus(); return; }
    const cat = CATEGORIES.find(c => c.id === addCategory) || CATEGORIES[1];
    const pos = pickSpawnPosition();
    const seed = migrateSeed({ id: state.nextId++, title, emoji: cat.emoji, category: addCategory, memo: '', x: pos.x, y: pos.y, createdAt: Date.now() });
    state.seeds.push(seed); saveState(); render(); closeAddModal();
    setTimeout(() => openSeedModal(seed.id), 160);
  }

  // ─── AI 建築士 ────────────────────────────────────────────────────────────────

  function showAiStep(n) {
    aiStep1.hidden = n !== 1;
    aiStep2.hidden = n !== 2;
    aiStep3.hidden = n !== 3;
  }

  function openAiModal() {
    aiInput.value = ''; aiCharCount.textContent = '0';
    aiInput.classList.remove('error');
    showAiStep(1); aiModal.hidden = false; aiInput.focus();
  }

  function closeAiModal() {
    aiModal.hidden = true; aiExtracted = null;
  }

  async function runAnalysis() {
    const text = aiInput.value.trim();
    if (text.length < 20) {
      aiInput.classList.add('error');
      setTimeout(() => aiInput.classList.remove('error'), 600);
      aiInput.focus(); return;
    }
    showAiStep(2);
    try {
      aiExtracted = await analyzeText(text);
      aiPreviewEmoji.textContent = aiExtracted.emoji;
      aiPreviewTitle.value       = aiExtracted.title;
      aiPointsList.innerHTML     = '';
      aiExtracted.points.forEach(pt => {
        const li = document.createElement('li');
        li.className   = 'ai-point-item';
        li.textContent = pt;
        aiPointsList.appendChild(li);
      });
      showAiStep(3);
    } catch (err) {
      showAiStep(1);
      const orig = aiAnalyzeBtn.innerHTML;
      aiAnalyzeBtn.textContent = '⚠ 失敗しました。再試行';
      setTimeout(() => { aiAnalyzeBtn.innerHTML = orig; }, 3000);
    }
  }

  // Entry point: real API if key set, mock otherwise.
  async function analyzeText(text) {
    const key = window.ANTHROPIC_API_KEY;
    if (key) return callAnthropicAPI(text, key);
    await new Promise(r => setTimeout(r, 1400)); // simulate latency
    return mockAnalyze(text);
  }

  // Heuristic mock — no network required.
  function mockAnalyze(text) {
    const lower = text.toLowerCase();
    const emojiMap = [
      { words: ['読書','本','書籍','book','novel','文学'],              emoji: '📚' },
      { words: ['python','javascript','プログラム','コード','software'], emoji: '💻' },
      { words: ['ビジネス','経営','マーケティング','戦略','startup'],    emoji: '🚀' },
      { words: ['心理','認知','脳','psychology','mindset'],              emoji: '🧠' },
      { words: ['歴史','文化','社会','culture'],                         emoji: '🌍' },
      { words: ['科学','研究','実験','data','analysis'],                 emoji: '🔬' },
      { words: ['音楽','アート','デザイン','creative','art'],            emoji: '🎨' },
      { words: ['健康','運動','栄養','sleep','wellness'],                emoji: '🌿' },
      { words: ['youtube','動画','video','channel'],                     emoji: '🎯' },
      { words: ['アイデア','発見','insight','ひらめき'],                  emoji: '💡' },
      { words: ['お金','投資','資産','finance','money'],                  emoji: '💎' },
    ];

    let emoji = '📝';
    for (const { words, emoji: e } of emojiMap) {
      if (words.some(w => lower.includes(w))) { emoji = e; break; }
    }

    const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0) || text;
    const title = firstLine.length > 24 ? firstLine.slice(0, 24) + '…' : firstLine;

    const sentences = text
      .split(/[。！？\n.!?]/)
      .map(s => s.replace(/^\s*[-・•\d.、①②③]+\s*/, '').trim())
      .filter(s => s.length >= 15 && s.length <= 80);

    const seen = new Set();
    const points = [];
    for (const s of sentences) {
      if (points.length >= 3) break;
      if (!seen.has(s)) { seen.add(s); points.push(s); }
    }
    while (points.length < 3) points.push(`テキストから抽出したポイント ${points.length + 1}`);

    return { title, emoji, points };
  }

  // Real Anthropic API call — activate by setting window.ANTHROPIC_API_KEY in the browser console.
  async function callAnthropicAPI(text, apiKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'content-type':                              'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `以下のテキストから知識カードを作成してください。JSONのみで回答してください。

テキスト:
${text.slice(0, 3000)}

回答形式（JSONのみ、前後の説明不要）:
{"title":"魅力的なタイトル（24文字以内）","emoji":"内容を象徴する絵文字1文字","points":["重要ポイント1（40文字以内）","重要ポイント2（40文字以内）","重要ポイント3（40文字以内）"]}`,
        }],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const raw  = data.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(raw);
  }

  // Place extracted seed into the room, then show the character bubble.
  function placeSeedFromAI() {
    const title  = (aiPreviewTitle.value.trim() || aiExtracted.title).slice(0, 60);
    const emoji  = aiPreviewEmoji.textContent;
    const memo   = aiExtracted.points.map((p, i) => `${'①②③'[i]} ${p}`).join('\n');
    const pos    = pickSpawnPosition();

    const seed = migrateSeed({
      id: state.nextId++, title, emoji, category: 'insight',
      memo, x: pos.x, y: pos.y, createdAt: Date.now(),
    });
    state.seeds.push(seed);
    saveState(); render(); closeAiModal();

    showBubble('新しい知識を\n設置した棚！✨');
  }

  let _bubbleTimer = null;
  function showBubble(message) {
    characterBubble.textContent = message;
    characterBubble.classList.add('visible');
    clearTimeout(_bubbleTimer);
    _bubbleTimer = setTimeout(() => characterBubble.classList.remove('visible'), 3600);
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────────

  addSeedBtn.addEventListener('click', openAddModal);
  emptyAddBtn.addEventListener('click', openAddModal);
  addModalClose.addEventListener('click', closeAddModal);
  addConfirmBtn.addEventListener('click', confirmAdd);
  addTitle.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAdd(); });

  modalClose.addEventListener('click', closeSeedModal);
  modalSave.addEventListener('click', saveSeed);
  modalDelete.addEventListener('click', deleteSeed);
  reviewBtns.forEach(btn => {
    btn.addEventListener('click', () => applyReviewAndClose(parseInt(btn.dataset.quality, 10)));
  });

  filterDueBtn.addEventListener('click', () => { filterDueOnly = !filterDueOnly; render(); });

  emojiBtn.addEventListener('click', e => { e.stopPropagation(); emojiGrid.hidden = !emojiGrid.hidden; });

  // AI modal
  aiAddBtn.addEventListener('click', openAiModal);
  aiModalClose.addEventListener('click', closeAiModal);
  aiBackBtn.addEventListener('click', () => showAiStep(1));
  aiRetryBtn.addEventListener('click', () => showAiStep(1));
  aiAnalyzeBtn.addEventListener('click', runAnalysis);
  aiPlaceBtn.addEventListener('click', placeSeedFromAI);
  aiInput.addEventListener('input', () => { aiCharCount.textContent = aiInput.value.length; });
  aiModal.addEventListener('click', e => { if (e.target === aiModal) closeAiModal(); });

  // Backdrop / Escape
  seedModal.addEventListener('click', e => { if (e.target === seedModal) closeSeedModal(); });
  addModal.addEventListener('click',  e => { if (e.target === addModal)  closeAddModal();  });
  document.addEventListener('click',  () => { emojiGrid.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!seedModal.hidden) closeSeedModal();
    else if (!addModal.hidden) closeAddModal();
    else if (!aiModal.hidden) closeAiModal();
  });

  // ─── Boot ─────────────────────────────────────────────────────────────────────

  buildEmojiGrid();
  loadState();
  render();

})();
