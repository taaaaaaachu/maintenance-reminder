-- エージェント接続(CONTEXT.md / ADR 0001)。client_idがNULLなら手動発行。時刻はUNIXミリ秒。
CREATE TABLE agent_connections (
  id                     TEXT PRIMARY KEY,
  household_id           TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  issuer_email           TEXT NOT NULL,
  name                   TEXT NOT NULL,
  client_id              TEXT,
  access_hash            TEXT NOT NULL UNIQUE,
  access_expires_at      INTEGER,
  refresh_hash           TEXT UNIQUE,
  previous_refresh_hash  TEXT,
  created_at             INTEGER NOT NULL,
  last_used_at           INTEGER NOT NULL
);

CREATE INDEX idx_agent_connections_household_id ON agent_connections(household_id);

-- Dynamic Client Registration(RFC 7591)で登録されたクライアント。CIMDのクライアントは保存しない。
CREATE TABLE oauth_clients (
  id             TEXT PRIMARY KEY,
  client_name    TEXT,
  redirect_uris  TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

-- 認可コード(寿命1分・1回きり)。isolateをまたいで共有できるようD1に置く。
CREATE TABLE oauth_codes (
  code_hash       TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,
  household_id    TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  issuer_email    TEXT NOT NULL,
  name            TEXT NOT NULL,
  expires_at      INTEGER NOT NULL
);
