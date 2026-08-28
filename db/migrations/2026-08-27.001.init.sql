-- BroilerLab next-gen — initial schema
-- PostgreSQL 16 + TimescaleDB
-- UUIDv7 primary keys, RBAC (owner_id), Anti-IDOR, telemetry hypertable + CAGGs

-- migrate:up

-- ===================== EXTENSIONS =====================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TimescaleDB is required in production (docker stack). For local/dev on plain
-- PostgreSQL we tolerate its absence: hypertable + CAGG calls are guarded below
-- so the core schema still validates and the app remains functional (just without
-- time-series optimizations). In prod the extension IS present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    RAISE NOTICE 'timescaledb extension not installed — running in plain-PG dev mode (hypertable/CAGG skipped).';
  ELSE
    CREATE EXTENSION IF NOT EXISTS "timescaledb";
  END IF;
END $$;

-- ===================== UUID v7 helper =====================
-- UUIDv7 = unix_ms(48 bits) + rand(74 bits). Implemented as a function so
-- app code can call uuid_generate_v7() without client-side libs.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  ts_ms BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  r bytea := gen_random_bytes(16);
  out bytea;
BEGIN
  out := r;
  -- bytes 0..5 : 48-bit big-endian timestamp
  out := set_byte(out, 0, (ts_ms >> 40) & 255);
  out := set_byte(out, 1, (ts_ms >> 32) & 255);
  out := set_byte(out, 2, (ts_ms >> 24) & 255);
  out := set_byte(out, 3, (ts_ms >> 16) & 255);
  out := set_byte(out, 4, (ts_ms >> 8) & 255);
  out := set_byte(out, 5, ts_ms & 255);
  -- byte 6 : version 7 (0111) in top nibble
  out := set_byte(out, 6, (get_byte(r,6) & 15) | 112);
  -- byte 8 : variant 10xx in top 2 bits
  out := set_byte(out, 8, (get_byte(r,8) & 63) | 128);
  RETURN out::uuid;
END;
$$;

-- ===================== USERS (RBAC) =====================
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  email       text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'researcher'
                CHECK (role IN ('admin','researcher','viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ===================== DEVICES =====================
CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_uid    text NOT NULL UNIQUE,           -- hardware serial / MQTT client id
  label         text NOT NULL,
  firmware_rev  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz
);

-- ===================== CYCLES =====================
CREATE TABLE cycles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Anti-IDOR
  cycle_code  text NOT NULL,
  label       text NOT NULL,
  strain      text NOT NULL DEFAULT 'ross308',
  start_date  timestamptz NOT NULL DEFAULT now(),
  end_date    timestamptz,
  bird_count  integer NOT NULL DEFAULT 0,
  pen_id      text,
  notes       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, cycle_code)              -- same owner can't reuse code
);
CREATE INDEX ix_cycles_owner ON cycles(owner_id);

-- ===================== TELEMETRY_RAW =====================
CREATE TABLE telemetry_raw (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Anti-IDOR
  device_id     uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cycle_id      uuid NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  uid           text NOT NULL,                  -- idempotency key from device
  ts            timestamptz NOT NULL,            -- event time
  flock_id      text,
  bird_id       text,
  sensor_id     text,
  age_day       integer,
  raw_weight_g  double precision,
  weight_g      double precision,
  feed_bin_kg   double precision,
  feed_delta_g  double precision,
  temp_c        double precision,
  humidity      double precision,
  rssi          double precision,
  is_visit_start boolean NOT NULL DEFAULT false,
  is_visit_end   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (uid)                              -- idempotent ingest
);
CREATE INDEX ix_telemetry_cycle ON telemetry_raw(cycle_id, ts DESC);
CREATE INDEX ix_telemetry_bird ON telemetry_raw(cycle_id, bird_id, ts DESC);

-- Convert to hypertable (partition by event time, 7-day chunks)
-- Guarded: only runs where TimescaleDB is present (prod). On plain PG the table
-- stays a normal partitioned-by-nothing table and the app still works.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    PERFORM create_hypertable('telemetry_raw', 'ts', chunk_time_interval => interval '7 days');
  ELSE
    RAISE NOTICE 'timescaledb absent: telemetry_raw kept as plain table.';
  END IF;
END $$;

