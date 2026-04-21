CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('ACCESS_OK', 'ACCESS_FAIL', 'LOGOUT')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(255),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (username, email, password, role)
VALUES ('admin', 'admin@system.com', '$2a$12$uhO3gZyPA8Brc2vH9vD5/eR6c5Wbg6ncD9.sV863gqWMziSdsN/.S', 'admin')
ON CONFLICT DO NOTHING;
