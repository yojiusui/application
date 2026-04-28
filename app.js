// app.js — event wiring + boot
// Loaded last; all functions from app-core / app-features / app-auth are available.

// ─── Seed Modal ───────────────────────────────────────────────────────────────

modalClose?.addEventListener('click',  closeSeedModal);
seedModal?.addEventListener('click',   e => { if (e.target === seedModal) closeSeedModal(); });
modalSave?.addEventListener('click',   saveSeed);
modalDelete?.addEventListener('click', deleteSeed);
emojiBtn?.addEventListener('click',    () => { emojiGrid.hidden = !emojiGrid.hidden; });

reviewBtns?.forEach(btn => {
  btn.addEventListener('click', () => applyReviewAndClose(parseInt(btn.dataset.quality, 10)));
});

// ─── Add Modal ────────────────────────────────────────────────────────────────

addSeedBtn?.addEventListener('click',  openAddModal);
emptyAddBtn?.addEventListener('click', openAddModal);
addModalClose?.addEventListener('click', closeAddModal);
addModal?.addEventListener('click',    e => { if (e.target === addModal) closeAddModal(); });
addConfirmBtn?.addEventListener('click', confirmAdd);
addTitle?.addEventListener('keydown',  e => { if (e.key === 'Enter') confirmAdd(); });

// ─── Filter ───────────────────────────────────────────────────────────────────

filterDueBtn?.addEventListener('click', () => {
  filterDueOnly = !filterDueOnly;
  render();
});

// ─── AI Modal ─────────────────────────────────────────────────────────────────

aiAddBtn?.addEventListener('click',    openAiModal);
aiModalClose?.addEventListener('click', closeAiModal);
aiModal?.addEventListener('click',     e => { if (e.target === aiModal) closeAiModal(); });
aiInput?.addEventListener('input',     () => {
  if (aiCharCount) aiCharCount.textContent = `${aiInput.value.length} / 2000`;
});
aiAnalyzeBtn?.addEventListener('click', runAnalysis);
aiBackBtn?.addEventListener('click',   () => showAiStep(1));
aiRetryBtn?.addEventListener('click',  runAnalysis);
aiPlaceBtn?.addEventListener('click',  placeSeedFromAI);

// ─── Feed ─────────────────────────────────────────────────────────────────────

feedBtn?.addEventListener('click',   openFeedModal);
feedClose?.addEventListener('click', closeFeedModal);
feedModal?.addEventListener('click', e => { if (e.target === feedModal) closeFeedModal(); });

// ─── Settings ─────────────────────────────────────────────────────────────────

settingsBtn?.addEventListener('click',   openSettings);
settingsClose?.addEventListener('click', closeSettings);
settingsApply?.addEventListener('click', applySettingsTheme);
settingsModal?.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

// ─── Auth / User ──────────────────────────────────────────────────────────────

userBtn?.addEventListener('click',         e => { e.stopPropagation(); toggleUserMenu(); });
userMenuLogin?.addEventListener('click',   openAuthModal);
userMenuLogout?.addEventListener('click',  handleSignOut);
authModalClose?.addEventListener('click',  closeAuthModal);
authModal?.addEventListener('click',       e => { if (e.target === authModal) closeAuthModal(); });
authTabLogin?.addEventListener('click',    () => switchAuthTab('login'));
authTabRegister?.addEventListener('click', () => switchAuthTab('register'));
authSubmitBtn?.addEventListener('click',   handleAuthSubmit);
authGuestBtn?.addEventListener('click',    closeAuthModal);
authPassword?.addEventListener('keydown',  e => { if (e.key === 'Enter') handleAuthSubmit(); });

migrateConfirm?.addEventListener('click',  performMigration);
migrateSkip?.addEventListener('click',     skipMigration);

document.addEventListener('click', e => {
  if (userMenu && !userMenu.hidden && !userBtn?.contains(e.target) && !userMenu.contains(e.target)) {
    closeUserMenu();
  }
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (seedModal      && !seedModal.hidden)      closeSeedModal();
    else if (addModal  && !addModal.hidden)       closeAddModal();
    else if (aiModal   && !aiModal.hidden)        closeAiModal();
    else if (feedModal && !feedModal.hidden)      closeFeedModal();
    else if (settingsModal && !settingsModal.hidden) closeSettings();
    else if (authModal && !authModal.hidden)      closeAuthModal();
    else if (userMenu  && !userMenu.hidden)       closeUserMenu();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  buildEmojiGrid();
  loadState();
  applyTheme(state.roomTheme || 'modern');
  render();
  await initAuth();
})();
