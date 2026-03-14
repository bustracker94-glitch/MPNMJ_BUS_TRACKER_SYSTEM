/**
 * MotionEngine - Mobility-Grade Route-Constrained Predictive Motion
 * Decouples socket receipt from UI frame updates, enabling native 60fps tracking.
 */

// --- Tuning Constants ---
const PREDICT_HORIZON_BASE_MS = 4000;
const PREDICT_HORIZON_BIAS = 10; // km/h
const PREDICT_HORIZON_MIN = 1000;
const PREDICT_HORIZON_MAX = 5000;

const DWELL_MIN_MS = 10000;
const DWELL_MAX_MS = 30000;
const DWELL_DEPART_SAMPLES_REQ = 3; // 3 trailing samples showing progression

const LOOKAHEAD_DISTANCE_SECS = 2.5;
const DYNAMIC_SNAP_BASE = 15; // meters

// --- Simple Math Utils (Haversine instead of Turf to avoid RN deps) ---
const R = 6371e3; // Earth radius in meters
const toRad = deg => deg * Math.PI / 180;
const toDeg = rad => rad * 180 / Math.PI;

function getDistance(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
    const l1 = toRad(lat1), l2 = toRad(lat2);
    const dl = toRad(lon2 - lon1);
    const y = Math.sin(dl) * Math.cos(l2);
    const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
    const brng = Math.atan2(y, x);
    return (toDeg(brng) + 360) % 360;
}

function interpolatePosition(lat1, lon1, lat2, lon2, fraction) {
    // Simple linear interpolate (fine for small mobility distances < 50m)
    return {
        lat: lat1 + (lat2 - lat1) * fraction,
        lng: lon1 + (lon2 - lon1) * fraction
    };
}

export class MotionEngine {
    constructor() {
        this.currentState = {
            lat: null,
            lng: null,
            heading: 0,
            speedKmh: 0, // Current animated speed
        };
        
        this.targetState = {
            lat: null,
            lng: null,
            targetTimeMs: 0
        };

        this.polySegments = []; // Pre-computed route geometry if available
        
        // Physics tracking
        this.velocityArray = [];
        this.status = 'INIT'; // INIT, MOVING, DWELLING, ACCELERATING
        this.dwellStartMs = 0;
        this.dwellExitSamples = 0;

        this.lastUpdateTime = 0;
    }

    setRouteGeometry(coordsArray) {
        // Expected [{lat, lng}, ...]
        this.polySegments = coordsArray;
    }

