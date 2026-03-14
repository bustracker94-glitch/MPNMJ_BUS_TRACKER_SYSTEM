-- ============================================================
-- MIGRATION: Add scheduled_arrival_time to route_stops
-- Run this in the Supabase SQL Editor (safe to run on existing data)
-- ============================================================

ALTER TABLE public.route_stops
    ADD COLUMN IF NOT EXISTS scheduled_arrival_time TIME;

ALTER TABLE public.bus_state
    ADD COLUMN IF NOT EXISTS delay_mins INTEGER DEFAULT 0;

-- ============================================================
-- STEP 18: SUBSCRIPTIONS (For Smart Notifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     TEXT NOT NULL,
    bus_id      UUID REFERENCES public.buses(bus_id) ON DELETE CASCADE,
    stop_id     UUID REFERENCES public.stops(stop_id) ON DELETE CASCADE,
    expo_token  TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bus_id, stop_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on subscriptions" ON public.subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DONE ✅ — Column is nullable so existing rows are unaffected
-- ============================================================
