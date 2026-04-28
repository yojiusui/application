(() => {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────────

  const STORAGE_KEY = 'knowledge_estate_v1';

  const EMOJI_LIST = [
    '📚','📖','💡','🔍','🎯','🌱','🏆','🧠',
    '💎','🔑','⭐','🚀','🎨','🔬','🌿','📝',
    '🧩','💻','📊','🎵','🌍','🔭','🏛','💬',
  ];

  const CATEGORIES = [
    { id: 'all',       label: 'すべて',   emoji: '🌐' },
    { id: 'book',      label: '読書',     emoji: '📚' },
    { id: 'idea',      label: 'アイデア', emoji: '💡' },
    { id: 'learning',  label: '学習',     emoji: '🧠' },
    { id: 'project',   label: 'プロジェクト', emoji: '🚀' },
    { id: 'insight',   label: '気づき',   emoji: '⭐' },
  ];

  // Room zones: [x%, y%] relative to room dimensions
  const SPAWN_ZONES = [
    [12, 28], [30, 22], [50, 18], [68, 24], [80, 18],
    [15, 52], [35, 48], [55, 44], [72, 50],
    [10, 70], [28, 68], [48, 66], [65, 72],
  ];

  // ─── State ────────────────────────────────────────────────────────────────────

  let state = { seeds: [], nextId: 1 };
  let editingId = null;
  let addCategory = 'book';

  // ─── Persistence ──────────────────────────────────────────────────────────────

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
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
  const statReviewed   = document.getElementById('statReviewed');

  // Seed modal
  const seedModal    = document.getElementById('seedModal');
  const modalClose   = document.getElementById('modalClose');
  const currentEmoji = document.getElementById('currentEmoji');
  const emojiBtn     = document.getElementById('emojiBtn');
  const emojiGrid    = document.getElementById('emojiGrid');
  const modalTitle   = document.getElementById('modalTitle');
  const modalMemo    = document.getElementById('modalMemo');
  const modalReviewed= document.getElementById('modalReviewed');
  const modalSave    = document.getElementById('modalSave');
  const modalDelete  = document.getElementById('modalDelete');

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
    const seeds = state.seeds;

    emptyState.hidden = seeds.length > 0;

    seeds.forEach((seed) => {
      const el = document.createElement('div');
      el.className = 'seed';
      el.dataset.id = seed.id;
      el.style.left = seed.x + '%';
      el.style.top  = seed.y + '%';

      const body = document.createElement('div');
      body.className = 'seed-body' + (seed.reviewed ? ' reviewed' : '');
      body.textContent = seed.emoji;

      const label = document.createElement('div');
      label.className = 'seed-label';
      label.textContent = seed.title || '無題';

      el.appendChild(body);
      el.appendChild(label);
      el.addEventListener('click', () => openSeedModal(seed.id));
      seedsContainer.appendChild(el);
    });

    statTotal.textContent    = seeds.length;
    statReviewed.textContent = seeds.filter(s => s.reviewed).length;
  }

  // ─── Emoji Grid ───────────────────────────────────────────────────────────────

  function buildEmojiGrid() {
    emojiGrid.innerHTML = '';
    EMOJI_LIST.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-option';
      btn.textContent = emoji;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        currentEmoji.textContent = emoji;
        emojiGrid.hidden = true;
      });
      emojiGrid.appendChild(btn);
    });
  }

  // ─── Category Chips (add modal) ───────────────────────────────────────────────

  function buildCategoryChips() {
    categoryChips.innerHTML = '';
    CATEGORIES.filter(c => c.id !== 'all').forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (cat.id === addCategory ? ' selected' : '');
      btn.textContent = cat.emoji + ' ' + cat.label;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        addCategory = cat.id;
        buildCategoryChips();
      });
      categoryChips.appendChild(btn);
    });
  }

  // ─── Spawn position ───────────────────────────────────────────────────────────

  function pickSpawnPosition() {
    const used = state.seeds.map(s => ({ x: s.x, y: s.y }));
    const ROOM_W = room.clientWidth  || 360;
    const ROOM_H = room.clientHeight || 600;

    // Try predefined zones first
    for (const [zx, zy] of SPAWN_ZONES) {
      const far = used.every(u => {
        const dx = (u.x - zx) / 100 * ROOM_W;
        const dy = (u.y - zy) / 100 * ROOM_H;
        return Math.hypot(dx, dy) > 72;
      });
      if (far) return { x: zx + (Math.random() * 6 - 3), y: zy + (Math.random() * 6 - 3) };
    }

    // Fallback: random inside safe area
    return {
      x: 8 + Math.random() * 82,
      y: 15 + Math.random() * 60,
    };
  }

  // ─── Seed Modal ───────────────────────────────────────────────────────────────

  function openSeedModal(id) {
    const seed = state.seeds.find(s => s.id === id);
    if (!seed) return;

    editingId = id;
    currentEmoji.textContent  = seed.emoji;
    modalTitle.value          = seed.title || '';
    modalMemo.value           = seed.memo  || '';
    modalReviewed.checked     = !!seed.reviewed;
    emojiGrid.hidden          = true;

    seedModal.hidden = false;
    modalTitle.focus();
  }

  function closeSeedModal() {
    seedModal.hidden = true;
    editingId = null;
    emojiGrid.hidden = true;
  }

  function saveSeed() {
    if (editingId === null) return;
    const seed = state.seeds.find(s => s.id === editingId);
    if (!seed) return;

    seed.emoji    = currentEmoji.textContent;
    seed.title    = modalTitle.value.trim() || '無題';
    seed.memo     = modalMemo.value;
    seed.reviewed = modalReviewed.checked;

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
    addCategory = 'book';
    buildCategoryChips();
    addModal.hidden = false;
    addTitle.focus();
  }

  function closeAddModal() {
    addModal.hidden = true;
  }

  function confirmAdd() {
    const title = addTitle.value.trim();
    if (!title) {
      addTitle.focus();
      return;
    }

    const cat   = CATEGORIES.find(c => c.id === addCategory) || CATEGORIES[1];
    const pos   = pickSpawnPosition();

    const seed = {
      id:       state.nextId++,
      title,
      emoji:    cat.emoji,
      category: addCategory,
      memo:     '',
      reviewed: false,
      x:        pos.x,
      y:        pos.y,
      createdAt: Date.now(),
    };

    state.seeds.push(seed);
    saveState();
    render();
    closeAddModal();

    // Briefly open the seed modal to let user write a memo
    setTimeout(() => openSeedModal(seed.id), 160);
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────────

  // Header + empty-state add button
  addSeedBtn.addEventListener('click', openAddModal);
  emptyAddBtn.addEventListener('click', openAddModal);

  // Add modal
  addModalClose.addEventListener('click', closeAddModal);
  addConfirmBtn.addEventListener('click', confirmAdd);
  addTitle.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAdd(); });

  // Seed modal — close / save / delete
  modalClose.addEventListener('click', closeSeedModal);
  modalSave.addEventListener('click', saveSeed);
  modalDelete.addEventListener('click', deleteSeed);

  // Emoji picker toggle
  emojiBtn.addEventListener('click', e => {
    e.stopPropagation();
    emojiGrid.hidden = !emojiGrid.hidden;
  });

  // Close overlays on backdrop click
  seedModal.addEventListener('click', e => {
    if (e.target === seedModal) closeSeedModal();
  });
  addModal.addEventListener('click', e => {
    if (e.target === addModal) closeAddModal();
  });

  // Close emoji grid on outside click
  document.addEventListener('click', () => { emojiGrid.hidden = true; });

  // Keyboard: Escape closes modals
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
