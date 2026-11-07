CREATE TABLE IF NOT EXISTS rooms (
 code text PRIMARY KEY,
 state jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS player_sessions (
 token_hash text PRIMARY KEY,
 player_id uuid NOT NULL,
 room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_sessions_room ON player_sessions(room_code);
CREATE TABLE IF NOT EXISTS game_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
 version integer NOT NULL,
 player_id uuid NOT NULL,
 action jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(room_code, version)
);
