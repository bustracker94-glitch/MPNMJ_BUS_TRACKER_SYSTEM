import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Route as RouteIcon, RotateCcw } from 'lucide-react';

export default function RoutesModule() {
    const [routes, setRoutes] = useState([]);
    const [stops, setStops] = useState([]);

    const [formData, setFormData] = useState({ route_name: '' });
    const [selectedStops, setSelectedStops] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [tenantId, setTenantId] = useState(null);

    useEffect(() => {
        fetchData();
        fetchTenant();
    }, []);

    const fetchTenant = async () => {
        const { data } = await supabase.from('organizations').select('tenant_id').limit(1).single();
        if (data) setTenantId(data.tenant_id);
    };

    const fetchData = async () => {
        const [rRes, sRes] = await Promise.all([
            supabase.from('routes').select('*').order('created_at', { ascending: false }),
            supabase.from('stops').select('*').order('stop_name')
        ]);
        if (rRes.data) setRoutes(rRes.data);
        if (sRes.data) setStops(sRes.data);
    };

    const calculatePolyline = async (stopsList) => {
        // Fetch real road geometry from OSRM
        const coords = stopsList.map(s => {
            const stop = stops.find(x => x.stop_id === s.stop_id);
            return stop ? [stop.longitude, stop.latitude] : null; // OSRM uses [lng, lat]
        }).filter(c => c !== null);

        if (coords.length < 2) return null;

        try {
            const coordsString = coords.map(c => c.join(',')).join(';');
            const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                return {
                    coordinates: data.routes[0].geometry.coordinates,
                    distance_km: (data.routes[0].distance / 1000).toFixed(2)
                };
            }
        } catch (error) {
            console.error('OSRM Error:', error);
            // Fallback to straight lines if OSRM fails
            return {
                coordinates: coords,
                distance_km: 0
            };
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tenantId) { alert('Organization not found. Please run the Supabase schema first.'); return; }

        const polyline = await calculatePolyline(selectedStops);
        const routePayload = {
            tenant_id: tenantId,
            route_name: formData.route_name,
            route_polyline: polyline
        };

        let r_id = editingId;
        let dbError = null;

        if (editingId) {
            const { error } = await supabase.from('routes').update(routePayload).eq('route_id', editingId);
            dbError = error;
            if (!dbError) {
                // Clear existing stops to insert fresh ordered stops
                await supabase.from('route_stops').delete().eq('route_id', editingId);
            }
        } else {
            const { data, error } = await supabase.from('routes').insert([routePayload]).select('route_id').single();
            dbError = error;
            if (data) r_id = data.route_id;
        }

        if (dbError) {
            alert("Database Error: " + dbError.message);
            return;
        }

        if (selectedStops.length > 0 && r_id) {
            const routeStopsPayload = selectedStops.map((ss, idx) => ({
                route_id: r_id,
                stop_id: ss.stop_id,
                stop_order: idx + 1,
                scheduled_arrival_time: ss.scheduled_arrival_time || null
            }));
            await supabase.from('route_stops').insert(routeStopsPayload);
        }

        setFormData({ route_name: '' });
        setSelectedStops([]);
        setEditingId(null);
        fetchData();
    };

    const handleEdit = async (route) => {
        setEditingId(route.route_id);
        setFormData({
            route_name: route.route_name || ''
        });

        const { data } = await supabase.from('route_stops').select('*').eq('route_id', route.route_id).order('stop_order');
        if (data) {
            setSelectedStops(data.map(rs => ({ 
                stop_id: rs.stop_id, 
                scheduled_arrival_time: rs.scheduled_arrival_time 
            })));
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this route entirely?')) {
            await supabase.from('routes').delete().eq('route_id', id);
            fetchData();
        }
    };

    const addStopToRoute = () => {
        setSelectedStops([...selectedStops, { stop_id: stops[0]?.stop_id || '', scheduled_arrival_time: '' }]);
    };

    const createReturnTrip = async (route) => {
        if (!tenantId) return;

        const { data: routeStops } = await supabase.from('route_stops').select('*').eq('route_id', route.route_id).order('stop_order');
        if (!routeStops || routeStops.length < 2) {
            alert("Not enough stops to reverse.");
            return;
        }

        const reversedStops = [...routeStops].reverse();
        const polyline = await calculatePolyline(reversedStops.map(rs => ({ stop_id: rs.stop_id })));
        
        const returnName = (route.route_name.toLowerCase().includes('return'))
            ? route.route_name.replace(/return/gi, 'Direct')
            : route.route_name + ' (Return)';

        const { data: newRoute, error: rError } = await supabase.from('routes').insert([{
            tenant_id: tenantId,
            route_name: returnName,
            route_polyline: polyline
        }]).select('route_id').single();

        if (rError || !newRoute) {
            alert("Failed: " + rError?.message);
            return;
        }

        // Prompt for times if user wants, otherwise just reverse
        const newRouteStops = reversedStops.map((rs, idx) => ({
            route_id: newRoute.route_id,
            stop_id: rs.stop_id,
            stop_order: idx + 1,
            scheduled_arrival_time: null // Reset times for return trip as they usually differ
        }));

        await supabase.from('route_stops').insert(newRouteStops);
        alert(`Created return trip: ${returnName}. Please edit it to set new evening times.`);
        fetchData();
    };

    return (
        <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Dynamic Schedule & Routes</h2>
                    <p className="text-sm text-slate-500 mt-1">Define paths and set precise arrival times for each stop.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-900">{editingId ? 'Edit Schedule' : 'Create New Schedule'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Route Name</label>
                                <input
                                    className="w-full mt-1 p-3 rounded-xl border border-slate-200 text-slate-900 bg-white focus:ring-yellow-500"
                                    value={formData.route_name}
                                    onChange={e => setFormData({ ...formData, route_name: e.target.value })}
                                    required
                                    placeholder="Morning Commute - Route A"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm border-dashed">
                            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">Time-Table Editor</h4>
                            <div className="space-y-3">
                                {selectedStops.map((ss, idx) => (
                                    <div key={idx} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                                {idx + 1}
                                            </span>
                                            <select
                                                className="flex-1 p-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm font-medium"
                                                value={ss.stop_id}
                                                onChange={e => {
                                                    const newStops = [...selectedStops];
                                                    newStops[idx].stop_id = e.target.value;
                                                    setSelectedStops(newStops);
                                                }}
                                            >
                                                {stops.map(s => <option key={s.stop_id} value={s.stop_id}>{s.stop_name}</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedStops(selectedStops.filter((_, i) => i !== idx))}
                                                className="text-red-500 hover:text-red-700 p-2 bg-red-50 rounded-lg shrink-0"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2 pl-8">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Scheduled Time:</label>
                                            <input 
                                                type="time"
                                                step="60"
                                                className="p-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs font-bold focus:ring-yellow-500"
                                                value={ss.scheduled_arrival_time || ''}
                                                onChange={e => {
                                                    const newStops = [...selectedStops];
                                                    newStops[idx].scheduled_arrival_time = e.target.value;
                                                    setSelectedStops(newStops);
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={addStopToRoute}
                                className="mt-4 w-full py-3 border-2 border-dashed border-yellow-500/30 text-yellow-600 font-bold text-sm rounded-xl hover:bg-yellow-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                <Plus size={16} /> Add Stop to Time-Table
                            </button>
                        </div>

                        <button type="submit" className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-yellow-600 transition-colors shadow-md hover:shadow-yellow-500/20">
                            {editingId ? <><Edit2 size={16} /> Update Schedule</> : <><RouteIcon size={16} /> Save Full Schedule</>}
                        </button>
                        {editingId && (
                            <button type="button" onClick={() => { setEditingId(null); setSelectedStops([]); setFormData({ route_name: '' }) }} className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-bold mt-2 hover:bg-slate-300">
                                Cancel
                            </button>
                        )}
                    </form>
                </div>

                <div className="">
                    <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-slate-100 shadow-sm">
                        <table className="w-full text-left border-collapse min-w-[300px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Route Title</th>
                                    <th className="p-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {routes.map(route => (
                                    <tr key={route.route_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-900">{route.route_name}</div>
                                        </td>
                                        <td className="p-4 flex justify-end gap-2">
                                            <button 
                                                onClick={() => createReturnTrip(route)} 
                                                title="Create Return Trip"
                                                className="p-2 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors"
                                            >
                                                <RotateCcw size={16} />
                                            </button>
                                            <button onClick={() => handleEdit(route)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(route.route_id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {routes.length === 0 && (
                                    <tr>
                                        <td colSpan="2" className="p-8 text-center text-slate-400 font-medium">No routes configured yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
