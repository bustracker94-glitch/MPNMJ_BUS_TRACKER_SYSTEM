import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Crosshair } from 'lucide-react';

export default function StopsModule() {
    const [stops, setStops] = useState([]);

    const [formData, setFormData] = useState({ stop_name: '', latitude: '', longitude: '' });
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
        const { data } = await supabase.from('stops').select('*').order('stop_name');
        if (data) setStops(data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tenantId) { alert('Organization not found. Please run the Supabase schema first.'); return; }
        const payload = {
            tenant_id: tenantId,
            stop_name: formData.stop_name,
            latitude: parseFloat(formData.latitude),
            longitude: parseFloat(formData.longitude)
        };

        let dbError = null;
        if (editingId) {
            const { error } = await supabase.from('stops').update(payload).eq('stop_id', editingId);
            dbError = error;
        } else {
            const { error } = await supabase.from('stops').insert([payload]);
            dbError = error;
        }

        if (dbError) {
            alert("Database Error: " + dbError.message + "\n\nDid you run the supabase_update_query.sql file?");
            return;
        }

        setFormData({ stop_name: '', latitude: '', longitude: '' });
        setEditingId(null);
        fetchData();
    };

    const handleEdit = (stop) => {
        setEditingId(stop.stop_id);
        setFormData({ stop_name: stop.stop_name, latitude: stop.latitude, longitude: stop.longitude });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this stop? This may break existing routes.')) {
            await supabase.from('stops').delete().eq('stop_id', id);
            fetchData();
        }
    };

    const fetchCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude.toFixed(6),
                        longitude: position.coords.longitude.toFixed(6)
                    }));
                },
                error => alert("Could not fetch location. " + error.message)
            );
        }
    };

    return (
        <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Manage Stops</h2>
                    <p className="text-sm text-slate-500 mt-1">Add geographic coords for all campus bus stops.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-slate-50 p-6 rounded-2xl border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-900">{editingId ? 'Edit Stop' : 'Add New Stop'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Stop Name</label>
                            <input
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.stop_name}
                                onChange={e => setFormData({ ...formData, stop_name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-bottom">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Latitude</label>
                            </div>
                            <input
                                type="number" step="any"
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.latitude}
                                onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Longitude</label>
                            <input
                                type="number" step="any"
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.longitude}
                                onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                                required
                            />
                        </div>

                        <button
                            type="button"
                            onClick={fetchCurrentLocation}
                            className="w-full py-2 bg-yellow-50 text-yellow-600 rounded-lg text-sm font-bold flex justify-center items-center gap-2 hover:bg-yellow-100 transition-colors border border-yellow-100"
                        >
                            <Crosshair size={14} /> Get Current GPS
                        </button>

                        <button type="submit" className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 mt-4 hover:bg-yellow-600 focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors">
                            {editingId ? <><Edit2 size={16} /> Update Stop</> : <><Plus size={16} /> Add Stop</>}
                        </button>
                        {editingId && (
                            <button type="button" onClick={() => setEditingId(null)} className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-bold mt-2 hover:bg-slate-300 transition-colors">
                                Cancel Edit
                            </button>
                        )}
                    </form>
                </div>

                <div className="lg:col-span-2">
                    <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-slate-100">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Stop Name</th>
                                    <th className="p-4 font-bold">Coordinates (Lat, Lng)</th>
                                    <th className="p-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stops.map(stop => (
                                    <tr key={stop.stop_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-900">{stop.stop_name}</td>
                                        <td className="p-4 text-slate-500 font-mono text-xs italic">{stop.latitude}, {stop.longitude}</td>
                                        <td className="p-4 flex justify-end gap-2">
                                            <button onClick={() => handleEdit(stop)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(stop.stop_id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {stops.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-slate-400 font-medium">No stops recorded.</td>
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
