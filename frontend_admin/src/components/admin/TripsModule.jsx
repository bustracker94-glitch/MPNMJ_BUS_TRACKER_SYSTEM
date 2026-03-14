import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

export default function TripsModule() {
    const [trips, setTrips] = useState([]);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetchTrips();
        fetchHistory();

        const channel = supabase.channel('trips_status')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
                fetchTrips();
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const fetchTrips = async () => {
        const { data } = await supabase
            .from('trips')
            .select('*, buses(bus_number, bus_name), drivers(driver_name), routes(route_name)')
            .order('started_at', { ascending: false })
            .limit(20);
        if (data) setTrips(data);
    };

    const fetchHistory = async () => {
        const { data } = await supabase
            .from('trip_history')
            .select('*, buses(bus_number, bus_name)')
            .order('date', { ascending: false })
            .limit(10);
        if (data) setHistory(data);
    };

    const handleEndTrip = async (tripId, busId) => {
        await supabase.from('trips')
            .update({ status: 'completed', ended_at: new Date().toISOString() })
            .eq('trip_id', tripId);
        await supabase.from('buses').update({ status: 'inactive' }).eq('bus_id', busId);
        fetchTrips();
    };

    return (
        <div className="space-y-6">
            {/* Active Trips */}
            <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Active Trip Monitor</h2>
                        <p className="text-sm text-slate-500 mt-1">Live tracking of current bus trips.</p>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                <th className="p-4 font-bold">Trip</th>
                                <th className="p-4 font-bold">Bus & Driver</th>
                                <th className="p-4 font-bold">Route</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold">Started</th>
                                <th className="p-4 font-bold">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trips.map(trip => (
                                <tr key={trip.trip_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-mono text-[10px] text-slate-400">#{trip.trip_id.split('-')[0]}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-900">{trip.buses?.bus_number} – {trip.buses?.bus_name}</div>
                                        <div className="text-slate-500 text-sm">{trip.drivers?.driver_name}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100">
                                            {trip.routes?.route_name}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full flex items-center gap-1 w-max text-[10px] font-black uppercase ${trip.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {trip.status === 'active' ? <Clock size={10} className="animate-pulse" /> : <CheckCircle size={10} />}
                                            {trip.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-xs font-medium text-slate-500">
                                        {new Date(trip.started_at).toLocaleTimeString()}
                                        {trip.ended_at && <div className="text-slate-400">→ {new Date(trip.ended_at).toLocaleTimeString()}</div>}
                                    </td>
                                    <td className="p-4">
                                        {trip.status === 'active' && (
                                            <button
                                                onClick={() => handleEndTrip(trip.trip_id, trip.bus_id)}
                                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                                            >
                                                End Trip
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {trips.length === 0 && (
                                <tr><td colSpan="6" className="p-8 text-center text-slate-400 font-medium">No trips recorded yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Trip History Analytics */}
            {history.length > 0 && (
                <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100">
                    <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-500" /> Trip Analytics History
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                    <th className="pb-3 font-bold">Date</th>
                                    <th className="pb-3 font-bold">Bus</th>
                                    <th className="pb-3 font-bold">Max Speed</th>
                                    <th className="pb-3 font-bold">Avg Speed</th>
                                    <th className="pb-3 font-bold">Distance</th>
                                    <th className="pb-3 font-bold">Deviations</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.history_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="py-3 text-sm font-medium text-slate-600">{h.date}</td>
                                        <td className="py-3 text-sm font-bold text-slate-900">{h.buses?.bus_number}</td>
                                        <td className={`py-3 text-sm font-black ${h.max_speed_kmh > 60 ? 'text-red-600' : 'text-blue-600'}`}>
                                            {Math.round(h.max_speed_kmh || 0)} KM/H
                                            {h.max_speed_kmh > 60 && <AlertTriangle size={12} className="inline ml-1" />}
                                        </td>
                                        <td className="py-3 text-sm text-slate-500">{Math.round(h.avg_speed_kmh || 0)} KM/H</td>
                                        <td className="py-3 text-sm text-slate-500">{(h.total_distance_km || 0).toFixed(1)} km</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${h.route_deviations > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                {h.route_deviations}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
