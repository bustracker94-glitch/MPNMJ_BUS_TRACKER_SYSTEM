import { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    FlatList, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { isLocationLive, calculateDistanceKm } from '../lib/etaCalculator';

const STALE_THRESHOLD = 3600000; // 1 hour

export default function BusesScreen() {
    const { fromId, fromName, fromLat, fromLng, toId, toName, toLat, toLng } = useLocalSearchParams();
    const router = useRouter();

    const [buses, setBuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const channelRef = useRef(null);

    useEffect(() => {
        fetchBuses();
        subscribeRealtime();
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, []);

    // ── Realtime: update live status on the bus cards ─────────────────────────
    const subscribeRealtime = () => {
        const ch = supabase.channel('public:tracking');
        ch.on('broadcast', { event: 'bus_update' }, ({ payload }) => {
            setBuses(prev => prev.map(b => {
                if (String(b.id) !== String(payload.bus_id)) return b;

                let etaToPickup = payload.eta ?? null;
                if (fromLat && fromLng && payload.lat && payload.lng) {
                    const dist = calculateDistanceKm(payload.lat, payload.lng, parseFloat(fromLat), parseFloat(fromLng));
                    const currentSpeed = (payload.speed && payload.speed > 5) ? payload.speed : 25;
                    etaToPickup = Math.round((dist / currentSpeed) * 60);
                }

                return {
                    ...b,
                    speed: payload.speed || 0,
                    eta: etaToPickup,
                    next_stop: payload.next_stop,
                    isLive: true,
                    updated_at: payload.updated_at,
                };
            }));
        }).subscribe();
        channelRef.current = ch;
    };

    // ── Fetch buses for the from→to route ────────────────────────────────────
    const fetchBuses = async (quiet = false) => {
        if (!quiet) setLoading(true);

        try {
            // 1. Find route_ids that contain BOTH the from and to stops, and verify direction
            const [fromRes, toRes] = await Promise.all([
                supabase.from('route_stops').select('route_id, stop_order').eq('stop_id', fromId),
                supabase.from('route_stops').select('route_id, stop_order').eq('stop_id', toId),
            ]);

            const fromMap = {};
            (fromRes.data || []).forEach(r => fromMap[r.route_id] = r.stop_order);

            const routeDirections = {};
            const commonIds = (toRes.data || [])
                .filter(r => fromMap[r.route_id] !== undefined && fromMap[r.route_id] !== r.stop_order)
                .map(r => {
                    routeDirections[r.route_id] = fromMap[r.route_id] > r.stop_order; // true if returning
                    return r.route_id;
                });

            if (commonIds.length === 0) {
                setBuses([]);
                setLoading(false);
                setRefreshing(false);
                return;
            }

            // 2. Get assignments + live bus states
            const [assignRes, stateRes] = await Promise.all([
                supabase
                    .from('assignments')
                    .select('bus_id, buses(bus_number, status), routes(route_id, route_name), drivers(driver_name)')
                    .in('route_id', commonIds),
                supabase
                    .from('bus_state')
                    .select('bus_id, latitude, longitude, speed, heading, eta_mins, next_stop, updated_at'),
            ]);

            const stateMap = {};
            (stateRes.data || []).forEach(s => { stateMap[s.bus_id] = s; });

            const enriched = (assignRes.data || []).map(a => {
                const s = stateMap[a.bus_id];
                const isLive = s && (Date.now() - new Date(s.updated_at).getTime()) < 30000;

                // Personalized ETA to the 'from' stop
                let etaToPickup = s?.eta_mins ?? null;
                if (isLive && fromLat && fromLng && s.latitude && s.longitude) {
                    const dist = calculateDistanceKm(s.latitude, s.longitude, parseFloat(fromLat), parseFloat(fromLng));
                    const currentSpeed = (s.speed && s.speed > 5) ? s.speed : 25;
                    etaToPickup = Math.round((dist / currentSpeed) * 60);
                }

                return {
                    id: a.bus_id,
                    bus_name:   a.buses?.bus_number   || 'Bus',
                    driver_name: a.drivers?.driver_name || 'Staff',
                    route_name: a.routes?.route_name  || '—',
                    route_id:   a.routes?.route_id,
                    speed:    s?.speed    || 0,
                    eta:      etaToPickup,
                    next_stop: s?.next_stop || null,
                    isLive,
                    updated_at: s?.updated_at || null,
                    isReverse: routeDirections[a.routes?.route_id] || false,
                };
            });

            // Sort: live buses first
            enriched.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));
            setBuses(enriched);
        } catch (err) {
            console.error('[BusesScreen]', err);
        }

        setLoading(false);
        setRefreshing(false);
    };

    const onRefresh = () => { setRefreshing(true); fetchBuses(true); };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color="#0f172a" />
                </TouchableOpacity>

                <View style={styles.routeRow}>
                    <View style={styles.routeStop}>
                        <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                        <Text style={styles.routeStopName} numberOfLines={1}>{fromName}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color="#F59E0B" style={{ marginHorizontal: 4 }} />
                    <View style={styles.routeStop}>
                        <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                        <Text style={styles.routeStopName} numberOfLines={1}>{toName}</Text>
                    </View>
                </View>
            </View>

            {/* ── Sub-header ── */}
            <View style={styles.subHeader}>
                <Text style={styles.subHeaderLabel}>Available Buses</Text>
                {!loading && (
                    <Text style={styles.subHeaderCount}>
                        {buses.length} found • {buses.filter(b => b.isLive).length} live
                    </Text>
                )}
            </View>

            {/* ── Bus List ── */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Scanning buses on route...</Text>
                </View>
            ) : (
                <FlatList
                    data={buses}
                    keyExtractor={b => String(b.id)}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />
                    }
                    renderItem={({ item: bus }) => (
                        <BusCard bus={bus} fromName={fromName} toName={toName} onPress={() => router.push({
                            pathname: `/bus/${bus.id}`,
                            params: { fromId, fromName, fromLat, fromLng, toId, toName, toLat, toLng, isReverse: bus.isReverse ? '1' : '0' },
                        })} />
                    )}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="bus-outline" size={52} color="#334155" />
                            <Text style={styles.emptyTitle}>No buses found</Text>
                            <Text style={styles.emptyDesc}>
                                No buses currently serve the route{'\n'}
                                <Text style={{ color: '#F59E0B' }}>{fromName}</Text>
                                {' → '}
                                <Text style={{ color: '#F59E0B' }}>{toName}</Text>
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

function BusCard({ bus, fromName, toName, onPress }) {
    const speedVal = Math.round(bus.speed || 0);
    const etaVal   = typeof bus.eta === 'number' && !isNaN(bus.eta) ? `${bus.eta} min` : '—';
    const live     = bus.isLive;

    return (
        <TouchableOpacity style={[styles.card, live && styles.cardLive]} onPress={onPress} activeOpacity={0.82}>
            {/* Icon */}
            <View style={[styles.busIcon, { backgroundColor: live ? '#FEF9C3' : '#1e293b' }]}>
                <Ionicons name="bus" size={24} color={live ? '#D97706' : '#475569'} />
            </View>

            {/* Info */}
            <View style={styles.busInfo}>
                <View style={styles.busTopRow}>
                    <Text style={styles.busName}>{bus.bus_name}</Text>
                    <View style={[styles.liveBadge, { backgroundColor: live ? '#052e16' : '#1e293b' }]}>
                        {live && <View style={styles.liveDot} />}
                        <Text style={[styles.liveText, { color: live ? '#22C55E' : '#475569' }]}>
                            {live ? 'LIVE' : 'OFFLINE'}
                        </Text>
                    </View>
                </View>

                <Text style={styles.routeName}>
                    <Ionicons name="person-outline" size={11} color="#64748B" /> {bus.driver_name}  •  <Ionicons name="map-outline" size={11} color="#F59E0B" /> {bus.route_name}
                </Text>

                {bus.next_stop && (
                    <View style={styles.nextStopRow}>
                        <Ionicons name="navigate" size={11} color="#64748B" />
                        <Text style={styles.nextStopText} numberOfLines={1}>Next: {bus.next_stop}</Text>
                    </View>
                )}

                {/* Footer row */}
                <View style={styles.busFooter}>
                    <View style={styles.etaBadge}>
                        <Ionicons name="time" size={11} color="#F59E0B" />
                        <Text style={styles.etaText}>{typeof bus.eta === 'number' && !isNaN(bus.eta) ? `${bus.eta} ETA` : 'CALCULATING...'}</Text>
                    </View>
                    <Text style={styles.speedText}>{speedVal} km/h</Text>
                    <View style={styles.trackChip}>
                        <Ionicons name="navigate" size={12} color="#0f172a" />
                        <Text style={styles.trackChipText}>Track</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        paddingTop: Platform.OS === 'ios' ? 56 : 44,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderBottomWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9',
        alignSelf: 'flex-start',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    routeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    routeStop: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 100 },
    routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    routeStopName: { color: '#0f172a', fontSize: 14, fontWeight: '700', flex: 1 },

    // Sub-header
    subHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10,
    },
    subHeaderLabel: { color: '#1e293b', fontSize: 16, fontWeight: '800' },
    subHeaderCount: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },

    list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

    // Bus card
    card: {
        flexDirection: 'row', gap: 14,
        backgroundColor: '#fff',
        borderRadius: 20, padding: 16,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 4,
    },
    cardLive: { borderColor: '#F59E0B44', backgroundColor: '#fffcf5' },
    busIcon: {
        width: 52, height: 52, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    busInfo: { flex: 1 },
    busTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    busName: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
    liveText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    routeName: { color: '#64748B', fontSize: 12, fontWeight: '700', letterSpacing: 0.2, marginBottom: 6 },
    nextStopRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
    nextStopText: { color: '#94A3B8', fontSize: 12, flex: 1 },
    busFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff7ed', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#fed7aa' },
    etaText: { color: '#f59e0b', fontSize: 11, fontWeight: '700' },
    speedText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600', flex: 1 },
    trackChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    trackChipText: { color: '#fff', fontSize: 11, fontWeight: '900' },

    // States
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
    loadingText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
    emptyTitle: { color: '#1e293b', fontSize: 17, fontWeight: '800', marginTop: 8 },
    emptyDesc: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
