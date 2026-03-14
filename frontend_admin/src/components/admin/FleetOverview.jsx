import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { io } from 'socket.io-client';
import { MapPin, Activity, TrendingUp, AlertCircle, Wifi } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const STALE_THRESHOLD_MS = 30000; // 30s without ping = stale

function getBusStatus(bus) {
    const age = Date.now() - new Date(bus.updated_at).getTime();
    if (age > STALE_THRESHOLD_MS) return 'offline';
    if (bus.speed > 60) return 'speeding';
    if (bus.speed > 0) return 'online';
    return 'idle';
}

const STATUS_STYLES = {
    online:   { dot: 'bg-green-500',  badge: 'bg-green-50 text-green-600 border-green-200',   label: 'Moving'   },
    idle:     { dot: 'bg-yellow-500', badge: 'bg-yellow-50 text-yellow-600 border-yellow-200', label: 'Idle'     },
    offline:  { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-500 border-slate-200',       label: 'Offline'  },
    speeding: { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-600 border-red-200',          label: 'Speeding' },
};

export default function FleetOverview() {
    const [liveFleet, setLiveFleet] = useState({});
    const [busNames, setBusNames] = useState({});
    const [stats, setStats] = useState({ activeBuses: 0, avgSpeed: 0, offlineBuses: 0 });
    const staleTimers = useRef({});

    useEffect(() => {
        loadBusNames();
        const tenant_id = localStorage.getItem('tenant_id') || undefined;
        
        // 1. Fetch initial state via REST (Vercel compatible)
        const queryParams = tenant_id ? `?tenant_id=${tenant_id}` : '';
        fetch(`${SOCKET_URL}/api/live-states${queryParams}`)
            .then(res => res.json())
            .then(state => {
                setLiveFleet(state);
                updateStats(state);
            })
            .catch(err => console.error('Failed to load fleet initial states:', err));

        // 2. Initialize Supabase Realtime Broadcast for live telemetry
        const channel = supabase.channel('public:tracking');
        
        channel.on('broadcast', { event: 'bus_update' }, (payload) => {
            const update = payload.payload;
            if (tenant_id && update.tenant_id !== tenant_id) return; // Filter by tenant

            setLiveFleet(prev => {
                const newState = { ...prev, [update.bus_id]: update };
                updateStats(newState);
                if (staleTimers.current[update.bus_id]) clearTimeout(staleTimers.current[update.bus_id]);
                staleTimers.current[update.bus_id] = setTimeout(() => {
                    setLiveFleet(curr => ({ ...curr }));
                }, STALE_THRESHOLD_MS + 1000);
                return newState;
            });
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Connected to Fleet Supabase Telemetry');
            }
        });

        // Optional: Local Socket.IO fallback
        const socket = io(SOCKET_URL, {
            auth: { tenant_id },
            query: { tenant_id }
        });
        socket.on('bus_update', (update) => {
             channel.emit('broadcast', { event: 'bus_update', payload: update }); 
        });

        return () => {
            socket.disconnect();
            supabase.removeChannel(channel);
            Object.values(staleTimers.current).forEach(clearTimeout);
        };
    }, []);

    const loadBusNames = async () => {
        const { data } = await supabase.from('buses').select('bus_id, bus_name, bus_number');
        if (data) {
            const map = {};
            data.forEach(b => { map[b.bus_id] = `${b.bus_number} – ${b.bus_name}`; });
            setBusNames(map);
        }
    };

    const updateStats = (fleet) => {
        const buses = Object.values(fleet);
        const active = buses.filter(b => getBusStatus(b) !== 'offline');
        const offline = buses.filter(b => getBusStatus(b) === 'offline');
        const speed = active.length > 0 ? active.reduce((acc, b) => acc + (b.speed || 0), 0) / active.length : 0;
        setStats({ activeBuses: active.length, avgSpeed: Math.round(speed), offlineBuses: offline.length });
    };

    const fleetList = Object.values(liveFleet);

    return (
        <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-500 rounded-xl relative border border-red-100">
                        <Activity size={24} />
                        <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping border-2 border-white"></span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Buses</p>
                        <p className="text-2xl font-black text-slate-900">{stats.activeBuses}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-500 rounded-xl border border-blue-100">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Fleet Speed</p>
                        <p className="text-2xl font-black text-slate-900">{stats.avgSpeed} <span className="text-sm">KM/H</span></p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className={`p-3 rounded-xl border ${stats.offlineBuses > 0 ? 'bg-orange-50 text-orange-500 border-orange-100' : 'bg-green-50 text-green-500 border-green-100'}`}>
                        {stats.offlineBuses > 0 ? <AlertCircle size={24} /> : <Wifi size={24} />}
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Offline / Stale</p>
                        <p className={`text-2xl font-black ${stats.offlineBuses > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {stats.offlineBuses}
                        </p>
                    </div>
                </div>
            </div>

            {/* Live Fleet Table */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                <h3 className="text-slate-900 font-bold text-lg mb-4 flex items-center gap-2">
                    <MapPin size={18} className="text-yellow-600" /> Live Fleet Telemetry
                </h3>
                {fleetList.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <Activity size={40} className="mx-auto mb-3 opacity-30 text-slate-600" />
                        <p className="font-medium text-slate-400">Waiting for telemetry signals...</p>
                        <p className="text-sm mt-1">Bus beacons will appear here once drivers start tracking.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
                                    <th className="pb-3 font-bold px-2">Bus</th>
                                    <th className="pb-3 font-bold px-2">Status</th>
                                    <th className="pb-3 font-bold px-2">Delay</th>
                                    <th className="pb-3 font-bold px-2">Speed</th>
                                    <th className="pb-3 font-bold px-2">Next Stop</th>
                                    <th className="pb-3 font-bold px-2">ETA</th>
                                    <th className="pb-3 font-bold px-2">Last Ping</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fleetList.map(bus => {
                                    const status = getBusStatus(bus);
                                    const style = STATUS_STYLES[status] || STATUS_STYLES.offline;
                                    const ageMs = Date.now() - new Date(bus.updated_at).getTime();
                                    const ageSec = Math.round(ageMs / 1000);
                                    const delay = bus.delay_mins || 0;
                                    return (
                                        <tr key={bus.bus_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-2 font-black text-slate-900 text-sm">
                                                {busNames[bus.bus_id] || bus.bus_id.slice(0, 8)}
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${style.badge}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                                                    {style.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                {delay > 5 ? (
                                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg">+{delay}m Late</span>
                                                ) : delay < 0 ? (
                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg">Early</span>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 px-2 py-1 rounded-lg">On Time</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-2 font-bold text-blue-600 text-sm">{Math.round(bus.speed || 0)} KM/H</td>
                                            <td className="py-3 px-2 text-sm text-slate-600">{bus.next_stop || '—'}</td>
                                            <td className="py-3 px-2 text-sm font-bold text-yellow-600">{bus.eta ? `${bus.eta} min` : '—'}</td>
                                            <td className="py-3 px-2 text-xs text-slate-400">{ageSec}s ago</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
