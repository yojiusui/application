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
    if (!seed.nextReviewDate) return true; // never reviewed → treat as due
    return seed.nextReviewDate <= todayISO();
  }

  // Returns human-readable distance string for a future ISO date
  function formatShortDate(isoDate) {
    const days = Math.round((new Date(isoDate) - new Date(todayISO())) / 86400000);
    if (days <= 0) return '今日';
    if (days === 1) return '明日';
    if (days < 7)  return `${days}日後`;
    if (days < 30) return `${Math.round(days / 7)}週間後`;
    return `${Math.round(days / 30)}ヶ月後`;
  }

  // Returns the next review date that WOULD result from applying quality q,
  // without mutating seed.
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

  // Applies SM-2 rating to seed in-place and updates nextReviewDate.
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
      interval    = 1;
      repetitions = 0;
    }

    ef = Math.max(SM2_MIN_EF, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    seed.srInterval      = interval;
    seed.srRepetitions   = repetitions;
    seed.srEaseFactor    = ef;
    seed.nextReviewDate  = dateAfterDays(interval);
    seed.lastReviewedAt  = Date.now();
  }

  // Add SM-2 fields to seeds created before this feature existed.
  function migrateSeed(seed) {
    if (seed.srInterval     === undefined) seed.srInterval     = 0;
    if (seed.srRepetitions  === undefined) seed.srRepetitions  = 0;
    if (seed.srEaseFactor   === undefined) seed.srEaseFactor   = SM2_DEFAULT_EF;
    if (seed.nextReviewDate === undefined) seed.nextReviewDate = null;
    return seed;
  }

  // ─── State ────────────────────────────────────────────────────────────────────

  let state        = { seeds: [], nextId: 1 };
  let editingId    = null;
  let addCategory  = 'book';
  let filterDueOnly = false;

  // ─── Persistence ──────────────────────────────────────────────────────────────

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw);
        state.seeds = state.seeds.map(migrateSeed);
      }
    } catch { /* use default */ }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ─── DOM refs ─────────────────────────────────────────────────────────────────

  const room           = document.getElementById('room');
  const seedsContainer = document.getElementById('seedsContainer');
  const emptyState     = document.getElementById('emptyState');
  const statTotal      = document.getElementById('statTotal');
  const statDue        = document.getElementById('statDue');
  const statLearned    = document.getElementById('statLearned');
  const filterDueBtn   = document.getElementById('filterDueBtn');
  const filterBadge    = document.getElementById('filterBadge');

  // Seed modal
  const seedModal       = document.getElementById('seedModal');
  const modalClose      = document.getElementById('modalClose');
  const currentEmoji    = document.getElementById('currentEmoji');
  const emojiBtn        = document.getElementById('emojiBtn');
  const emojiGrid       = document.getElementById('emojiGrid');
  const modalTitle      = document.getElementById('modalTitle');
  const modalMemo       = document.getElementById('modalMemo');
  const modalSave       = document.getElementById('modalSave');
  const modalDelete     = document.getElementById('modalDelete');
  const reviewMetaText  = document.getElementById('reviewMetaText');
  const reviewBtns      = document.querySelectorAll('.review-btn');

  // Add modal
  const addModal      = document.getElementById('addModal');
  const addModalClose = document.getElementById('addModalClose');
  const addSeedBtn    = document.getElementById('addSeedBtn');
  const emptyAddBtn   = document.getElementById('emptyAddBtn');
  const addTitle      = document.getElementById('addTitle');
  const addConfirmBtn = document.getElementById('addConfirmBtn');
  const categoryChips = document.getElementById('categoryChips');

  // ─── Render ───────────────────────────────────────────────────────────────────

  function render() {
    seedsContainer.innerHTML = '';
    const seeds    = state.seeds;
    const dueCount = seeds.filter(isDueToday).length;

    emptyState.hidden = seeds.length > 0;

    seeds.forEach((seed) => {
      const due = isDueToday(seed);

      const el = document.createElement('div');
      el.className = 'seed' + (filterDueOnly && !due ? ' dimmed' : '');
      el.dataset.id = seed.id;
      el.style.left = seed.x + '%';
      el.style.top  = seed.y + '%';

      const body = document.createElement('div');
      const bodyClasses = ['seed-body'];
      if (due)                    bodyClasses.push('due');
      if (seed.srRepetitions > 0) bodyClasses.push('reviewed');
      body.className   = bodyClasses.join(' ');
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

    // Header badge
    filterBadge.textContent = dueCount;
    filterBadge.hidden      = dueCount === 0;

    filterDueBtn.classList.toggle('active', filterDueOnly);
  }

  // ─── Emoji Grid ───────────────────────────────────────────────────────────────

  function buildEmojiGrid() {
    emojiGrid.innerHTML = '';
    EMOJI_LIST.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className   = 'emoji-option';
      btn.textContent = emoji;
      btn.type        = 'button';
      btn.addEventListener('click', () => {
        currentEmoji.textContent = emoji;
        emojiGrid.hidden = true;
      });
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
      btn.addEventListener('click', () => {
        addCategory = cat.id;
        buildCategoryChips();
      });
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

    // Review meta text
    if (seed.nextReviewDate) {
      const due  = isDueToday(seed);
      const dist = due ? '今日（復習してください）' : formatShortDate(seed.nextReviewDate);
      reviewMetaText.textContent = `次回の復習: ${dist}`;
    } else {
      reviewMetaText.textContent = '次回の復習: 未設定（初回評価してください）';
    }

    // Preview intervals on each rating button
    reviewBtns.forEach(btn => {
      const q    = parseInt(btn.dataset.quality, 10);
      const date = previewInterval(seed, q);
      btn.querySelector('.review-btn-sub').textContent = formatShortDate(date);
    });

    seedModal.hidden = false;
    modalTitle.focus();
  }

  function closeSeedModal() {
    seedModal.hidden = true;
    editingId        = null;
    emojiGrid.hidden = true;
  }

  // Save title/memo without recording a review.
  function saveSeed() {
    if (editingId === null) return;
    const seed = state.seeds.find(s => s.id === editingId);
    if (!seed) return;

    seed.emoji = currentEmoji.textContent;
    seed.title = modalTitle.value.trim() || '無題';
    seed.memo  = modalMemo.value;

    saveState();
    render();
    closeSeedModal();
  }

  // Apply SM-2 quality rating, save title/memo, then close.
  function applyReviewAndClose(quality) {
    if (editingId === null) return;
    const seed = state.seeds.find(s => s.id === editingId);
    if (!seed) return;

    seed.emoji = currentEmoji.textContent;
    seed.title = modalTitle.value.trim() || '無題';
    seed.memo  = modalMemo.value;

    applyReview(seed, quality);

    saveState();
    render();
    closeSeedModal();
  }

  function deleteSeed() {
    if (editingId === null) return;
    if (!confirm('この知識の種を削除しますか?')) return;

    state.seeds = state.seeds.filter(s => s.id !== editingId);
    saveState();
    render();
    closeSeedModal();
  }

  // ─── Add Modal ────────────────────────────────────────────────────────────────

  function openAddModal() {
    addTitle.value = '';
    addCategory    = 'book';
    buildCategoryChips();
    addModal.hidden = false;
    addTitle.focus();
  }

  function closeAddModal() {
    addModal.hidden = true;
  }

  function confirmAdd() {
    const title = addTitle.value.trim();
    if (!title) { addTitle.focus(); return; }

    const cat = CATEGORIES.find(c => c.id === addCategory) || CATEGORIES[1];
    const pos = pickSpawnPosition();

    const seed = migrateSeed({
      id:        state.nextId++,
      title,
      emoji:     cat.emoji,
      category:  addCategory,
      memo:      '',
      x:         pos.x,
      y:         pos.y,
      createdAt: Date.now(),
    });

    state.seeds.push(seed);
    saveState();
    render();
    closeAddModal();

    setTimeout(() => openSeedModal(seed.id), 160);
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

  filterDueBtn.addEventListener('click', () => {
    filterDueOnly = !filterDueOnly;
    render();
  });

  emojiBtn.addEventListener('click', e => {
    e.stopPropagation();
    emojiGrid.hidden = !emojiGrid.hidden;
  });

  seedModal.addEventListener('click', e => { if (e.target === seedModal) closeSeedModal(); });
  addModal.addEventListener('click',  e => { if (e.target === addModal)  closeAddModal();  });

  document.addEventListener('click',   () => { emojiGrid.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!seedModal.hidden) closeSeedModal();
    else if (!addModal.hidden) closeAddModal();
  });

  // ─── Boot ─────────────────────────────────────────────────────────────────────

  buildEmojiGrid();
  loadState();
  render();

})();
