import express from 'express';
import { supabase } from '../supabaseClient.js';
import * as turf from '@turf/turf';
import { checkAndNotify } from '../lib/notificationService.js';

const router = express.Router();

// Memory Caches
const LAST_DB_UPDATE = {};
const ROUTE_CACHE = {}; // { bus_id: { polyline: MultiLineString, stops: [], lengthKm: number } }
const ACTIVE_TRIPS = {}; // { bus_id: { trip_id, tenant_id } }
const STATE_CACHE = {}; // { bus_id: { emaSpeed, lastProgressionIndex, lastLat, lastLng, lastTime, lifecycle, delayStreak, lastVariance } }
const SEGMENT_MEMORY = {}; // { "routeId_stop1_stop2": { emaTravelTimeMins, samples } }
const LAST_TRIP_CHECK = {}; // TTL Cache tracker

// Constants
const TELEPORT_THRESHOLD_METERS = 300;
const SPEED_SPIKE_MAX_KMH = 120;
const OFF_ROUTE_THRESHOLD_METERS = 100;
const MONOTONIC_BACKTRACK_LIMIT_KM = 0.4;
const DELAY_STREAK_THRESHOLD = 3;

/**
 * Lifecycle State Machine
 */
const Lifecycle = {
    NOT_STARTED: 'NOT_STARTED',
    BOARDING: 'BOARDING',
    ENROUTE: 'ENROUTE',
    AT_STOP: 'AT_STOP',
    DELAYED: 'DELAYED',
    OFF_ROUTE: 'OFF_ROUTE',
    COMPLETED: 'COMPLETED'
};

function getAdaptiveEMASmoothing(currentSpeed, lastSpeed, dtSecs) {
    if (dtSecs <= 0) return 1.0;
    const variance = Math.abs(currentSpeed - lastSpeed);
    let alpha = 0.3 * (dtSecs / 3.0); 
    if (variance > 15) alpha *= 0.4; 
    return Math.max(0.05, Math.min(1.0, alpha));
}

function calculateConfidence(emaSpeed, variance, dtSecs, gpsAccuracy = 10, distToRouteMeters = 0) {
    let conf = 100;
    if (dtSecs > 15) conf -= Math.min(50, (dtSecs - 15) * 3);
    if (variance > 20) conf -= 15;
    if (gpsAccuracy > 40) conf -= 30;
    if (distToRouteMeters > OFF_ROUTE_THRESHOLD_METERS) conf -= 40;
    return Math.max(5, conf) / 100.0;
}

export async function initializeBusState(busState) {
    console.log('[Init] Loading lifecycle state from DB...');
    const { data: states } = await supabase.from('bus_state').select('*');
    if (states) {
        states.forEach(s => {
            busState[s.bus_id] = { ...s, confidence_score: 1.0, lifecycle_state: s.lifecycle_state || Lifecycle.NOT_STARTED };
            STATE_CACHE[s.bus_id] = {
                emaSpeed: s.speed || 0,
                lastProgressionIndex: s.progression_index || 0,
                lastLat: s.latitude,
                lastLng: s.longitude,
                lastTime: Date.now(),
                lifecycle: s.lifecycle_state || Lifecycle.NOT_STARTED,
                delayStreak: 0
            };
        });
    }
}