-- ===================== VISITS (derived) =====================
CREATE TABLE visits (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id          uuid NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  bird_id           text NOT NULL,
  visit_start       timestamptz NOT NULL,
  visit_end         timestamptz,
  age_day           integer,
  initial_weight_g  double precision,
  final_weight_g    double precision,
  feed_intake_g     double precision,
  sensor_id         text,
  rssi              double precision,
  read_ok           boolean NOT NULL DEFAULT true,
  co_feed           boolean NOT NULL DEFAULT false,
  temp_c            double precision,
  humidity          double precision,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_visits_cycle ON visits(cycle_id, visit_start DESC);
CREATE INDEX ix_visits_bird  ON visits(cycle_id, bird_id);

-- ===================== REGISTRATIONS (live bird entries) =====================
-- A manual registration = an operator logging a bird arrival at the farm
-- (tag + initial weight + exact Shamsi datetime). Distinct from auto-derived
-- visits; used by the v-dev live panel.
CREATE TABLE registrations (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id          uuid NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  bird_id           text NOT NULL,
  initial_weight_g double precision NOT NULL,
  shamsi_date       text,
  sensor_id         text,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_reg_cycle ON registrations(cycle_id, registered_at DESC);

-- ===================== CONTINUOUS AGGREGATES =====================
-- bird_daily: per-bird-per-day summary (TimescaleDB continuous aggregate)
-- On plain PG (dev) we create a regular VIEW with the same shape so the app
-- can query bird_daily / flock_daily transparently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    EXECUTE $ts$
      CREATE MATERIALIZED VIEW bird_daily
      WITH (timescaledb.continuous) AS
      SELECT
        cycle_id,
        time_bucket('1 day', ts) AS day,
        bird_id,
        count(*) FILTER (WHERE is_visit_start) AS visits,
        avg(weight_g) FILTER (WHERE is_visit_start) AS avg_entry_w,
        avg(feed_delta_g) AS avg_feed_delta,
        max(age_day) AS age_day,
        avg(temp_c) AS avg_temp,
        avg(humidity) AS avg_hum
      FROM telemetry_raw
      GROUP BY cycle_id, time_bucket('1 day', ts), bird_id
      WITH NO DATA;
    $ts$;
    EXECUTE $ts$
      CREATE MATERIALIZED VIEW flock_daily
      WITH (timescaledb.continuous) AS
      SELECT
        cycle_id,
        time_bucket('1 day', ts) AS day,
        count(DISTINCT bird_id) AS unique_birds,
        count(*) FILTER (WHERE is_visit_start) AS total_visits,
        sum(feed_delta_g) AS total_feed_g,
        avg(temp_c) AS avg_temp,
        avg(humidity) AS avg_hum
      FROM telemetry_raw
      GROUP BY cycle_id, time_bucket('1 day', ts)
      WITH NO DATA;
    $ts$;
    PERFORM add_continuous_aggregate_policy('bird_daily',
      start_offset => interval '3 days', end_offset => interval '1 hour',
      schedule_interval => interval '1 hour');
    PERFORM add_continuous_aggregate_policy('flock_daily',
      start_offset => interval '3 days', end_offset => interval '1 hour',
      schedule_interval => interval '1 hour');
  ELSE
    EXECUTE $v$
      CREATE VIEW bird_daily AS
      SELECT
        cycle_id,
        date_trunc('day', ts) AS day,
        bird_id,
        count(*) FILTER (WHERE is_visit_start) AS visits,
        avg(weight_g) FILTER (WHERE is_visit_start) AS avg_entry_w,
        avg(feed_delta_g) AS avg_feed_delta,
        max(age_day) AS age_day,
        avg(temp_c) AS avg_temp,
        avg(humidity) AS avg_hum
      FROM telemetry_raw
      GROUP BY cycle_id, date_trunc('day', ts), bird_id;
    $v$;
    EXECUTE $v$
      CREATE VIEW flock_daily AS
      SELECT
        cycle_id,
        date_trunc('1 day', ts) AS day,
        count(DISTINCT bird_id) AS unique_birds,
        count(*) FILTER (WHERE is_visit_start) AS total_visits,
        sum(feed_delta_g) AS total_feed_g,
        avg(temp_c) AS avg_temp,
        avg(humidity) AS avg_hum
      FROM telemetry_raw
      GROUP BY cycle_id, date_trunc('1 day', ts);
    $v$;
    RAISE NOTICE 'timescaledb absent: bird_daily/flock_daily created as regular views.';
  END IF;
END $$;

-- ===================== PARTIAL INDEX (Anti-IDOR hot path) =====================
-- Speed up "my open visits" queries
CREATE INDEX ix_visits_open ON visits(cycle_id, bird_id)
  WHERE visit_end IS NULL;

-- ===================== seed owner =====================
-- A default researcher account is created by the backend seeder, not here,
-- to keep migrations free of credentials.

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS flock_daily;
DROP MATERIALIZED VIEW IF EXISTS bird_daily;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS telemetry_raw;
DROP TABLE IF EXISTS cycles;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS uuid_generate_v7();
