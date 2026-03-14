import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { supabase } from './supabaseClient.js';
import busLocationRoutes, { initializeBusState, processLocationUpdate } from './routes/busLocation.js';
import chatbotRoutes from './routes/chatbot.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';
import { checkAndNotify } from './lib/notificationService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust in production
        methods: ["GET", "POST"]
    }
});

// In-memory bus state
const busState = {};

// Scalable Adaptive Normalizer State
const busNormalizerState = {}; // Tracks { lastEmitTime, packetCount, velocityArray }

/**
 * Normalization Scheduler Loop
 * Ticks natively at 60Hz. Evaluates each bus independently.
 * Emits uniquely between 0.8Hz (1250ms) and 2.0Hz (500ms)
 */
setInterval(() => {
    const now = Date.now();
    
    for (const [busId, state] of Object.entries(busState)) {
        if (!busNormalizerState[busId]) {
            busNormalizerState[busId] = { lastEmitTime: 0, packetCount: 0, lastEmittedLat: 0, lastEmittedLng: 0 };
        }
        
        const normState = busNormalizerState[busId];
        const ageMs = now - (new Date(state.updated_at).getTime());
        
        // Don't emit if the cache data is deeply stale (>15 seconds offline)
        if (ageMs > 15000) continue;

        // Adaptive Cadence Math
        const speedKmh = state.speed || 0;
        
        // Determine emit threshold (bounded 500ms to 1250ms)
        // High speed = more frequent emits (2.0 Hz)
        // Low speed = less frequent emits (0.8 Hz)
        let emitThresholdMs = 1250;
        if (speedKmh > 50) emitThresholdMs = 500;
        else if (speedKmh > 20) emitThresholdMs = 800;
        
        // Also force high frequency if they are turning sharply (distance variance check could go here)

        if (now - normState.lastEmitTime >= emitThresholdMs) {
            // CONFIDENCE SCORE: If packets are arriving smoothly, confidence is high.
            // If we are starving for packets (ageMs is large), confidence drops.
            let confidence_score = state.confidence_score !== undefined ? state.confidence_score : 1.0;
            if (ageMs > 5000) confidence_score = Math.min(confidence_score, 0.5);
            if (ageMs > 8000) confidence_score = Math.min(confidence_score, 0.2);

            const normalizedPayload = {
                ...state,
                normalized_timestamp: new Date().toISOString(),
                raw_timestamp: state.updated_at,
                confidence_score: confidence_score
            };

            // Broadcast
            if (state.tenant_id) {
                io.to(`tenant_${state.tenant_id}`).emit('bus_update', normalizedPayload);
            }
            io.emit('bus_update', normalizedPayload);
            
            // 3b. Smart Notifications — check if anyone needs an alert
            const delayMins = state.delay_mins || 0;
            if (delayMins >= 10 && state.next_stop) {
                checkAndNotify(busId, delayMins, state.next_stop).catch(err =>
                    console.error('[NotificationEngine] Background error:', err)
                );
            }

            // SUPABASE REALTIME BROADCAST FOR VERCEL COMPATIBILITY
            // Removed from setInterval loop and moved directly into /api/update-location
            // to survive Serverless function hibernation architecture.

            normState.lastEmitTime = now;
            normState.lastEmittedLat = state.lat;
            normState.lastEmittedLng = state.lng;
        }
    }
}, 16); // 60fps eval loop (cheap math, low overhead)

app.use(cors());
app.use(express.json());

// Pass io and busState to routes via middleware or shared object
app.use((req, res, next) => {
    req.io = io;
    req.busState = busState;
    next();
});

// Basic health check route
app.get('/', (req, res) => {
    res.json({
        message: 'Transport OS API is running',
        active_buses: Object.keys(busState).length,
        uptime_seconds: Math.round(process.uptime())
    });
});

app.use('/api', busLocationRoutes);
app.use('/api/bot', chatbotRoutes);
app.use('/api', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    const tenant_id = socket.handshake.query?.tenant_id || socket.handshake.auth?.tenant_id;
    console.log('Client connected:', socket.id, 'Tenant:', tenant_id || 'Global');

    if (tenant_id) {
        socket.join(`tenant_${tenant_id}`);
    }

    // Send current state to new client, filtered by tenant
    const initialState = {};
    for (const [busId, state] of Object.entries(busState)) {
        if (!tenant_id || state.tenant_id === tenant_id) {
            initialState[busId] = state;
        }
    }
    
    socket.emit('initial_state', initialState);

    socket.on('bus_location_update', async (data) => {
        try {
            await processLocationUpdate(data, io, busState);
        } catch (error) {
            console.error('WebSocket Location Update Error:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Load initial state from DB
    initializeBusState(busState);
});

export { io, busState };
export default app;

