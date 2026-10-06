CREATE TABLE auth_sessions (
  session_hash text PRIMARY KEY,
  user_id text NOT NULL,
  credentials text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
