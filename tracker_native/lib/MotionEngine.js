/**
 * MotionEngine - Mobility-Grade Predictive Animation Loop
 * Decouples GPS latency from UI frame updates.
 */

const PREDICT_HORIZON_BASE_MS = 3500;
const COAST_DURATION_MAX_MS = 6000;
const DWELL_SPEED_THRESHOLD = 3; // km/h
const SNAP_THRESHOLD_METERS = 80;

// Easing / Physics
const ACCEL_SMOOTHING = 0.06; // Lower = smoother/more inertia
const ROTATION_SMOOTHING = 0.10;
const FRICTION = 0.98; // For coasting decay
const PREDICTION_BIAS = 1.1; // Slight over-reach for fluidity

const R = 6371e3;
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

function projectPoint(lat, lng, bearing, distanceMeters) {
    const brngRad = toRad(bearing);
    const dRad = distanceMeters / R;
    const pLat = toRad(lat);
    const pLng = toRad(lng);
    const fLat = Math.asin(Math.sin(pLat)*Math.cos(dRad) + Math.cos(pLat)*Math.sin(dRad)*Math.cos(brngRad));
    const fLng = pLng + Math.atan2(Math.sin(brngRad)*Math.sin(dRad)*Math.cos(pLat), Math.cos(dRad)-Math.sin(pLat)*Math.sin(fLat));
    return { lat: toDeg(fLat), lng: toDeg(fLng) };
}

export class MotionEngine {
    constructor() {
        this.currentState = { lat: null, lng: null, heading: 0, speedKmh: 0, confidence: 1.0 };
        this.targetState = { lat: null, lng: null, targetTimeMs: 0, speedKmh: 0, heading: 0 };
        this.status = 'INIT'; 
        this.lastPacketTime = 0;
    }

    pushGPSUpdate(packet) {
        // packet: { lat, lng, speed, heading, confidence_score }
        const now = Date.now();
        const speedKmh = packet.speed || 0;
        const heading = packet.heading || 0;
        const conf = packet.confidence_score || 1.0;

        if (this.currentState.lat === null) {
            this.currentState = { lat: packet.lat, lng: packet.lng, heading, speedKmh, confidence: conf };
            this.targetState = { ...this.currentState, targetTimeMs: now };
            this.status = speedKmh > DWELL_SPEED_THRESHOLD ? 'MOVING' : 'DWELLING';
            this.lastPacketTime = now;
            return;
        }

        // Adaptive Prediction Horizon: Faster = further ahead prediction
        const horizonMs = PREDICT_HORIZON_BASE_MS * (1 + (speedKmh / 100));
        
        if (speedKmh < DWELL_SPEED_THRESHOLD) {
            this.status = 'DWELLING';
            this.targetState = { lat: packet.lat, lng: packet.lng, targetTimeMs: now + 2000, speedKmh: 0, heading: this.currentState.heading };
        } else {
            this.status = 'MOVING';
            const distanceToProject = (speedKmh / 3.6) * (horizonMs / 1000);
            const predicted = projectPoint(packet.lat, packet.lng, heading, distanceToProject);
            this.targetState = { lat: predicted.lat, lng: predicted.lng, targetTimeMs: now + horizonMs, speedKmh, heading };
        }

        // Hard Correction
        const error = getDistance(this.currentState.lat, this.currentState.lng, packet.lat, packet.lng);
        if (error > SNAP_THRESHOLD_METERS / conf) {
            this.currentState.lat = packet.lat;
            this.currentState.lng = packet.lng;
        }

        this.currentState.confidence = conf;
        this.lastPacketTime = now;
    }

    tick(deltaMs) {
        if (this.currentState.lat === null) return null;
        const now = Date.now();

        if (this.status === 'DWELLING') {
            this.currentState.lat += (this.targetState.lat - this.currentState.lat) * ACCEL_SMOOTHING;
            this.currentState.lng += (this.targetState.lng - this.currentState.lng) * ACCEL_SMOOTHING;
            return this.currentState;
        }

        const timeSincePacket = now - this.lastPacketTime;
        if (now > this.targetState.targetTimeMs) {
            // Coasting with friction
            if (timeSincePacket < COAST_DURATION_MAX_MS) {
                const speedMs = (this.targetState.speedKmh / 3.6) * Math.pow(FRICTION, timeSincePacket/1000);
                const distMoved = speedMs * (deltaMs / 1000);
                const next = projectPoint(this.currentState.lat, this.currentState.lng, this.currentState.heading, distMoved);
                this.currentState.lat = next.lat;
                this.currentState.lng = next.lng;
            }
        } else {
            // Kinematic Interpolation
            const timeRemaining = Math.max(16, this.targetState.targetTimeMs - now);
            const t = Math.min(0.2, deltaMs / timeRemaining);
            
            // Apply confidence-weighted momentum
            const weight = t * (this.currentState.confidence || 1.0);
            this.currentState.lat += (this.targetState.lat - this.currentState.lat) * weight * PREDICTION_BIAS;
            this.currentState.lng += (this.targetState.lng - this.currentState.lng) * weight * PREDICTION_BIAS;
        }

        // Heading lookahead (shortest path rotation)
        let diff = this.targetState.heading - this.currentState.heading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        this.currentState.heading += diff * ROTATION_SMOOTHING;

        return this.currentState;
    }
}