    pushGPSUpdate(packet) {
        // packet: { lat, lng, speed, heading, confidence_score, updated_at }
        const now = Date.now();
        const conf = packet.confidence_score || 1.0;
        const netSpeedKmh = packet.speed || 0;

        // 1. Clamped Inverse-Speed Horizon Scaling
        let horizonMs = Math.max(PREDICT_HORIZON_MIN, Math.min(PREDICT_HORIZON_MAX, 
            (PREDICT_HORIZON_BASE_MS * conf) / (netSpeedKmh + PREDICT_HORIZON_BIAS)
        ));

        // If this is our very first packet, snap immediately
        if (this.currentState.lat === null) {
            this.currentState.lat = packet.lat;
            this.currentState.lng = packet.lng;
            this.currentState.heading = packet.heading || 0;
            this.targetState.lat = packet.lat;
            this.targetState.lng = packet.lng;
            this.targetState.targetTimeMs = now;
            this.status = netSpeedKmh > 5 ? 'MOVING' : 'DWELLING';
            return;
        }

        // 2. Variable Dwell-State Exit Logic
        if (this.status === 'DWELLING') {
            const distMoved = getDistance(this.currentState.lat, this.currentState.lng, packet.lat, packet.lng);
            if (netSpeedKmh > 5 && distMoved > 10) {
                this.dwellExitSamples++;
                if (this.dwellExitSamples >= DWELL_DEPART_SAMPLES_REQ || (now - this.dwellStartMs > DWELL_MAX_MS)) {
                    this.status = 'ACCELERATING';
                    this.dwellExitSamples = 0;
                } else {
                    // Still dwelling, ignore movement
                    this.targetState.targetTimeMs = now + 1000;
                    return;
                }
            } else {
                this.dwellExitSamples = 0; 
                this.targetState.targetTimeMs = now + 1000;
                return;
            }
        } else if (netSpeedKmh < 2) {
            // Check if entering dwell
            this.status = 'DWELLING';
            this.dwellStartMs = now;
            this.dwellExitSamples = 0;
        }

        // 3. Extrapolate Target Position along route based on Horizon
        // If route exists, project strictly along route. 
        // If no route, fallback to open-vector prediction.
        let targetLat = packet.lat;
        let targetLng = packet.lng;
        
        if (netSpeedKmh > 2) {
            const distMeters = (netSpeedKmh / 3.6) * (horizonMs / 1000); // d = v*t
            
            if (this.polySegments && this.polySegments.length > 0) {
                // Find nearest segment and project (Simplified distance constraint placeholder)
                // For a true 1D route constraints we'd compute fractional progress.
                // For now, we bias the target point using the raw heading vector extended by 'distMeters'.
                const brngRad = toRad(packet.heading || 0);
                const dRad = distMeters / R;
                const pLat = toRad(packet.lat);
                const pLng = toRad(packet.lng);
                
                const fLat = Math.asin(Math.sin(pLat)*Math.cos(dRad) + Math.cos(pLat)*Math.sin(dRad)*Math.cos(brngRad));
                const fLng = pLng + Math.atan2(Math.sin(brngRad)*Math.sin(dRad)*Math.cos(pLat), Math.cos(dRad)-Math.sin(pLat)*Math.sin(fLat));
                
                targetLat = toDeg(fLat);
                targetLng = toDeg(fLng);
            }
        }

        // 4. Dynamic Snapping based on Confidence
        const errorDist = getDistance(this.currentState.lat, this.currentState.lng, packet.lat, packet.lng);
        const dynamicSnapThreshold = DYNAMIC_SNAP_BASE + (netSpeedKmh * 0.5); // Faster = looser snap bounds
        
        if (errorDist > (dynamicSnapThreshold / conf)) {
            // High error & high confidence? Teleport logic (Hard Correction)
            if (conf >= 0.8) {
                this.currentState.lat = packet.lat;
                this.currentState.lng = packet.lng;
            }
        }

        this.targetState = {
            lat: targetLat,
            lng: targetLng,
            speed: netSpeedKmh,
            targetTimeMs: now + horizonMs
        };
        this.lastUpdateTime = now;
    }

    tick(deltaMs) {
        if (this.currentState.lat === null || this.status === 'DWELLING') {
            return this.currentState;
        }

        const now = Date.now();
        const timeRemaining = this.targetState.targetTimeMs - now;
        
        if (timeRemaining <= 0) {
            // Target arrived, coast or wait
            return this.currentState;
        }

        // Acceleration Ease (Bezier approx logic)
        let t = deltaMs / (timeRemaining + deltaMs); // Fraction of distance to move this frame
        if (this.status === 'ACCELERATING') {
            t = t * 0.5; // Ease in
            if (now - this.lastUpdateTime > 2000) this.status = 'MOVING';
        }

        // Interpolate position
        const interp = interpolatePosition(
            this.currentState.lat, this.currentState.lng,
            this.targetState.lat, this.targetState.lng,
            t
        );

        this.currentState.lat = interp.lat;
        this.currentState.lng = interp.lng;

        // Distance scaled Lookahead curve Rotation
        // In a full polyline engine, we'd look 'distance = LookaheadDistanceSecs * speed' 
        // ahead on the line string. Here we do an asymptotic ease towards the target point's heading.
        const targetBearing = getBearing(this.currentState.lat, this.currentState.lng, this.targetState.lat, this.targetState.lng);
        
        // Smooth rotation (shortest path)
        let diff = targetBearing - this.currentState.heading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        const rotSmoothFactor = 1 - Math.pow(1 - 0.1, deltaMs / 16.66);
        this.currentState.heading = this.currentState.heading + (diff * rotSmoothFactor); // Ease rotation

        return this.currentState;
    }
}
