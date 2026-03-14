import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Dimensions, RefreshControl, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { supabase, BACKEND_URL } from '../lib/supabase';
import { getBusETAAndStops, calcBearing, isLocationLive } from '../lib/etaCalculator';
import { getLeafletMapHTML } from '../lib/leafletMap';
import { MotionEngine } from '../lib/MotionEngine';

const { height } = Dimensions.get('window');
const STALE_THRESHOLD = 3600000; // 1 hour — same as web AvailableBuses

export default function TrackerScreen() {
    const router = useRouter();
    const mapRef = useRef(null);
    const webviewRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);
    const mapHtml = useMemo(() => getLeafletMapHTML(), []);

    const [buses, setBuses] = useState([]);
    const [stops, setStops] = useState([]);
    const [selectedBus, setSelectedBus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ─── Update Batching ───────────────────────────────────────────────────
    const updateBatch = useRef([]);
    const flushUpdates = useCallback(() => {
        if (updateBatch.current.length === 0) return;
        
        const updates = updateBatch.current;
        updateBatch.current = [];

        // Update React state
        setBuses(prev => prev.map(bus => {
            const up = updates.find(u => u.bus_id === bus.id);
            if (!up) return bus;
            const loc = { latitude: up.lat, longitude: up.lng, speed: up.speed, bearing: up.heading || 0, updated_at: up.updated_at, confidence: up.confidence_score, lifecycle: up.lifecycle_state };
            const { next_stop, eta, eta_bracket } = getBusETAAndStops(loc, bus.routeStops);
            const enriched = { ...bus, location: loc, next_stop, eta, eta_bracket };
            
            // If this is the currently selected bus, update it too
            setSelectedBus(prev => (prev?.id === bus.id ? enriched : prev));
            
            return enriched;
        }));

        // Push to WebView
        if (webviewRef.current && mapReady) {
            updates.forEach(up => {
                webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ 
                    type: 'bus_update', 
                    bus_id: up.bus_id, 
                    lat: up.lat, 
                    lng: up.lng, 
                    heading: up.heading || 0,
                    lifecycle: up.lifecycle_state, 
                    confidence: up.confidence_score || 1.0
                })}); true;`);
            });
        }
    }, [mapReady]);

    useEffect(() => {
        const interval = setInterval(flushUpdates, 400); 
        return () => clearInterval(interval);
    }, [flushUpdates]);

    // ─── Supabase Realtime broadcast ────────────────────────────────────────
    useEffect(() => {
        const channel = supabase.channel('public:tracking');
        channel.on('broadcast', { event: 'bus_update' }, ({ payload }) => {
            updateBatch.current.push(payload);
        }).subscribe(status => {
            if (status === 'SUBSCRIBED') console.log('[Tracker] Connected to realtime');
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ─── Camera Logic — Edge-Aware Following ──────────────────────────────
    // ─── Selection Sync with Map ───────────────────────────────────────────
    useEffect(() => {
        if (!webviewRef.current || !mapReady) return;
        if (selectedBus) {
             webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ 
                 type: 'select_bus', 
                 busId: selectedBus.id, 
                 focus: true 
             })}); true;`);
             
             // Also inject polyline for selected bus if available
             if (selectedBus.route_polyline?.coordinates) {
                 const poly = selectedBus.route_polyline.coordinates.map(c => [c[1], c[0]]);
                 webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ 
                     type: 'route_update', 
                     polyline: poly,
                     fit: false
                 })}); true;`);
             }
        }
    }, [selectedBus?.id, mapReady]);

    // ─── Fetch all buses + locations + stops ───
    const fetchAllData = async (quiet = false) => {
        if (!quiet) setLoading(true);

        const [assignRes, locRes, routeStopsRes, stopsRes] = await Promise.all([
            supabase.from('assignments').select('bus_id, buses(bus_number, status), routes(route_id, route_name, route_polyline)'),
            supabase.from('bus_state').select('bus_id, latitude, longitude, speed, heading, eta_mins, next_stop, updated_at, confidence_score, lifecycle_state').order('updated_at', { ascending: false }),
            supabase.from('route_stops').select('route_id, stop_order, stops(stop_name, latitude, longitude)'),
            supabase.from('stops').select('*').order('stop_name'),
        ]);

        if (stopsRes.data) setStops(stopsRes.data);

        if (assignRes.data) {
            const enriched = assignRes.data.map(a => {
                const s = locRes.data?.find(l => l.bus_id === a.bus_id);
                const isRecent = s && (Date.now() - new Date(s.updated_at).getTime() < STALE_THRESHOLD);
                const loc = isRecent ? {
                    latitude: s.latitude, longitude: s.longitude,
                    speed: s.speed, bearing: s.heading || 0,
                    eta: s.eta_mins, next_stop: s.next_stop, 
                    updated_at: s.updated_at,
                    confidence: s.confidence_score,
                    lifecycle: s.lifecycle_state || 'ONLINE'
                } : null;

                const routeStops = routeStopsRes.data?.filter(rs => rs.route_id === a.routes?.route_id) || [];
                const { current_stop, next_stop, eta } = getBusETAAndStops(loc, routeStops);

                return {
                    id: a.bus_id,
                    bus_name: a.buses?.bus_number || 'Unknown',
                    route_name: a.routes?.route_name || 'No Route',
                    route_polyline: a.routes?.route_polyline,
                    routeStops,
                    location: loc,
                    current_stop, next_stop, eta,
                    status: isRecent ? (a.buses?.status || 'inactive') : 'offline',
                };
            });
            setBuses(enriched);

            if (webviewRef.current && mapReady) {
                enriched.forEach(b => {
                    if (b.location) {
                        webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ 
                            type: 'bus_update', 
                            bus_id: b.id, 
                            lat: b.location.latitude, 
                            lng: b.location.longitude, 
                            heading: b.location.bearing || 0,
                            lifecycle: b.location.lifecycle,
                            confidence: b.location.confidence || 1.0
                        })}); true;`);
                    }
                });
            }
        }
        setLoading(false);
        setRefreshing(false);
    };

    const onRefresh = () => { setRefreshing(true); fetchAllData(true); };

    const handleSelectBus = useCallback((bus) => {
        setSelectedBus(bus);
    }, []);

    const liveBuses = buses.filter(b => b.location?.latitude);

    if (loading) return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#F59E0B" />
            <Text style={styles.loadingText}>Transport Intelligence Syncing...</Text>
        </View>
    );

    const handleMapMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'marker_press') {
                const bus = buses.find(b => String(b.id) === String(data.busId));
                if (bus) setSelectedBus(bus);
            }
        } catch (e) {}
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.mapContainer}>
                <WebView
                    ref={webviewRef}
                    source={{ html: mapHtml }}
                    style={StyleSheet.absoluteFill}
                    onLoad={() => setMapReady(true)}
                    onMessage={handleMapMessage}
                    scrollEnabled={false}
                    javaScriptEnabled
                    originWhitelist={['*']}
                />
            </View>

            <View style={styles.headerRow}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color="#1e293b" />
                </TouchableOpacity>
                <View style={[styles.liveChip, selectedBus?.location?.lifecycle === 'OFF_ROUTE' && { borderColor: '#EF4444' }]}>
                    <View style={[styles.liveDot, liveBuses.length > 0 && styles.liveDotActive, selectedBus?.location?.lifecycle === 'OFF_ROUTE' && { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.liveChipText}>
                        {selectedBus?.location?.lifecycle === 'OFF_ROUTE' ? 'Route Deviation' : (liveBuses.length > 0 ? `${liveBuses.length} Active` : 'Fleet Idle')}
                    </Text>
                </View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => fetchAllData(true)}>
                    <Ionicons name="refresh" size={20} color="#1e293b" />
                </TouchableOpacity>
            </View>

            <View style={styles.sheet}>
                <View style={styles.handle} />
                <FlatList
                    data={buses}
                    keyExtractor={b => b.id}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
                    renderItem={({ item: bus }) => {
                        const live = isLocationLive(bus.location?.updated_at);
                        const selected = selectedBus?.id === bus.id;
                        const cycle = bus.location?.lifecycle || 'OFFLINE';
                        const speed = Math.round(bus.location?.speed || 0);
                        
                        // Confidence-based ETA Bracketing (Managing Perception via PAD model)
                        const conf = bus.location?.confidence || 1.0;
                        const etaDisplay = bus.eta_bracket || (conf < 0.7 && bus.eta !== '--' ? `${bus.eta}-${Math.round(bus.eta * 1.4)}` : `${bus.eta}`);

                        return (
                            <TouchableOpacity
                                style={[styles.card, selected && styles.cardSelected]}
                                onPress={() => handleSelectBus(bus)}
                                activeOpacity={0.82}
                            >
                                <View style={[styles.cardIcon, { backgroundColor: live ? (cycle === 'OFF_ROUTE' ? '#FEE2E2' : '#FEF9C3') : '#1e293b' }]}>
                                    <Ionicons name="bus" size={22} color={cycle === 'OFF_ROUTE' ? '#EF4444' : (live ? '#D97706' : '#475569')} />
                                    {conf < 0.7 && live && (
                                        <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#64748B', borderRadius: 10, padding: 2 }}>
                                            <Ionicons name="alert-circle" size={10} color="#fff" />
                                        </View>
                                    )}
                                </View>

                                <View style={styles.cardBody}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.busName}>{bus.bus_name}</Text>
                                        <View style={[styles.statusBadge, { backgroundColor: cycle === 'OFF_ROUTE' ? '#450a0a' : (live ? '#052e16' : '#1e293b') }]}>
                                            <Text style={[styles.statusText, { color: cycle === 'OFF_ROUTE' ? '#EF4444' : (live ? '#22C55E' : '#64748B') }]}>
                                                {cycle.replace('_', ' ')}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={styles.routeName}>{bus.route_name}</Text>
                                    
                                    <View style={styles.cardFooter}>
                                        <View style={[styles.etaBadge, conf < 0.7 && { borderColor: '#64748B' }]}>
                                            <Ionicons name="time" size={12} color={conf < 0.7 ? '#64748B' : "#F59E0B"} />
                                            <Text style={[styles.etaText, conf < 0.7 && { color: '#64748B' }]}>{etaDisplay} min</Text>
                                        </View>
                                        <Text style={styles.speedText}>{speed} km/h</Text>
                                        <TouchableOpacity style={styles.trackBtn} onPress={() => router.push(`/bus/${bus.id}`)}>
                                            <Text style={styles.trackBtnText}>Intelligence</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: '#94A3B8', fontWeight: '600', fontSize: 13, letterSpacing: 1 },
    mapContainer: { flex: 1, position: 'relative' },
    map: { flex: 1 },
    headerRow: {
        position: 'absolute', top: Platform.OS === 'ios' ? 54 : 44,
        left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 10
    },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#e2e8f0',
        elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
    },
    liveChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        borderWidth: 1, borderColor: '#e2e8f0',
        elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
    liveDotActive: { backgroundColor: '#22C55E' },
    liveChipText: { color: '#1e293b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    marker: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    markerSelected: { width: 54, height: 54 },
    markerPulse: {
        position: 'absolute', width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(245,158,11,0.2)',
    },
    markerDot: {
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        elevation: 6,
    },
    markerDotSelected: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D97706' },
    sheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        paddingTop: 12, paddingHorizontal: 16, paddingBottom: 32,
        maxHeight: Dimensions.get('window').height * 0.45,
        borderTopWidth: 1, borderColor: '#e2e8f0',
        elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 20
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 16 },
    card: {
        flexDirection: 'row', gap: 14,
        backgroundColor: '#fff', borderRadius: 20,
        padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
    },
    cardSelected: { borderColor: '#F59E0B', backgroundColor: '#fff7ed' },
    cardIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
    cardBody: { flex: 1 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    busName: { color: '#1e293b', fontSize: 16, fontWeight: '800' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
    routeName: { color: '#64748B', fontSize: 13, fontWeight: '600', marginBottom: 12 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B' },
    etaText: { color: '#F59E0B', fontSize: 12, fontWeight: '800' },
    speedText: { color: '#475569', fontSize: 12, fontWeight: '700', flex: 1 },
    trackBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    trackBtnText: { color: '#000', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
});

// ─── Marker Logic is now handled by WebView/Leaflet ────────────────────────
// Removed AnimatedBusMarker React component as animation loop now runs in WebView JS
