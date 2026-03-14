import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { getBusETAAndStops, calcBearing, isLocationLive, calculateDistanceKm } from '../../lib/etaCalculator';
import { getLeafletMapHTML } from '../../lib/leafletMap';

const { height } = Dimensions.get('window');
const STALE_THRESHOLD = 24 * 3600000;

function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    const [h, m] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(h), parseInt(m), 0);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function BusDetailScreen() {
    const { busId, fromLat, fromLng, fromName, toName, isReverse } = useLocalSearchParams();
    const router = useRouter();
    const webviewRef = useRef(null);
    const prevLoc = useRef(null);

    const [bus, setBus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);

    const [isSubscribed, setIsSubscribed] = useState(false);

    // ── Fetch bus details + build initial map HTML ────────────────────────────
    const mapHtml = useMemo(() => getLeafletMapHTML(), []);
    const updateQueue = useRef([]);
    const flushTimer = useRef(null);

    // ── Update Batching Logic ──────────────────────────────────────────────
    const flushUpdates = useCallback(() => {
        if (updateQueue.current.length === 0 || !webviewRef.current) return;
        const lastUpdate = updateQueue.current[updateQueue.current.length - 1];
        updateQueue.current = [];
        webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ type: 'bus_update', ...lastUpdate })});true;`);
    }, []);

    useEffect(() => {
        flushTimer.current = setInterval(flushUpdates, 300);
        return () => clearInterval(flushTimer.current);
    }, [flushUpdates]);

    // ── Real-time Socket Listener ──────────────────────────────────────────
    useEffect(() => {
        fetchBusDetails();
        const channel = supabase.channel('tracking_bus_' + busId);
        channel.on('broadcast', { event: 'bus_update' }, (msg) => {
            const p = msg.payload;
            if (String(p.bus_id) !== String(busId)) return;

            setBus(prev => {
                if (!prev) return prev;
                const old = prevLoc.current;
                let bearing = old ? calcBearing(old.latitude, old.longitude, p.lat, p.lng) : (p.heading || 0);
                const loc = { latitude: p.lat, longitude: p.lng, speed: p.speed, heading: p.heading, bearing, confidence: p.confidence_score, lifecycle: p.lifecycle_state, updated_at: p.updated_at };
                prevLoc.current = loc;
                
                // Add to batch queue
                updateQueue.current.push({ lat: p.lat, lng: p.lng, heading: bearing, confidence: p.confidence_score || 1.0 });
                return { ...prev, location: loc };
            });
        }).subscribe();

        return () => supabase.removeChannel(channel);
    }, [busId]);

    const fetchBusDetails = async () => {
        setLoading(true);
        try {
            const [assignRes, locRes] = await Promise.all([
                supabase.from('assignments').select('bus_id, buses(bus_number, status), routes(route_id, route_name, route_polyline), drivers(driver_name)').eq('bus_id', busId).maybeSingle(),
                supabase.from('bus_state').select('*').eq('bus_id', busId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
            ]);

            const assignment = assignRes.data;
            const s = locRes.data;

            if (assignment) {
                const isRecent = s && (Date.now() - new Date(s.updated_at).getTime() < STALE_THRESHOLD);
                const loc = isRecent ? { latitude: s.latitude, longitude: s.longitude, speed: s.speed, heading: s.heading, bearing: s.heading || 0, updated_at: s.updated_at, confidence: s.confidence_score || 1.0, lifecycle: s.lifecycle_state || 'ONLINE' } : null;
                if (loc) prevLoc.current = loc;

                const busObj = { id: busId, bus_name: assignment.buses?.bus_number || 'Bus', driver_name: assignment.drivers?.driver_name || 'Staff', route_name: assignment.routes?.route_name || '—', route_polyline: assignment.routes?.route_polyline, status: isRecent ? (assignment.buses?.status || 'active') : 'offline', location: loc, routeStops: [] };
                
                if (assignment.routes?.route_id) {
                    const { data: rsData } = await supabase.from('route_stops').select('route_id, stop_order, scheduled_arrival_time, stops(stop_name, latitude, longitude)').eq('route_id', assignment.routes.route_id).order('stop_order');
                    if (rsData) busObj.routeStops = rsData;
                }
                setBus(busObj);
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    // ── Imperative Map Initialization ─────────────────────────────────────
    useEffect(() => {
        if (!bus || !mapReady || !webviewRef.current) return;

        const loc = bus.location;
        let polyline = bus.route_polyline?.coordinates?.map(c => [c[1], c[0]]) || [];
        if (isReverse === '1') polyline = polyline.reverse();

        const { all_stops = [] } = getBusETAAndStops(loc, bus.routeStops, isReverse === '1') || {};
        const stops = all_stops.map(s => s.latitude ? { name: s.stop_name, lat: s.latitude, lng: s.longitude, isCurrent: s.is_current, isPassed: s.is_passed } : null).filter(Boolean);

        // Inject initial data
        if (loc) webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ type: 'init', lat: loc.latitude, lng: loc.longitude, heading: loc.bearing, confidence: loc.confidence })}); true;`);
        webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ type: 'route_update', polyline })}); true;`);
        webviewRef.current.injectJavaScript(`onMsg(${JSON.stringify({ type: 'stops_update', stops })}); true;`);
    }, [bus?.id, mapReady, isReverse]);

    const etaData = bus ? getBusETAAndStops(bus.location, bus.routeStops, isReverse === '1') : {};
    const { current_stop, next_stop, eta_bracket, all_stops = [] } = etaData || {};
    const live = isLocationLive(bus?.location?.updated_at);
    const speed = Math.round(bus?.location?.speed || 0);
    const cycle = bus?.location?.lifecycle || (live ? 'ONLINE' : 'OFFLINE');
    const conf = bus?.location?.confidence || 1.0;

    let displayEta = eta_bracket ?? '--';
    if (live && conf < 0.7 && displayEta !== '--') {
         const [min] = displayEta.split('-').map(Number);
         displayEta = `${min}-${Math.round(min * 1.4)}`;
    }

    if (loading) return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#F59E0B" />
            <Text style={styles.loadingText}>Syncing Telemetry...</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <View style={styles.mapContainer}>
                <WebView 
                    ref={webviewRef} 
                    source={{ html: mapHtml }} 
                    style={StyleSheet.absoluteFill} 
                    javaScriptEnabled 
                    onLoad={() => setMapReady(true)}
                    originWhitelist={['*']} 
                    scrollEnabled={false} 
                />
                
                <View style={styles.mapHeader}>
                    <TouchableOpacity style={styles.mapBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={18} color="#0f172a" />
                    </TouchableOpacity>
                    <View style={styles.busTitlePill}>
                        <Ionicons name="bus" size={14} color="#F59E0B" />
                        <View>
                            <Text style={styles.busTitleName}>{bus?.bus_name} • Intelligence</Text>
                            <Text style={styles.busTitleRoute} numberOfLines={1}>{cycle.replace('_',' ')}</Text>
                        </View>
                    </View>
                    <View style={[styles.liveChip, { backgroundColor: cycle === 'OFF_ROUTE' ? '#7f1d1d' : (live ? '#064e3b' : '#1e3a8a') }]}>
                        <View style={[styles.liveDot, { backgroundColor: cycle === 'OFF_ROUTE' ? '#ef4444' : (live ? '#22c55e' : '#64748b') }]} />
                        <Text style={[styles.liveText, { color: cycle === 'OFF_ROUTE' ? '#f87171' : (live ? '#34d399' : '#94a3b8') }]}>{cycle}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.panel}>
                <View style={[styles.etaCard, cycle === 'OFF_ROUTE' && { backgroundColor: '#fef2f2', borderColor: '#fee2e2' }]}>
                    <View style={styles.etaLeft}>
                        <View style={styles.etaIconWrap}>
                            <Ionicons name="navigate" size={18} color={cycle === 'OFF_ROUTE' ? '#dc2626' : "#D97706"} style={{ transform: [{ rotate: '45deg' }] }} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.etaLabel, cycle === 'OFF_ROUTE' && { color: '#991b1b' }]}>{cycle === 'OFF_ROUTE' ? 'DEVIATION' : 'NEXT STOP'}</Text>
                            <Text style={styles.etaStop} numberOfLines={1}>{next_stop || 'Searching...'}</Text>
                        </View>
                    </View>
                    <View style={styles.etaRight}>
                        <Text style={[styles.etaMins, cycle === 'OFF_ROUTE' && { color: '#dc2626' }]}>{displayEta}</Text>
                        <Text style={styles.etaUnit}>min</Text>
                    </View>
                </View>

                <View style={styles.metaRow}>
                    <Ionicons name="analytics" size={13} color="#64748B" />
                    <Text style={styles.metaText}>Confidence: {Math.round(conf * 100)}%</Text>
                    <View style={styles.speedBadge}>
                        <Text style={styles.speedText}>{speed} km/h</Text>
                    </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.timeline}>
                    {all_stops.map((stop, idx) => (
                        <View key={stop.stop_id ?? idx} style={[styles.stopRow, stop.is_passed && { opacity: 0.4 }]}>
                            <View style={styles.timeCol}>
                                <Text style={styles.stopTime}>{formatTime(stop.scheduled_time)}</Text>
                                <Text style={styles.arrivalLabel}>sched</Text>
                            </View>
                            <View style={styles.nodeCol}>
                                {idx < all_stops.length - 1 && <View style={{ position: 'absolute', top: 20, bottom: -34, width: 2, backgroundColor: '#f1f5f9' }}><View style={{ height: (stop.is_passed || stop.is_current) ? '100%':'0%', backgroundColor: '#F59E0B' }} /></View>}
                                <View style={[styles.stopCircle, stop.is_passed && styles.stopPassed, stop.is_current && styles.stopCurrent, stop.is_next && styles.stopNext]} />
                            </View>
                            <View style={styles.stopInfo}>
                                <Text style={[styles.stopName, stop.is_passed && styles.stopNamePassed]}>{stop.stop_name}</Text>
                                <Text style={styles.stopNum}>Stop {idx + 1}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center:    { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
    retryBtn: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0' },
    retryText: { color: '#F59E0B', fontWeight: '700' },

    // Map
    mapContainer: { height: height * 0.46, position: 'relative', backgroundColor: '#f8fafc' },
    mapLoading: { alignItems: 'center', justifyContent: 'center', gap: 12 },

    mapHeader: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 54 : 44,
        left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10,
    },
    mapBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    busTitlePill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    busTitleName:  { color: '#0f172a', fontSize: 13, fontWeight: '800' },
    busTitleRoute: { color: '#64748B', fontSize: 10, marginTop: 1 },
    liveChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
        backgroundColor: 'rgba(255,255,255,0.9)',
    },
    liveDot: { width: 7, height: 7, borderRadius: 4 },
    liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

    routeStrip: {
        position: 'absolute', bottom: 10, left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
        zIndex: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    routeStripDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', flexShrink: 0 },
    routeStripText: { color: '#1e293b', fontSize: 11, fontWeight: '700', flex: 1 },

    // Panel
    panel: {
        flex: 1, backgroundColor: '#fff',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 16, paddingHorizontal: 18,
        shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 15,
    },
    etaCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#fff7ed', borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: '#fed7aa', marginBottom: 12,
    },
    etaLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    etaIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    },
    etaLabel: { color: '#9a3412', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    etaStop:  { color: '#1e293b', fontSize: 14, fontWeight: '800', marginTop: 2 },
    etaRight: { alignItems: 'flex-end', minWidth: 60 },
    etaMins:  { color: '#ea580c', fontSize: 26, fontWeight: '900', lineHeight: 30 },
    etaUnit:  { color: '#f97316', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    metaText: { color: '#64748B', fontSize: 12, flex: 1 },
    speedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
    speedText: { color: '#475569', fontSize: 11, fontWeight: '700' },

    timelineLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
    timeline: { flex: 1 },

    stopRow:    { flexDirection: 'row', alignItems: 'stretch', marginBottom: 32, minHeight: 40 },
    timeCol:    { width: 72, alignItems: 'flex-end', paddingRight: 12, paddingTop: 2 },
    stopTime:   { color: '#1e293b', fontSize: 12, fontWeight: '800', letterSpacing: -0.3 },
    arrivalLabel: { color: '#F59E0B', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    textPassed: { color: '#cbd5e1', textDecorationLine: 'line-through' },
    nodeCol:    { width: 30, alignItems: 'center', zIndex: 2 },
    stopCircle: {
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#e2e8f0',
        alignItems: 'center', justifyContent: 'center',
    },
    stopPassed:  { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
    stopCurrent: { backgroundColor: '#F59E0B', borderColor: '#F59E0B', transform: [{ scale: 1.3 }] },
    stopNext:    { backgroundColor: '#fff', borderColor: '#F59E0B' },
    busBelowStop: { position: 'absolute', top: 22, alignSelf: 'center', zIndex: 10 },
    busBelowIcon: {
        backgroundColor: '#F59E0B', padding: 4, borderRadius: 20,
        borderWidth: 2, borderColor: '#fff',
        shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    },
    stopInfo:       { flex: 1, paddingLeft: 14, paddingTop: 2 },
    stopName:       { color: '#1e293b', fontSize: 13, fontWeight: '700', lineHeight: 18 },
    stopNamePassed: { color: '#cbd5e1' },
    stopNum:        { color: '#94A3B8', fontSize: 10, marginTop: 2 },

    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginLeft: 6,
        borderWidth: 1,
        borderColor: 'transparent'
    },
    badgeOnTime: { backgroundColor: '#f0fdf4', borderColor: '#dcfce7' },
    badgeMinorDelayed: { backgroundColor: '#fff7ed', borderColor: '#ffedd5' },
    badgeMajorDelayed: { backgroundColor: '#fef2f2', borderColor: '#fee2e2' },
    badgeEarly: { backgroundColor: '#eff6ff', borderColor: '#dbeafe' },
    badgeText: { fontSize: 9, fontWeight: '800' }
});
