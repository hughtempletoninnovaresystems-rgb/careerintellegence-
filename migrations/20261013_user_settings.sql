-- ProjectGreat Settings. Run once against the same Neon database as the application.
-- Additive only: does not alter Career Intelligence assessment data.
BEGIN;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_role_title TEXT NOT NULL DEFAULT '',
  reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_preferred_role_length CHECK (char_length(preferred_role_title) <= 160)
);

COMMIT;
