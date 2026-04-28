-- KNOWLEDGE ESTATE — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  avatar_emoji  TEXT NOT NULL DEFAULT '🌱',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Rooms (one per user) ──────────────────────────────────────────────────────
CREATE TABLE rooms (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  theme_id   TEXT NOT NULL DEFAULT 'modern',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ── Seeds ─────────────────────────────────────────────────────────────────────
CREATE TABLE seeds (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id          UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  emoji            TEXT NOT NULL DEFAULT '📝',
  memo             TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'idea',
  x_percent        DECIMAL(5,2) NOT NULL CHECK (x_percent BETWEEN 0 AND 100),
  y_percent        DECIMAL(5,2) NOT NULL CHECK (y_percent BETWEEN 0 AND 100),
  sr_interval      INT     NOT NULL DEFAULT 0,
  sr_repetitions   INT     NOT NULL DEFAULT 0,
  sr_ease_factor   DECIMAL(4,2) NOT NULL DEFAULT 2.5,
  next_review_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Feed Posts ────────────────────────────────────────────────────────────────
CREATE TABLE feed_posts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seed_id     UUID NOT NULL REFERENCES seeds(id)    ON DELETE CASCADE,
  diary_text  TEXT CHECK (char_length(diary_text) <= 280),
  views_count INT  NOT NULL DEFAULT 0,
  is_public   BOOL NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Views (内覧) ───────────────────────────────────────────────────────────────
CREATE TABLE seed_views (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, viewer_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_seeds_user          ON seeds(user_id);
CREATE INDEX idx_seeds_review_date   ON seeds(next_review_date);
CREATE INDEX idx_feed_posts_public   ON feed_posts(is_public, created_at DESC);
CREATE INDEX idx_seed_views_post     ON seed_views(post_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_rooms_updated  BEFORE UPDATE ON rooms  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
CREATE TRIGGER trg_seeds_updated  BEFORE UPDATE ON seeds  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ── views_count trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _inc_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN UPDATE feed_posts SET views_count = views_count + 1 WHERE id = NEW.post_id; RETURN NEW; END; $$;

CREATE TRIGGER trg_inc_views AFTER INSERT ON seed_views FOR EACH ROW EXECUTE FUNCTION _inc_views();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_views ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- rooms
CREATE POLICY "rooms_select_all" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_manage_own" ON rooms FOR ALL  USING (auth.uid() = user_id);

-- seeds: own full access; others can see seeds referenced by public feed posts
CREATE POLICY "seeds_manage_own"  ON seeds FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "seeds_select_feed" ON seeds FOR SELECT USING (
  EXISTS (SELECT 1 FROM feed_posts WHERE seed_id = seeds.id AND is_public)
);

-- feed_posts
CREATE POLICY "posts_select_public" ON feed_posts FOR SELECT USING (is_public);
CREATE POLICY "posts_manage_own"    ON feed_posts FOR ALL    USING (auth.uid() = user_id);

-- seed_views
CREATE POLICY "views_select_all"  ON seed_views FOR SELECT USING (true);
CREATE POLICY "views_insert_auth" ON seed_views FOR INSERT  WITH CHECK (auth.uid() = viewer_id);
