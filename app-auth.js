// app-auth.js — Supabase auth, cloud sync, user UI
// Loaded after app-features.js; reads/writes shared state from app-core.js.

// ─── Auth Init ────────────────────────────────────────────────────────────────

async function initAuth() {
  if (!DB.isAvailable()) {
    updateUserUI(null);
    return;
  }
  DB.onAuthStateChange((_event, session) => {
    if (session?.user) onUserLogin(session.user);
    else               onUserLogout();
  });
  const { data } = await DB.getSession();
  if (data?.session?.user) await onUserLogin(data.session.user);
  else                       updateUserUI(null);
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

async function onUserLogin(user) {
  currentUser = user;
  isCloudMode = true;
  await DB.ensureProfile(user);
  const { data: profile } = await DB.getProfile(user.id);
  updateUserUI(profile || { display_name: user.email.split('@')[0], avatar_emoji: '🌱' });
  await loadCloudData();
}

function onUserLogout() {
  currentUser = null;
  isCloudMode = false;
  cloudRoomId = null;
  updateUserUI(null);
}

async function loadCloudData() {
  if (!currentUser || !DB.isAvailable()) return;

  // Load or create room
  const { data: roomRow } = await DB.loadRoom(currentUser.id);
  if (roomRow) {
    cloudRoomId = roomRow.id;
    state.roomTheme = roomRow.theme_id || 'modern';
    applyTheme(state.roomTheme);
  } else {
    const newRoomId = crypto.randomUUID();
    await DB.upsertRoom({ id: newRoomId, user_id: currentUser.id, theme_id: state.roomTheme });
    cloudRoomId = newRoomId;
  }

  // Check local seeds for migration
  const localSeeds = state.seeds.filter(s => !s.supabaseId);
  if (localSeeds.length > 0) {
    showMigrateDialog(localSeeds.length);
    return;
  }

  // Load cloud seeds
  const { data: rows } = await DB.loadSeeds(currentUser.id);
  if (rows && rows.length) {
    state.seeds = rows.map(DB.rowToSeed);
    saveState();
    render();
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────

function showMigrateDialog(count) {
  if (!migrateModal || !migrateCount) return;
  migrateCount.textContent = count;
  migrateModal.hidden = false;
}

async function performMigration() {
  if (!migrateModal) return;
  migrateModal.hidden = true;
  if (!cloudRoomId || !currentUser) return;
  for (const seed of state.seeds) {
    try {
      await DB.upsertSeed(DB.seedToRow(seed, currentUser.id, cloudRoomId));
    } catch { /* continue */ }
  }
  showBubble('クラウドへの移行が完了しました！☁️', 3500);
}

function skipMigration() {
  if (!migrateModal) return;
  migrateModal.hidden = true;
  // Load cloud seeds, overwriting local
  DB.loadSeeds(currentUser.id).then(({ data: rows }) => {
    if (rows && rows.length) {
      state.seeds = rows.map(DB.rowToSeed);
      saveState();
      render();
    }
  }).catch(() => {});
}

// ─── User UI ──────────────────────────────────────────────────────────────────

function updateUserUI(profile) {
  if (!userBtn) return;
  if (profile) {
    userBtn.classList.remove('guest');
    userBtn.classList.add('logged-in');
    if (userAvatar)    userAvatar.textContent = profile.avatar_emoji || '🌱';
    if (userMenuEmoji) userMenuEmoji.textContent = profile.avatar_emoji || '🌱';
    if (userMenuName)  userMenuName.textContent  = profile.display_name || '';
    if (userMenuEmail) userMenuEmail.textContent = currentUser?.email   || '';
    if (userMenuLogin)  userMenuLogin.hidden  = true;
    if (userMenuLogout) userMenuLogout.hidden = false;
  } else {
    userBtn.classList.remove('logged-in');
    userBtn.classList.add('guest');
    if (userAvatar) userAvatar.textContent = '👤';
    if (userMenuLogin)  userMenuLogin.hidden  = false;
    if (userMenuLogout) userMenuLogout.hidden = true;
  }
}

// ─── User Menu ────────────────────────────────────────────────────────────────

function toggleUserMenu() {
  if (!userMenu) return;
  userMenu.hidden = !userMenu.hidden;
}

function closeUserMenu() {
  if (userMenu) userMenu.hidden = true;
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

let authMode = 'login';

function openAuthModal() {
  if (!authModal) return;
  authMode = 'login';
  switchAuthTab('login');
  if (authError) { authError.hidden = true; authError.textContent = ''; }
  if (authEmail)    authEmail.value    = '';
  if (authPassword) authPassword.value = '';
  if (authName)     authName.value     = '';
  authModal.hidden = false;
  closeUserMenu();
  if (authEmail) authEmail.focus();
}

function closeAuthModal() {
  if (authModal) authModal.hidden = true;
}

function switchAuthTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  if (authTabLogin)    authTabLogin.classList.toggle('active',    isLogin);
  if (authTabRegister) authTabRegister.classList.toggle('active', !isLogin);
  if (authName)        authName.hidden     = isLogin;
  if (authSubmitBtn)   authSubmitBtn.textContent = isLogin ? 'ログイン' : '新規登録';
  if (authNote)        authNote.hidden     = DB.isAvailable();
  if (authError)       { authError.hidden = true; authError.textContent = ''; }
}

async function handleAuthSubmit() {
  if (!DB.isAvailable()) {
    if (authNote) authNote.hidden = false;
    return;
  }
  const email    = authEmail?.value.trim()    || '';
  const password = authPassword?.value.trim() || '';
  const name     = authName?.value.trim()     || '';
  if (!email || !password) return;
  if (authSubmitBtn) authSubmitBtn.disabled = true;
  if (authError)     { authError.hidden = true; authError.textContent = ''; }
  try {
    let result;
    if (authMode === 'login') {
      result = await DB.signIn(email, password);
    } else {
      if (!name) { showAuthError('表示名を入力してください'); return; }
      result = await DB.signUp(email, password, name);
    }
    if (result.error) throw result.error;
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message || '認証に失敗しました');
  } finally {
    if (authSubmitBtn) authSubmitBtn.disabled = false;
  }
}

function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.hidden = false;
}

async function handleSignOut() {
  closeUserMenu();
  if (!DB.isAvailable()) return;
  await DB.signOut().catch(() => {});
}
