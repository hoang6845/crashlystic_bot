CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_day ON requests(day);
CREATE INDEX IF NOT EXISTS requests_created ON requests(created_at);
