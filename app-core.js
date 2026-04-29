// app-core.js — constants, SM-2, state, persistence, DOM refs, render, seed/add modals
// Loaded first; all top-level declarations are accessible to later scripts.

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

const SPAWN_ZONES = [
  [12,28],[30,22],[50,18],[68,24],[80,18],
  [15,52],[35,48],[55,44],[72,50],
  [10,70],[28,68],[48,66],[65,72],
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
  return !seed.nextReviewDate || seed.nextReviewDate <= todayISO();
}

function formatShortDate(isoDate) {
  const days = Math.round((new Date(isoDate) - new Date(todayISO())) / 86400000);
  if (days <= 0) return '今日';
  if (days === 1) return '明日';
  if (days < 7)  return `${days}日後`;
  if (days < 30) return `${Math.round(days/7)}週間後`;
  return `${Math.round(days/30)}ヶ月後`;
}

function previewInterval(seed, quality) {
  let i = seed.srInterval || 0, r = seed.srRepetitions || 0, ef = seed.srEaseFactor || SM2_DEFAULT_EF;
  if (quality >= 3) { if (!r) i=1; else if (r===1) i=6; else i=Math.round(i*ef); }
  else i = 1;
  return dateAfterDays(i);
}

function applyReview(seed, quality) {
  let i = seed.srInterval || 0, r = seed.srRepetitions || 0, ef = seed.srEaseFactor || SM2_DEFAULT_EF;
  if (quality >= 3) { if (!r) i=1; else if (r===1) i=6; else i=Math.round(i*ef); r++; }
  else { i=1; r=0; }
  ef = Math.max(SM2_MIN_EF, ef + 0.1 - (5-quality)*(0.08+(5-quality)*0.02));
  seed.srInterval=i; seed.srRepetitions=r; seed.srEaseFactor=ef;
  seed.nextReviewDate=dateAfterDays(i); seed.lastReviewedAt=Date.now();
}

function migrateSeed(seed) {
  if (seed.srInterval     === undefined) seed.srInterval     = 0;
  if (seed.srRepetitions  === undefined) seed.srRepetitions  = 0;
  if (seed.srEaseFactor   === undefined) seed.srEaseFactor   = SM2_DEFAULT_EF;
  if (seed.nextReviewDate === undefined) seed.nextReviewDate = null;
  // Ensure UUID id so it works as Supabase PK
  if (!seed.id || typeof seed.id === 'number') seed.id = crypto.randomUUID();
  return seed;
}

function escapeHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── App State ────────────────────────────────────────────────────────────────

let state         = { seeds: [], nextId: 1, roomTheme: 'modern' };
let editingId     = null;
let addCategory   = 'book';
let filterDueOnly = false;
let aiExtracted   = null;
let pendingTheme  = 'modern';

// Auth / cloud — set by app-auth.js
let currentUser  = null;
let isCloudMode  = false;
let cloudRoomId  = null;