async function ensureRouteCached(bus_id) {
    const now = Date.now();
    // Cache TTL of 60 seconds (60000ms) minimizes DB latency on Vercel while staying relatively fresh
    if (ROUTE_CACHE[bus_id] && LAST_TRIP_CHECK[bus_id] && (now - LAST_TRIP_CHECK[bus_id] < 60000)) {
        return ROUTE_CACHE[bus_id];
    }
    
    LAST_TRIP_CHECK[bus_id] = now;

    const { data: trip } = await supabase.from('trips').select('trip_id, tenant_id').eq('bus_id', bus_id).eq('status', 'active').maybeSingle();
    if (trip) ACTIVE_TRIPS[bus_id] = trip;
    else delete ACTIVE_TRIPS[bus_id];

    if (ROUTE_CACHE[bus_id]) return ROUTE_CACHE[bus_id];

    const { data: assign } = await supabase.from('assignments').select(`route_id, tenant_id, routes(*)`).eq('bus_id', bus_id).maybeSingle();
    if (!assign) return null;

    const { data: stops } = await supabase.from('route_stops').select(`stop_id, stop_order, scheduled_arrival_time, stops(*)`).eq('route_id', assign.route_id).order('stop_order');

    const line = assign.routes.route_polyline ? turf.lineString(assign.routes.route_polyline.coordinates) : null;
    ROUTE_CACHE[bus_id] = {
        route_id: assign.route_id,
        tenant_id: assign.tenant_id,
        lineString: line,
        lengthKm: line ? turf.length(line, { units: 'kilometers' }) : 0,
        stops: stops?.map(s => ({ ...s.stops, order: s.stop_order, scheduled_time: s.scheduled_arrival_time })) || []
    };
    return ROUTE_CACHE[bus_id];
}

