import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

/**
 * GET /api/heartbeat
 * Returns server health, active bus count, and stale detection results.
 * Used by admin dashboard to verify backend is alive.
 */
router.get('/heartbeat', (req, res) => {
    const { busState } = req;
    const now = Date.now();
    const STALE_MS = 30000;

    const buses = Object.values(busState);
    const activeBuses = buses.filter(b => now - new Date(b.updated_at).getTime() < STALE_MS);
    const staleBuses = buses.filter(b => now - new Date(b.updated_at).getTime() >= STALE_MS);

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        active_buses: activeBuses.length,
        stale_buses: staleBuses.length,
        stale_bus_ids: staleBuses.map(b => b.bus_id),
        total_tracked: buses.length,
    });
});

/**
 * POST /api/analytics/trip-summary
 * Writes a completed trip summary to trip_history.
 * Called by the backend internally after a trip ends.
 */
router.post('/trip-summary', async (req, res) => {
    const { trip_id, bus_id, tenant_id, date } = req.body;

    // Aggregate snapshot data for this trip
    const { data: snapshots } = await supabase
        .from('trip_snapshots')
        .select('speed, latitude, longitude, recorded_at')
        .eq('trip_id', trip_id)
        .order('recorded_at', { ascending: true });

    if (!snapshots || snapshots.length === 0) {
        return res.status(404).json({ error: 'No snapshots found for this trip' });
    }

    const speeds = snapshots.map(s => parseFloat(s.speed) || 0).filter(s => s >= 0);
    const maxSpeed = Math.max(...speeds);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

    // Estimate total distance (haversine between consecutive snapshots)
    let totalDistKm = 0;
    for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1];
        const curr = snapshots[i];
        const R = 6371;
        const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
        const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((prev.latitude * Math.PI) / 180) *
            Math.cos((curr.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        totalDistKm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const { error } = await supabase.from('trip_history').insert([{
        tenant_id,
        trip_id,
        bus_id,
        date: date || new Date().toISOString().split('T')[0],
        max_speed_kmh: maxSpeed,
        avg_speed_kmh: avgSpeed,
        total_distance_km: totalDistKm,
        delay_minutes: 0,
        route_deviations: 0,
    }]);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, max_speed_kmh: maxSpeed, avg_speed_kmh: avgSpeed, total_distance_km: totalDistKm });
});

export default router;