// Feed session state — set by app-features.js
let feedViewedPosts = new Set();
let feedViewCounts  = new Map();

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      state.seeds = (state.seeds || []).map(migrateSeed);
      state.roomTheme = state.roomTheme || 'modern';
    }
  } catch { /* use default */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function syncSeedToCloud(seed) {
  if (!isCloudMode || !currentUser || !cloudRoomId || !DB.isAvailable()) return;
  try { await DB.upsertSeed(DB.seedToRow(seed, currentUser.id, cloudRoomId)); } catch { /* silent */ }
}

async function deleteSeedFromCloud(id) {
  if (!isCloudMode || !currentUser || !DB.isAvailable()) return;
  try { await DB.deleteSeed(id); } catch { /* silent */ }
}

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

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

// Feed + Settings + Auth
const feedModal      = document.getElementById('feedModal');
const feedClose      = document.getElementById('feedClose');
const feedList       = document.getElementById('feedList');
const feedBtn        = document.getElementById('feedBtn');
const settingsModal  = document.getElementById('settingsModal');
const settingsClose  = document.getElementById('settingsClose');
const settingsApply  = document.getElementById('settingsApply');
const themeGrid      = document.getElementById('themeGrid');
const settingsBtn    = document.getElementById('settingsBtn');
const userBtn        = document.getElementById('userBtn');
const userAvatar     = document.getElementById('userAvatar');
const userMenu       = document.getElementById('userMenu');
const userMenuEmoji  = document.getElementById('userMenuEmoji');
const userMenuName   = document.getElementById('userMenuName');
const userMenuEmail  = document.getElementById('userMenuEmail');
const userMenuLogin  = document.getElementById('userMenuLogin');
const userMenuLogout = document.getElementById('userMenuLogout');
const authModal      = document.getElementById('authModal');
const authModalClose = document.getElementById('authModalClose');
const authTabLogin   = document.getElementById('authTabLogin');
const authTabRegister= document.getElementById('authTabRegister');
const authError      = document.getElementById('authError');
const authName       = document.getElementById('authName');
const authEmail      = document.getElementById('authEmail');
const authPassword   = document.getElementById('authPassword');
const authSubmitBtn  = document.getElementById('authSubmitBtn');
const authGuestBtn   = document.getElementById('authGuestBtn');
const authNote       = document.getElementById('authNote');
const migrateModal   = document.getElementById('migrateModal');
const migrateCount   = document.getElementById('migrateCount');
const migrateConfirm = document.getElementById('migrateConfirmBtn');
const migrateSkip    = document.getElementById('migrateSkipBtn');

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const seeds    = state.seeds;
  const dueCount = seeds.filter(isDueToday).length;

  emptyState.hidden = seeds.length > 0;

  // 3D layer (app-3d.js) owns the visual representation now;
  // the legacy DOM container stays cleared and hidden.
  if (seedsContainer) seedsContainer.innerHTML = '';

  statTotal.textContent   = seeds.length;
  statDue.textContent     = dueCount;
  statLearned.textContent = seeds.filter(s => s.srRepetitions > 0).length;
  filterBadge.textContent = dueCount;
  filterBadge.hidden      = dueCount === 0;
  filterDueBtn.classList.toggle('active', filterDueOnly);

  if (typeof window.render3D === 'function') {
    window.render3D(seeds, { filterDueOnly });
  }
}

// ─── Emoji Grid ───────────────────────────────────────────────────────────────

function buildEmojiGrid() {
  emojiGrid.innerHTML = '';
  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className='emoji-option'; btn.textContent=emoji; btn.type='button';
    btn.addEventListener('click', () => { currentEmoji.textContent=emoji; emojiGrid.hidden=true; });
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
    btn.addEventListener('click', () => { addCategory=cat.id; buildCategoryChips(); });
    categoryChips.appendChild(btn);
  });
}

// ─── Spawn Position ───────────────────────────────────────────────────────────

function pickSpawnPosition() {
  const used   = state.seeds.map(s => ({ x: s.x, y: s.y }));
  const ROOM_W = room.clientWidth  || 360;
  const ROOM_H = room.clientHeight || 600;
  for (const [zx, zy] of SPAWN_ZONES) {
    const far = used.every(u => Math.hypot((u.x-zx)/100*ROOM_W, (u.y-zy)/100*ROOM_H) > 72);
    if (far) return { x: zx+(Math.random()*6-3), y: zy+(Math.random()*6-3) };
  }
  return { x: 8+Math.random()*82, y: 15+Math.random()*60 };
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

  reviewMetaText.textContent = seed.nextReviewDate
    ? `次回の復習: ${isDueToday(seed) ? '今日（復習してください）' : formatShortDate(seed.nextReviewDate)}`
    : '次回の復習: 未設定（初回評価してください）';

  reviewBtns.forEach(btn => {
    btn.querySelector('.review-btn-sub').textContent =
      formatShortDate(previewInterval(seed, parseInt(btn.dataset.quality, 10)));
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
  syncSeedToCloud(seed);
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
  syncSeedToCloud(seed);
}

async function deleteSeed() {
  if (editingId === null) return;
  if (!confirm('この知識の種を削除しますか?')) return;
  const seed = state.seeds.find(s => s.id === editingId);
  state.seeds = state.seeds.filter(s => s.id !== editingId);
  saveState(); render(); closeSeedModal();
  if (seed) deleteSeedFromCloud(seed.id);
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
  const cat  = CATEGORIES.find(c => c.id === addCategory) || CATEGORIES[1];
  const pos  = pickSpawnPosition();
  const seed = migrateSeed({
    id: crypto.randomUUID(), title,
    emoji: cat.emoji, category: addCategory,
    memo: '', x: pos.x, y: pos.y, createdAt: Date.now(),
  });
  state.seeds.push(seed);
  saveState(); render(); closeAddModal();
  syncSeedToCloud(seed);
  setTimeout(() => openSeedModal(seed.id), 160);
}