export const processLocationUpdate = async (payload, io, busState, skipBroadcast = false) => {
    const { bus_id, latitude: lat, longitude: lng, speed: rawSpeed, heading, timestamp, accuracy } = payload;
    const now = Date.now();
    const packetTime = timestamp ? new Date(timestamp).getTime() : now;

    // --- 1. Telemetry Anomaly Firewall ---
    if (!STATE_CACHE[bus_id]) {
        STATE_CACHE[bus_id] = { emaSpeed: rawSpeed || 0, lastProgressionIndex: 0, lastLat: lat, lastLng: lng, lastTime: now, lifecycle: Lifecycle.NOT_STARTED, delayStreak: 0 };
    }
    const state = STATE_CACHE[bus_id];

    // Reject stale or future packets
    if (now - packetTime > 60000 || packetTime > now + 5000) return;

    // Reject teleport jumps
    const jumpMeters = turf.distance(turf.point([state.lastLng, state.lastLat]), turf.point([lng, lat]), { units: 'meters' });
    if (jumpMeters > TELEPORT_THRESHOLD_METERS && (now - state.lastTime < 5000)) return;

    // Reject unrealistic speed spikes
    if (rawSpeed > SPEED_SPIKE_MAX_KMH) return;

    // --- 2. Adaptive Velocity & Confidence ---
    const dt = Math.max(0.1, (now - state.lastTime) / 1000);
    const alpha = getAdaptiveEMASmoothing(rawSpeed, state.emaSpeed, dt);
    state.emaSpeed = (alpha * rawSpeed) + (1 - alpha) * state.emaSpeed;
    state.lastLat = lat; state.lastLng = lng; state.lastTime = now;

    const routeData = await ensureRouteCached(bus_id);
    let snappedLat = lat, snappedLng = lng, distToRouteMeters = 0;
    let progressionIndex = state.lastProgressionIndex;

    // --- 3. Route Progression & Off-Route Detection ---
    if (routeData?.lineString) {
        const snapped = turf.nearestPointOnLine(routeData.lineString, turf.point([lng, lat]));
        distToRouteMeters = snapped.properties.dist * 1000;
        
        if (distToRouteMeters < OFF_ROUTE_THRESHOLD_METERS) {
            snappedLat = snapped.geometry.coordinates[1];
            snappedLng = snapped.geometry.coordinates[0];
            const newIndex = snapped.properties.location / routeData.lengthKm;
            
            // Monotonic Progression with Tolerance
            if (newIndex >= state.lastProgressionIndex - (MONOTONIC_BACKTRACK_LIMIT_KM / routeData.lengthKm)) {
                progressionIndex = Math.max(state.lastProgressionIndex, newIndex); // Clamp to max seen
            }
            state.lastProgressionIndex = progressionIndex;
            if (state.lifecycle === Lifecycle.OFF_ROUTE) state.lifecycle = Lifecycle.ENROUTE;
        } else {
            state.lifecycle = Lifecycle.OFF_ROUTE;
        }
    }

    const confidence = calculateConfidence(state.emaSpeed, Math.abs(rawSpeed - state.emaSpeed), dt, accuracy, distToRouteMeters);

    // --- 4. Predictive ETA & Delay Propagation ---
    let nextStop = 'Locating...', etaMins = null, delayMins = 0;
    if (routeData?.stops.length > 0 && state.lifecycle !== Lifecycle.OFF_ROUTE) {
        const busPoint = turf.point([snappedLng, snappedLat]);
        for (const stop of routeData.stops) {
            const stopPoint = turf.point([stop.longitude, stop.latitude]);
            const distToStop = turf.distance(busPoint, stopPoint, { units: 'kilometers' });

            // Using Progression Index to find next stop
            const stopProgress = (routeData.stops.indexOf(stop) / (routeData.stops.length - 1));
            if (stopProgress > progressionIndex || distToStop > 0.15) {
                nextStop = stop.stop_name;
                const baselineSpeed = 25; // Default urban speed
                const effectiveSpeed = Math.max(10, (state.emaSpeed * 0.7) + (baselineSpeed * 0.3));
                
                let travelMins = (distToStop / effectiveSpeed) * 60;
                etaMins = Math.round(travelMins);

                if (stop.scheduled_time) {
                    const [h, m, s] = stop.scheduled_time.split(':').map(Number);
                    const sched = new Date(); sched.setHours(h, m, s || 0, 0);
                    const arrival = new Date(now + etaMins * 60000);
                    delayMins = Math.round((arrival.getTime() - sched.getTime()) / 60000);
                    
                    // Delay Decay: Recover exponentially if overspeeding
                    if (state.emaSpeed > baselineSpeed + 10 && delayMins > 0) {
                        delayMins = Math.max(0, Math.round(delayMins * 0.95));
                    }
                }
                break;
            }
        }
    }

    // --- 5. Trip Lifecycle State Machine ---
    if (state.lifecycle !== Lifecycle.OFF_ROUTE) {
        if (progressionIndex > 0.98) state.lifecycle = Lifecycle.COMPLETED;
        else if (progressionIndex < 0.02 && state.emaSpeed < 2) state.lifecycle = Lifecycle.BOARDING;
        else if (state.emaSpeed > 5) state.lifecycle = Lifecycle.ENROUTE;
        else if (state.emaSpeed < 2) state.lifecycle = Lifecycle.AT_STOP;
        
        if (delayMins > 10) state.lifecycle = Lifecycle.DELAYED;
    }

    // Delay Alert Logic
    if (delayMins >= 10) {
        state.delayStreak++;
        if (state.delayStreak === DELAY_STREAK_THRESHOLD) checkAndNotify(bus_id, nextStop, delayMins);
    } else { state.delayStreak = 0; }

    // --- 6. Commit to Live State ---
    busState[bus_id] = {
        bus_id, tenant_id: routeData?.tenant_id,
        lat: snappedLat, lng: snappedLng,
        raw_lat: lat, raw_lng: lng,
        speed: state.emaSpeed, heading: heading || 0,
        next_stop: nextStop, eta: etaMins, delay_mins: delayMins,
        confidence_score: confidence,
        lifecycle_state: state.lifecycle,
        progression_index: progressionIndex,
        updated_at: new Date().toISOString()
    };

    // Persistence (Throttled 30s)
    if (now - (LAST_DB_UPDATE[bus_id] || 0) > 30000) {
        LAST_DB_UPDATE[bus_id] = now;
        const trip = ACTIVE_TRIPS[bus_id];
        supabase.from('bus_state').upsert({
            bus_id, tenant_id: routeData?.tenant_id, trip_id: trip?.trip_id,
            latitude: snappedLat, longitude: snappedLng,
            speed: state.emaSpeed, heading: heading || 0,
            next_stop: nextStop, eta_mins: etaMins, delay_mins: delayMins,
            lifecycle_state: state.lifecycle, progression_index: progressionIndex,
            confidence_score: confidence,
            updated_at: new Date().toISOString()
        }).catch(e => console.error('[DB] Persistence error:', e));

        if (trip) {
            supabase.from('trip_snapshots').insert([{
                trip_id: trip.trip_id, bus_id, tenant_id: trip.tenant_id,
                latitude: snappedLat, longitude: snappedLng, speed: state.emaSpeed, heading: heading || 0
            }]).catch(e => console.error('[DB] Snapshot error:', e));
        }
    }

    // --- 7. Serverless Realtime Broadcast Proxy ---
    // Moved out of setInterval to ensure it executes before Vercel freezes the instance
    if (!skipBroadcast) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
            fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { topic: 'realtime:public:tracking', event: 'bus_update', payload: busState[bus_id] },
                        { topic: `realtime:tracking_bus_${bus_id}`, event: 'bus_update', payload: busState[bus_id] }
                    ]
                })
            }).catch(err => console.error('Serverless broadcast error:', err));
        }
    }
};

