import { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    FlatList, TextInput, Modal, ActivityIndicator,
    StatusBar as RNStatusBar, Platform, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
    const router = useRouter();
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fromStop, setFromStop] = useState(null);
    const [toStop, setToStop] = useState(null);
    const [picking, setPicking] = useState(null); // 'from' | 'to'
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);

    useEffect(() => {
        supabase.from('stops').select('stop_id, stop_name, latitude, longitude').order('stop_name')
            .then(async ({ data }) => {
                if (data) {
                    setStops(data);
                    
                    // Smart Route Logic
                    try {
                        const collegeStop = data.find(s => s.stop_name.toLowerCase().includes('college') || s.stop_name.toLowerCase().includes('mpnmj'));
                        const savedHomeId = await AsyncStorage.getItem('@home_stop_id');
                        const homeStop = data.find(s => s.stop_id === savedHomeId);

                        if (collegeStop && homeStop) {
                            const hour = new Date().getHours();
                            const isEvening = hour >= 15; // 3 PM or later is evening commute

                            if (isEvening) {
                                setFromStop(collegeStop);
                                setToStop(homeStop);
                                setSmartAction({
                                    type: 'evening',
                                    title: 'Going Home?',
                                    subtitle: `Buses to ${homeStop.stop_name}`
                                });
                            } else {
                                setFromStop(homeStop);
                                setToStop(collegeStop);
                                setSmartAction({
                                    type: 'morning',
                                    title: 'To College',
                                    subtitle: `From ${homeStop.stop_name}`
                                });
                            }
                        }
                    } catch (e) {
                        console.log('Error loading smart route', e);
                    }
                }
                setLoading(false);
            });
    }, []);

    const [smartAction, setSmartAction] = useState(null);

    const openPicker = (type) => {
        setSearch('');
        setPicking(type);
        setTimeout(() => searchRef.current?.focus(), 300);
    };

    const handleSelect = (stop) => {
        if (picking === 'from') {
            setFromStop(stop);
            if (!toStop) {
                // auto-open to picker after from is chosen
                setTimeout(() => openPicker('to'), 200);
            }
        } else {
            setToStop(stop);
        }
        setPicking(null);
    };

    const handleSwap = () => {
        const tmp = fromStop;
        setFromStop(toStop);
        setToStop(tmp);
    };

    const canSearch = fromStop && toStop && fromStop.stop_id !== toStop.stop_id;

    const filtered = stops.filter(s =>
        s.stop_name.toLowerCase().includes(search.toLowerCase())
    );

    const goFind = async () => {
        if (!canSearch) return;

        // Save home stop for smart suggestions (the one that IS NOT the college)
        try {
            const isFromCollege = fromStop.stop_name.toLowerCase().includes('college') || fromStop.stop_name.toLowerCase().includes('mpnmj');
            const homeStopToSave = isFromCollege ? toStop : fromStop;
            await AsyncStorage.setItem('@home_stop_id', homeStopToSave.stop_id);
        } catch (e) {
            console.log('Failed to save home stop');
        }

        router.push({
            pathname: '/buses',
            params: {
                fromId: fromStop.stop_id,
                fromName: fromStop.stop_name,
                fromLat: fromStop.latitude,
                fromLng: fromStop.longitude,
                toId: toStop.stop_id,
                toName: toStop.stop_name,
                toLat: toStop.latitude,
                toLng: toStop.longitude,
            },
        });
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* ── Hero Header ── */}
            <View style={styles.hero}>
                <View style={styles.heroBadge}>
                    <Ionicons name="bus" size={26} color="#fff" />
                </View>
                <Text style={styles.heroTitle}>MPNMJ</Text>
                <Text style={styles.heroSub}>Bus Tracker</Text>
                <Text style={styles.heroTagline}>Real-time GPS • Find your bus instantly</Text>
            </View>

            {/* ── Route Picker Card ── */}
            <View style={styles.card}>
                <Text style={styles.cardLabel}>Where are you going?</Text>

                {/* FROM */}
                <TouchableOpacity style={styles.picker} onPress={() => openPicker('from')} activeOpacity={0.75}>
                    <View style={[styles.pickerDot, styles.dotFrom]} />
                    <View style={styles.pickerText}>
                        <Text style={styles.pickerHint}>FROM</Text>
                        <Text style={[styles.pickerValue, !fromStop && styles.pickerPlaceholder]}>
                            {fromStop ? fromStop.stop_name : 'Select boarding stop'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>

                {/* Swap divider */}
                <View style={styles.swapRow}>
                    <View style={styles.dashedLine} />
                    <TouchableOpacity style={styles.swapBtn} onPress={handleSwap} activeOpacity={0.7}>
                        <Ionicons name="swap-vertical" size={18} color="#F59E0B" />
                    </TouchableOpacity>
                    <View style={styles.dashedLine} />
                </View>

                {/* TO */}
                <TouchableOpacity style={styles.picker} onPress={() => openPicker('to')} activeOpacity={0.75}>
                    <View style={[styles.pickerDot, styles.dotTo]} />
                    <View style={styles.pickerText}>
                        <Text style={styles.pickerHint}>TO</Text>
                        <Text style={[styles.pickerValue, !toStop && styles.pickerPlaceholder]}>
                            {toStop ? toStop.stop_name : 'Select destination stop'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>

                {/* Find Button */}
                <TouchableOpacity
                    style={[styles.findBtn, !canSearch && styles.findBtnDisabled]}
                    onPress={goFind}
                    activeOpacity={canSearch ? 0.85 : 1}
                >
                    {loading && stops.length === 0 ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="search" size={18} color="#fff" />
                            <Text style={styles.findBtnText}>Find Buses</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Smart Action Shortcut */}
                {smartAction && (
                    <TouchableOpacity style={styles.smartBanner} onPress={() => goFind()}>
                        <View style={styles.smartIcon}>
                            <Ionicons 
                                name={smartAction.type === 'evening' ? "home" : "school"} 
                                size={14} 
                                color="#F59E0B" 
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.smartTitle}>{smartAction.title}</Text>
                            <Text style={styles.smartSub}>{smartAction.subtitle}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={16} color="#F59E0B" />
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Feature Pills ── */}
            <View style={styles.pills}>
                {[
                    { icon: 'location', label: 'Live GPS' },
                    { icon: 'time', label: 'ETA Updates' },
                    { icon: 'map', label: 'Route Map' },
                ].map(f => (
                    <View key={f.label} style={styles.pill}>
                        <Ionicons name={f.icon} size={14} color="#F59E0B" />
                        <Text style={styles.pillText}>{f.label}</Text>
                    </View>
                ))}
            </View>

            <Text style={styles.footer}>M.P.N.M.J Engineering College • Real-time Bus Tracking</Text>

            {/* ── Stop Picker Modal ── */}
            <Modal
                visible={!!picking}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setPicking(null)}
            >
                <View style={styles.modal}>
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>
                            {picking === 'from' ? '🟢 Select Boarding Stop' : '🔴 Select Destination'}
                        </Text>
                        <TouchableOpacity onPress={() => setPicking(null)}>
                            <Ionicons name="close-circle" size={26} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    {/* Search box */}
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={16} color="#64748B" />
                        <TextInput
                            ref={searchRef}
                            style={styles.searchInput}
                            placeholder="Search stops..."
                            placeholderTextColor="#94A3B8"
                            value={search}
                            onChangeText={setSearch}
                            autoCorrect={false}
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Ionicons name="close-circle" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 32 }} />
                    ) : (
                        <FlatList
                            data={filtered}
                            keyExtractor={s => String(s.stop_id)}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            renderItem={({ item }) => {
                                const isSelected =
                                    (picking === 'from' && fromStop?.stop_id === item.stop_id) ||
                                    (picking === 'to' && toStop?.stop_id === item.stop_id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.stopRow, isSelected && styles.stopRowSelected]}
                                        onPress={() => handleSelect(item)}
                                        activeOpacity={0.75}
                                    >
                                        <View style={[styles.stopIcon, isSelected && styles.stopIconSelected]}>
                                            <Ionicons
                                                name={isSelected ? 'checkmark-circle' : 'location-outline'}
                                                size={18}
                                                color={isSelected ? '#fff' : '#64748B'}
                                            />
                                        </View>
                                        <Text style={[styles.stopName, isSelected && styles.stopNameSelected]}>
                                            {item.stop_name}
                                        </Text>
                                        {isSelected && (
                                            <Ionicons name="checkmark" size={16} color="#F59E0B" />
                                        )}
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.emptyBox}>
                                    <Ionicons name="search-outline" size={36} color="#cbd5e1" />
                                    <Text style={styles.emptyText}>No stops found</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    // Hero
    hero: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 72 : 56,
        paddingBottom: 28,
        backgroundColor: '#fff',
        borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 5,
    },
    heroBadge: {
        width: 60, height: 60, borderRadius: 20,
        backgroundColor: '#F59E0B',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 14, elevation: 10,
    },
    heroTitle: { fontSize: 30, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
    heroSub: { fontSize: 14, color: '#F59E0B', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
    heroTagline: { fontSize: 12, color: '#64748B', fontWeight: '500', marginTop: 8 },

    // Route picker card
    card: {
        marginHorizontal: 18,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 20,
        marginTop: -20,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08, shadowRadius: 20, elevation: 12,
    },
    cardLabel: {
        color: '#94A3B8', fontSize: 10, fontWeight: '700',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
    },
    picker: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#f8fafc',
        borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    pickerDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
    dotFrom: { backgroundColor: '#22C55E' },
    dotTo: { backgroundColor: '#EF4444' },
    pickerText: { flex: 1 },
    pickerHint: { fontSize: 9, color: '#94A3B8', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
    pickerValue: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    pickerPlaceholder: { color: '#94A3B8', fontWeight: '500' },

    // Swap
    swapRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 },
    dashedLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
    swapBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#F59E0B',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
    },

    // Find button
    findBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#F59E0B',
        borderRadius: 16, padding: 16, marginTop: 16,
        shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    findBtnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.5 },
    findBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },

    smartBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fffbeb', borderRadius: 16, padding: 12,
        marginTop: 16, borderWidth: 1, borderColor: '#fef3c7',
    },
    smartIcon: {
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    smartTitle: { color: '#92400e', fontSize: 13, fontWeight: '800' },
    smartSub: { color: '#b45309', fontSize: 11, fontWeight: '500', marginTop: 1 },

    // Pills
    pills: { flexDirection: 'row', gap: 10, marginTop: 24, paddingHorizontal: 18 },
    pill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        backgroundColor: '#fff', paddingVertical: 10, borderRadius: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
    },
    pillText: { fontSize: 11, color: '#64748B', fontWeight: '600' },

    footer: { textAlign: 'center', color: '#94A3B8', fontSize: 10, marginTop: 'auto', paddingBottom: 28, fontWeight: '500' },

    // Modal
    modal: { flex: 1, backgroundColor: '#fff', paddingTop: 8 },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 18, paddingBottom: 16, gap: 10,
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', position: 'absolute', top: -12, alignSelf: 'center', left: '50%', marginLeft: -20 },
    modalTitle: { flex: 1, color: '#0f172a', fontSize: 15, fontWeight: '800' },

    searchBox: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#f8fafc',
        margin: 16, marginTop: 0,
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    searchInput: { flex: 1, color: '#0f172a', fontSize: 15, fontWeight: '600' },

    // Stop list
    stopRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 18, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    stopRowSelected: { backgroundColor: '#fff7ed' },
    stopIcon: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: '#f1f5f9',
        alignItems: 'center', justifyContent: 'center',
    },
    stopIconSelected: { backgroundColor: '#F59E0B' },
    stopName: { flex: 1, color: '#475569', fontSize: 14, fontWeight: '600' },
    stopNameSelected: { color: '#0f172a', fontWeight: '800' },

    emptyBox: { alignItems: 'center', paddingTop: 40, gap: 10 },
    emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
});
