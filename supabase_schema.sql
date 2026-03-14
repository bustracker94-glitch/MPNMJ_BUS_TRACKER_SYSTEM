-- ============================================================
-- TRANSPORT OS — COMPLETE SUPABASE SCHEMA
-- Multi-Tenant SaaS | Fleet Telemetry | Analytics
-- Run this entire file in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================================
DROP TABLE IF EXISTS public.trip_history    CASCADE;
DROP TABLE IF EXISTS public.trip_snapshots  CASCADE;
DROP TABLE IF EXISTS public.bus_state       CASCADE;
DROP TABLE IF EXISTS public.trips           CASCADE;
DROP TABLE IF EXISTS public.assignments     CASCADE;
DROP TABLE IF EXISTS public.route_stops     CASCADE;
DROP TABLE IF EXISTS public.stops           CASCADE;
DROP TABLE IF EXISTS public.drivers         CASCADE;
DROP TABLE IF EXISTS public.buses           CASCADE;
DROP TABLE IF EXISTS public.routes          CASCADE;
DROP TABLE IF EXISTS public.admins          CASCADE;
DROP TABLE IF EXISTS public.organizations   CASCADE;

-- ============================================================
-- STEP 2: ORGANIZATIONS (SaaS Tenant Root)
-- ============================================================
CREATE TABLE public.organizations (
    tenant_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    email       TEXT,
    phone       TEXT,
    logo_url    TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 3: ADMINS
-- ============================================================
CREATE TABLE public.admins (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT DEFAULT 'admin',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 4: ROUTES
-- ============================================================
CREATE TABLE public.routes (
    route_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    route_name          TEXT NOT NULL,
    route_polyline      JSONB,
    total_distance_km   DOUBLE PRECISION DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 5: BUSES
-- ============================================================
CREATE TABLE public.buses (
    bus_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    bus_number  TEXT NOT NULL,
    bus_name    TEXT NOT NULL,
    capacity    INTEGER DEFAULT 50,
    status      TEXT DEFAULT 'inactive',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, bus_number)
);

-- ============================================================
-- STEP 6: DRIVERS
-- ============================================================
CREATE TABLE public.drivers (
    driver_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    driver_name     TEXT NOT NULL,
    phone           TEXT NOT NULL,
    password        TEXT NOT NULL,
    license_number  TEXT,
    assigned_bus    UUID REFERENCES public.buses(bus_id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- ============================================================
-- STEP 7: STOPS
-- ============================================================
CREATE TABLE public.stops (
    stop_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    stop_name   TEXT NOT NULL,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 8: ROUTE STOPS
-- ============================================================
CREATE TABLE public.route_stops (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id                    UUID NOT NULL REFERENCES public.routes(route_id) ON DELETE CASCADE,
    stop_id                     UUID NOT NULL REFERENCES public.stops(stop_id) ON DELETE CASCADE,
    stop_order                  INTEGER NOT NULL,
    distance_from_start_km      DOUBLE PRECISION DEFAULT 0,
    estimated_arrival_time_mins INTEGER DEFAULT 0,
    scheduled_arrival_time      TIME,
    created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(route_id, stop_id),
    UNIQUE(route_id, stop_order)
);

-- ============================================================
-- STEP 9: ASSIGNMENTS (Bus ↔ Driver ↔ Route)
-- ============================================================
CREATE TABLE public.assignments (
    assignment_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    bus_id          UUID NOT NULL REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    driver_id       UUID NOT NULL REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
    route_id        UUID NOT NULL REFERENCES public.routes(route_id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bus_id),
    UNIQUE(driver_id)
);

-- ============================================================
-- STEP 10: TRIPS
-- ============================================================
CREATE TABLE public.trips (
    trip_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    bus_id      UUID NOT NULL REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    driver_id   UUID NOT NULL REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
    route_id    UUID NOT NULL REFERENCES public.routes(route_id) ON DELETE CASCADE,
    status      TEXT DEFAULT 'active',
    started_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at    TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- STEP 11: BUS STATE (Live GPS — 1 row per bus, UPSERT)
-- ============================================================
CREATE TABLE public.bus_state (
    bus_id      UUID PRIMARY KEY REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    trip_id     UUID REFERENCES public.trips(trip_id) ON DELETE SET NULL,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    speed       DOUBLE PRECISION DEFAULT 0,
    heading     DOUBLE PRECISION DEFAULT 0,
    next_stop   TEXT,
    eta_mins    INTEGER,
    status      TEXT DEFAULT 'online',
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 12: TRIP SNAPSHOTS (GPS breadcrumbs every 30s)
-- ============================================================
CREATE TABLE public.trip_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    trip_id     UUID NOT NULL REFERENCES public.trips(trip_id) ON DELETE CASCADE,
    bus_id      UUID NOT NULL REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    speed       DOUBLE PRECISION DEFAULT 0,
    heading     DOUBLE PRECISION DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 13: TRIP HISTORY (Daily analytics summary)
-- ============================================================
CREATE TABLE public.trip_history (
    history_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.organizations(tenant_id) ON DELETE CASCADE,
    trip_id             UUID REFERENCES public.trips(trip_id) ON DELETE SET NULL,
    bus_id              UUID NOT NULL REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    driver_id           UUID REFERENCES public.drivers(driver_id) ON DELETE SET NULL,
    date                DATE NOT NULL DEFAULT CURRENT_DATE,
    max_speed_kmh       DOUBLE PRECISION DEFAULT 0,
    avg_speed_kmh       DOUBLE PRECISION DEFAULT 0,
    total_distance_km   DOUBLE PRECISION DEFAULT 0,
    delay_minutes       INTEGER DEFAULT 0,
    route_deviations    INTEGER DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- STEP 14: INDEXES
-- ============================================================
CREATE INDEX idx_buses_tenant        ON public.buses(tenant_id);
CREATE INDEX idx_drivers_tenant      ON public.drivers(tenant_id);
CREATE INDEX idx_routes_tenant       ON public.routes(tenant_id);
CREATE INDEX idx_stops_tenant        ON public.stops(tenant_id);
CREATE INDEX idx_assignments_tenant  ON public.assignments(tenant_id);
CREATE INDEX idx_assignments_bus     ON public.assignments(bus_id);
CREATE INDEX idx_assignments_driver  ON public.assignments(driver_id);
CREATE INDEX idx_trips_tenant        ON public.trips(tenant_id);
CREATE INDEX idx_trips_status        ON public.trips(status);
CREATE INDEX idx_trips_bus           ON public.trips(bus_id);
CREATE INDEX idx_snapshots_trip      ON public.trip_snapshots(trip_id);
CREATE INDEX idx_snapshots_bus       ON public.trip_snapshots(bus_id);
CREATE INDEX idx_snapshots_recorded  ON public.trip_snapshots(recorded_at);
CREATE INDEX idx_history_tenant      ON public.trip_history(tenant_id);
CREATE INDEX idx_history_date        ON public.trip_history(date);
CREATE INDEX idx_bus_state_tenant    ON public.bus_state(tenant_id);

-- ============================================================
-- STEP 15: ROW LEVEL SECURITY — Enable
-- ============================================================
ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_state      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_history   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 16: RLS POLICIES — Full CRUD access (MVP)
-- Allows admin panel, tracker, and driver app to read/write
-- freely using the anon key. Tighten per-tenant in production.
-- ============================================================
CREATE POLICY "Allow all on organizations"  ON public.organizations  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on admins"         ON public.admins         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on routes"         ON public.routes         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on buses"          ON public.buses          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on drivers"        ON public.drivers        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on stops"          ON public.stops          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on route_stops"    ON public.route_stops    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on assignments"    ON public.assignments    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on trips"          ON public.trips          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bus_state"      ON public.bus_state      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on trip_snapshots" ON public.trip_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on trip_history"   ON public.trip_history   FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- STEP 17: SEED — Default Organization
-- ============================================================
INSERT INTO public.organizations (name, slug, email)
VALUES ('MPNMJ Engineering College', 'mpnmj-college', 'admin@mpnmj.edu.in');

-- ============================================================
-- DONE ✅
-- ============================================================
