\restrict dbmate

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: uuid_generate_v7(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  ts_ms BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  rand_b BIGINT := floor(random() * 4503599627370496)::BIGINT; -- 52-bit safe
BEGIN
  -- 48 bits time | 4-bit ver(7) | 12-bit rand_a | 62-bit rand_b packed
  RETURN encode(
    set_byte(
      set_byte(
        set_byte(
          -- time (ms) big-endian 6 bytes
          substring(int8send(ts_ms) from 3),  -- keep last 6 bytes of 8
          6,                                                   -- ver byte index
          ( ( (ts_ms >> 8) & 0x0F)::int | 0x70 )::int          -- 0x7x
        ),
        7,
        (rand_b & 0xFF)::int
      ),
      8,
      ( (rand_b >> 8) & 0x3F | 0x80 )::int                     -- RFC4122 variant
    )::bytea,
    'hex'
  )::uuid;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: telemetry_raw; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetry_raw (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    owner_id uuid NOT NULL,
    device_id uuid NOT NULL,
    cycle_id uuid NOT NULL,
    uid text NOT NULL,
    ts timestamp with time zone NOT NULL,
    flock_id text,
    bird_id text,
    sensor_id text,
    age_day integer,
    raw_weight_g double precision,
    weight_g double precision,
    feed_bin_kg double precision,
    feed_delta_g double precision,
    temp_c double precision,
    humidity double precision,
    rssi double precision,
    is_visit_start boolean DEFAULT false NOT NULL,
    is_visit_end boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bird_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bird_daily AS
 SELECT cycle_id,
    date_trunc('day'::text, ts) AS day,
    bird_id,
    count(*) FILTER (WHERE is_visit_start) AS visits,
    avg(weight_g) FILTER (WHERE is_visit_start) AS avg_entry_w,
    avg(feed_delta_g) AS avg_feed_delta,
    max(age_day) AS age_day,
    avg(temp_c) AS avg_temp,
    avg(humidity) AS avg_hum
   FROM public.telemetry_raw
  GROUP BY cycle_id, (date_trunc('day'::text, ts)), bird_id;


--
-- Name: cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycles (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    owner_id uuid NOT NULL,
    cycle_code text NOT NULL,
    label text NOT NULL,
    strain text DEFAULT 'ross308'::text NOT NULL,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    bird_count integer DEFAULT 0 NOT NULL,
    pen_id text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    owner_id uuid NOT NULL,
    device_uid text NOT NULL,
    label text NOT NULL,
    firmware_rev text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone
);


--
-- Name: flock_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.flock_daily AS
 SELECT cycle_id,
    date_trunc('1 day'::text, ts) AS day,
    count(DISTINCT bird_id) AS unique_birds,
    count(*) FILTER (WHERE is_visit_start) AS total_visits,
    sum(feed_delta_g) AS total_feed_g,
    avg(temp_c) AS avg_temp,
    avg(humidity) AS avg_hum
   FROM public.telemetry_raw
  GROUP BY cycle_id, (date_trunc('1 day'::text, ts));


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text,
    role text DEFAULT 'researcher'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'researcher'::text, 'viewer'::text])))
);


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    owner_id uuid NOT NULL,
    cycle_id uuid NOT NULL,
    bird_id text NOT NULL,
    visit_start timestamp with time zone NOT NULL,
    visit_end timestamp with time zone,
    age_day integer,
    initial_weight_g double precision,
    final_weight_g double precision,
    feed_intake_g double precision,
    sensor_id text,
    rssi double precision,
    read_ok boolean DEFAULT true NOT NULL,
    co_feed boolean DEFAULT false NOT NULL,
    temp_c double precision,
    humidity double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cycles cycles_owner_id_cycle_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycles
    ADD CONSTRAINT cycles_owner_id_cycle_code_key UNIQUE (owner_id, cycle_code);


--
-- Name: cycles cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycles
    ADD CONSTRAINT cycles_pkey PRIMARY KEY (id);


--
-- Name: devices devices_device_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_device_uid_key UNIQUE (device_uid);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: telemetry_raw telemetry_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_raw
    ADD CONSTRAINT telemetry_raw_pkey PRIMARY KEY (id);


--
-- Name: telemetry_raw telemetry_raw_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_raw
    ADD CONSTRAINT telemetry_raw_uid_key UNIQUE (uid);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: ix_cycles_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cycles_owner ON public.cycles USING btree (owner_id);


--
-- Name: ix_telemetry_bird; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_telemetry_bird ON public.telemetry_raw USING btree (cycle_id, bird_id, ts DESC);


--
-- Name: ix_telemetry_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_telemetry_cycle ON public.telemetry_raw USING btree (cycle_id, ts DESC);


--
-- Name: ix_visits_bird; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_visits_bird ON public.visits USING btree (cycle_id, bird_id);


--
-- Name: ix_visits_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_visits_cycle ON public.visits USING btree (cycle_id, visit_start DESC);


--
-- Name: ix_visits_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_visits_open ON public.visits USING btree (cycle_id, bird_id) WHERE (visit_end IS NULL);


--
-- Name: cycles cycles_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycles
    ADD CONSTRAINT cycles_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: devices devices_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: telemetry_raw telemetry_raw_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_raw
    ADD CONSTRAINT telemetry_raw_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;


--
-- Name: telemetry_raw telemetry_raw_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_raw
    ADD CONSTRAINT telemetry_raw_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: telemetry_raw telemetry_raw_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_raw
    ADD CONSTRAINT telemetry_raw_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: visits visits_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;


--
-- Name: visits visits_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('2026');
