-- ============================================================
-- PitWall Schema — Issue #1
-- ============================================================

-- ---- Core F1 tables ----

CREATE TABLE circuits (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,           -- e.g. 'monza'
    name TEXT NOT NULL,
    location TEXT,
    country TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    altitude_m INTEGER,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,           -- e.g. 'verstappen'
    number INTEGER,
    code CHAR(3),                       -- e.g. 'VER'
    forename TEXT NOT NULL,
    surname TEXT NOT NULL,
    dob DATE,
    nationality TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE constructors (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,           -- e.g. 'red_bull'
    name TEXT NOT NULL,
    nationality TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE races (
    id SERIAL PRIMARY KEY,
    season INTEGER NOT NULL,
    round INTEGER NOT NULL,
    name TEXT NOT NULL,
    circuit_id INTEGER NOT NULL REFERENCES circuits(id),
    date DATE NOT NULL,
    time TIME,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (season, round)
);

CREATE TABLE race_results (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    constructor_id INTEGER NOT NULL REFERENCES constructors(id),
    grid INTEGER,
    position INTEGER,                   -- NULL = DNF/DSQ
    position_text TEXT,                 -- e.g. 'Ret', 'DSQ', '1'
    points DOUBLE PRECISION DEFAULT 0,
    laps INTEGER,
    status TEXT,                        -- e.g. 'Finished', '+1 Lap', 'Engine'
    time_millis BIGINT,
    fastest_lap_rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, driver_id)
);

CREATE TABLE qualifying_results (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    constructor_id INTEGER NOT NULL REFERENCES constructors(id),
    position INTEGER,
    q1 TEXT,                            -- lap time string e.g. '1:29.123'
    q2 TEXT,
    q3 TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, driver_id)
);

-- ---- Detail tables ----

CREATE TABLE lap_summaries (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    lap_number INTEGER NOT NULL,
    position INTEGER,
    time_millis BIGINT,
    sector1_ms BIGINT,
    sector2_ms BIGINT,
    sector3_ms BIGINT,
    compound TEXT,                      -- e.g. 'SOFT', 'MEDIUM', 'HARD'
    tyre_life INTEGER,
    is_pit_in BOOLEAN DEFAULT FALSE,
    is_pit_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, driver_id, lap_number)
);

CREATE TABLE pit_stops (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    stop_number INTEGER NOT NULL,
    lap INTEGER NOT NULL,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, driver_id, stop_number)
);

CREATE TABLE weather_readings (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    lap_number INTEGER,
    air_temp DOUBLE PRECISION,
    track_temp DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    wind_speed DOUBLE PRECISION,
    wind_direction INTEGER,
    rainfall BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE standings (
    id SERIAL PRIMARY KEY,
    season INTEGER NOT NULL,
    round INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('driver', 'constructor')),
    entity_id INTEGER NOT NULL,         -- driver_id or constructor_id
    position INTEGER NOT NULL,
    points DOUBLE PRECISION NOT NULL,
    wins INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (season, round, type, entity_id)
);

-- ---- ML table ----

CREATE TABLE ml_features (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    features JSONB NOT NULL,            -- pre-computed feature vector
    target_position INTEGER,            -- actual finish position (training label)
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, driver_id)
);

-- ---- RAG table ----

CREATE TABLE knowledge_chunks (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB, -- category, source, season, entities, etc.
    embedding extensions.vector(768),   -- BGE-base-en-v1.5
    token_count INTEGER,
    source TEXT,                         -- file path or URL
    created_at TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING hnsw (embedding extensions.vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN index on metadata for filtered vector search
CREATE INDEX idx_knowledge_chunks_metadata
    ON knowledge_chunks
    USING gin (metadata jsonb_path_ops);

-- ---- User / Gamification tables ----

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE,                -- links to Supabase Auth
    username TEXT UNIQUE,
    display_name TEXT,
    knowledge_level TEXT DEFAULT 'newcomer' CHECK (knowledge_level IN ('newcomer', 'intermediate', 'expert')),
    xp INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    module TEXT NOT NULL,               -- e.g. 'tyre-strategy', 'drs-rules'
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    xp_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_predictions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    race_id INTEGER NOT NULL REFERENCES races(id),
    prediction JSONB NOT NULL,          -- e.g. { "p1": "VER", "p2": "NOR", ... }
    score INTEGER,                      -- computed after race
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, race_id)
);

CREATE TABLE model_predictions (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    model_version TEXT NOT NULL,
    prediction JSONB NOT NULL,          -- ranked driver list with probabilities
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (race_id, model_version)
);

-- ---- Performance indexes ----

CREATE INDEX idx_race_results_race ON race_results(race_id);
CREATE INDEX idx_race_results_driver ON race_results(driver_id);
CREATE INDEX idx_qualifying_results_race ON qualifying_results(race_id);
CREATE INDEX idx_lap_summaries_race_driver ON lap_summaries(race_id, driver_id);
CREATE INDEX idx_pit_stops_race ON pit_stops(race_id);
CREATE INDEX idx_weather_race ON weather_readings(race_id);
CREATE INDEX idx_standings_season ON standings(season, round);
CREATE INDEX idx_ml_features_race ON ml_features(race_id);
CREATE INDEX idx_races_season ON races(season);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX idx_user_predictions_user ON user_predictions(user_id);

-- ---- Row Level Security ----

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

-- Public read for F1 data tables (no auth needed)
ALTER TABLE circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE constructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifying_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lap_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_predictions ENABLE ROW LEVEL SECURITY;

-- F1 data: anyone can read, only service role can write
CREATE POLICY "Public read access" ON circuits FOR SELECT USING (true);
CREATE POLICY "Public read access" ON drivers FOR SELECT USING (true);
CREATE POLICY "Public read access" ON constructors FOR SELECT USING (true);
CREATE POLICY "Public read access" ON races FOR SELECT USING (true);
CREATE POLICY "Public read access" ON race_results FOR SELECT USING (true);
CREATE POLICY "Public read access" ON qualifying_results FOR SELECT USING (true);
CREATE POLICY "Public read access" ON lap_summaries FOR SELECT USING (true);
CREATE POLICY "Public read access" ON pit_stops FOR SELECT USING (true);
CREATE POLICY "Public read access" ON weather_readings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON standings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON ml_features FOR SELECT USING (true);
CREATE POLICY "Public read access" ON knowledge_chunks FOR SELECT USING (true);
CREATE POLICY "Public read access" ON model_predictions FOR SELECT USING (true);

-- Users: can read/update own row
CREATE POLICY "Users read own" ON users FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "Users update own" ON users FOR UPDATE USING (auth.uid() = auth_id);

-- Quiz/predictions: users can insert and read own
CREATE POLICY "Users read own attempts" ON quiz_attempts FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Users insert own attempts" ON quiz_attempts FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Users read own predictions" ON user_predictions FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Users insert own predictions" ON user_predictions FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
