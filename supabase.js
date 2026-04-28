// ─── Supabase Client ─────────────────────────────────────────────────────────
// Fill in your project credentials to enable cloud sync + auth.
// Dashboard → Project Settings → API
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';

const _ready = !SUPABASE_URL.includes('YOUR_PROJECT_ID')
            && typeof window.supabase !== 'undefined';

const _sb = _ready
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

const DB = {
  isAvailable: () => !!_sb,

  // ── Auth ──────────────────────────────────────────────────────────────────
  signUp: (email, password, displayName) =>
    _sb.auth.signUp({ email, password, options: { data: { display_name: displayName } } }),

  signIn: (email, password) =>
    _sb.auth.signInWithPassword({ email, password }),

  signOut: () => _sb.auth.signOut(),

  getSession: () => _sb.auth.getSession(),

  onAuthStateChange: (cb) => _sb.auth.onAuthStateChange(cb),

  // ── Profile ───────────────────────────────────────────────────────────────
  async ensureProfile(user) {
    const { data } = await _sb.from('profiles')
      .select('id').eq('id', user.id).maybeSingle();
    if (!data) {
      const name = user.user_metadata?.display_name
                || user.email.split('@')[0];
      await _sb.from('profiles').insert({
        id: user.id, display_name: name, avatar_emoji: '🌱',
      });
    }
  },

  getProfile: (userId) =>
    _sb.from('profiles').select('*').eq('id', userId).single(),

  // ── Room ──────────────────────────────────────────────────────────────────
  loadRoom: (userId) =>
    _sb.from('rooms').select('*').eq('user_id', userId).maybeSingle(),

  upsertRoom: (row) =>
    _sb.from('rooms').upsert(row, { onConflict: 'user_id' }),

  // ── Seeds ─────────────────────────────────────────────────────────────────
  loadSeeds: (userId) =>
    _sb.from('seeds').select('*').eq('user_id', userId).order('created_at'),

  upsertSeed: (row) =>
    _sb.from('seeds').upsert(row),

  deleteSeed: (id) =>
    _sb.from('seeds').delete().eq('id', id),

  // ── Feed ──────────────────────────────────────────────────────────────────
  loadFeed: () =>
    _sb.from('feed_posts')
      .select('*, profiles(display_name, avatar_emoji), seeds(emoji, title)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20),

  addView: (postId, viewerId) =>
    _sb.from('seed_views').insert({ post_id: postId, viewer_id: viewerId }),

  // ── Row normalizers ───────────────────────────────────────────────────────
  seedToRow(seed, userId, roomId) {
    if (!seed.supabaseId) seed.supabaseId = crypto.randomUUID();
    return {
      id:               seed.supabaseId,
      room_id:          roomId,
      user_id:          userId,
      title:            seed.title,
      emoji:            seed.emoji,
      memo:             seed.memo  || '',
      category:         seed.category || 'idea',
      x_percent:        parseFloat(seed.x.toFixed(2)),
      y_percent:        parseFloat(seed.y.toFixed(2)),
      sr_interval:      seed.srInterval    || 0,
      sr_repetitions:   seed.srRepetitions || 0,
      sr_ease_factor:   parseFloat((seed.srEaseFactor || 2.5).toFixed(2)),
      next_review_date: seed.nextReviewDate || null,
      last_reviewed_at: seed.lastReviewedAt
        ? new Date(seed.lastReviewedAt).toISOString() : null,
    };
  },

  rowToSeed(row) {
    return {
      id:             row.id,
      supabaseId:     row.id,
      title:          row.title,
      emoji:          row.emoji,
      memo:           row.memo  || '',
      category:       row.category || 'idea',
      x:              parseFloat(row.x_percent),
      y:              parseFloat(row.y_percent),
      srInterval:     row.sr_interval    || 0,
      srRepetitions:  row.sr_repetitions || 0,
      srEaseFactor:   parseFloat(row.sr_ease_factor || 2.5),
      nextReviewDate: row.next_review_date || null,
      lastReviewedAt: row.last_reviewed_at
        ? new Date(row.last_reviewed_at).getTime() : null,
      createdAt:      new Date(row.created_at).getTime(),
    };
  },
};