router.post('/update-location-batch', async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates must be an array' });

        // Process sequentially to maintain progression order
        const affectedBuses = new Set();
        for (const update of updates) {
            await processLocationUpdate(update, req.io, req.busState, true);
            affectedBuses.add(update.bus_id);
        }

        // Broadcast the final unified state for all affected buses just once
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey && affectedBuses.size > 0) {
            const messages = [];
            for (const bus_id of affectedBuses) {
                messages.push({ topic: 'realtime:public:tracking', event: 'bus_update', payload: req.busState[bus_id] });
                messages.push({ topic: `realtime:tracking_bus_${bus_id}`, event: 'bus_update', payload: req.busState[bus_id] });
            }
            fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                method: 'POST',
                headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            }).catch(err => console.error('Batch Serverless broadcast error:', err));
        }

        res.json({ success: true, processed: updates.length });
    } catch (e) {
        console.error('Batch Update Location error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/update-location', async (req, res) => {
    try {
        await processLocationUpdate(req.body, req.io, req.busState);
        res.json({ success: true, status: 'processed' });
    } catch (e) {
        console.error('Update Location error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/driver/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    try {
        const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('*')
            .eq('phone', phone)
            .eq('password', password)
            .single();

        if (driverError || !driver) {
            return res.status(401).json({ error: 'Invalid phone or password' });
        }

        const { data: assignment } = await supabase
            .from('assignments')
            .select(`
                bus_id,
                tenant_id,
                routes (route_id, route_name),
                buses (bus_number, bus_name, status)
            `)
            .eq('driver_id', driver.driver_id)
            .single();

        let busData = null;
        if (assignment && assignment.buses) {
            let routesObj = assignment.routes;
            if (Array.isArray(routesObj)) routesObj = routesObj[0];
            let busesObj = assignment.buses;
            if (Array.isArray(busesObj)) busesObj = busesObj[0];

            busData = {
                bus_id: assignment.bus_id,
                tenant_id: assignment.tenant_id,
                bus_number: busesObj.bus_number,
                bus_name: busesObj.bus_name,
                status: busesObj.status,
                routes: routesObj
            };
        }

        res.json({ success: true, driver, bus: busData });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/live-states', async (req, res) => {
    const { tenant_id } = req.query;
    let states = Object.values(req.busState);
    if (states.length === 0) {
        const { data } = await supabase.from('bus_state').select('*');
        if (data) {
            states = data.map(s => ({
                ...s,
                lat: s.latitude,
                lng: s.longitude,
                confidence_score: 1.0
            }));
            states.forEach(s => { req.busState[s.bus_id] = s; });
        }
    }
    if (tenant_id) states = states.filter(s => s.tenant_id === tenant_id);
    const result = {}; states.forEach(s => result[s.bus_id] = s);
    res.json(result);
});

export default router;

