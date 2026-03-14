import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function BusesModule() {
    const [buses, setBuses] = useState([]);
    const [tenantId, setTenantId] = useState(null);
    const [formData, setFormData] = useState({ bus_number: '', bus_name: '', status: 'active' });
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        fetchTenant();
        fetchData();
    }, []);

    const fetchTenant = async () => {
        const { data } = await supabase.from('organizations').select('tenant_id').limit(1).single();
        if (data) setTenantId(data.tenant_id);
    };

    const fetchData = async () => {
        const { data } = await supabase.from('buses').select('*').order('created_at', { ascending: false });
        if (data) setBuses(data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tenantId) { alert('Organization not found. Please run the Supabase schema first.'); return; }
        const payload = {
            tenant_id: tenantId,
            bus_number: formData.bus_number,
            bus_name: formData.bus_name || formData.bus_number,
            status: formData.status
        };

        let dbError = null;
        if (editingId) {
            const { error } = await supabase.from('buses').update(payload).eq('bus_id', editingId);
            dbError = error;
        } else {
            const { error } = await supabase.from('buses').insert([payload]);
            dbError = error;
        }

        if (dbError) {
            alert("Database Error: " + dbError.message + "\n\nDid you run the supabase_update_query.sql file?");
            return;
        }

        setFormData({ bus_number: '', bus_name: '', status: 'active' });
        setEditingId(null);
        fetchData();
    };

    const handleEdit = (bus) => {
        setEditingId(bus.bus_id);
        setFormData({
            bus_number: bus.bus_number || '',
            bus_name: bus.bus_name || '',
            status: bus.status || 'active'
        });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this bus?')) {
            await supabase.from('buses').delete().eq('bus_id', id);
            fetchData();
        }
    };

    return (
        <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Manage Buses</h2>
                    <p className="text-sm text-slate-500 mt-1">Step 1: Create and manage buses in your fleet.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-slate-50 p-6 rounded-2xl border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-900">{editingId ? 'Edit Bus' : 'Add New Bus'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Bus Number</label>
                            <input
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-yellow-500 bg-white text-slate-900"
                                value={formData.bus_number}
                                onChange={e => setFormData({ ...formData, bus_number: e.target.value })}
                                placeholder="TN-01"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Bus Name</label>
                            <input
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-yellow-500 bg-white text-slate-900"
                                value={formData.bus_name}
                                onChange={e => setFormData({ ...formData, bus_name: e.target.value })}
                                placeholder="MPNMJ Express"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Status</label>
                            <select
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-yellow-500 bg-white text-slate-900"
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="maintenance">Maintenance</option>
                            </select>
                        </div>
                        <button type="submit" className="w-full py-3 primary-gradient text-white shadow-md hover:shadow-yellow-500/20 rounded-xl font-bold flex justify-center items-center gap-2 hover:opacity-90">
                            {editingId ? <><Edit2 size={16} /> Update Bus</> : <><Plus size={16} /> Create Bus</>}
                        </button>
                        {editingId && (
                            <button type="button" onClick={() => { setEditingId(null); setFormData({ bus_number: '', bus_name: '', status: 'active' }); }} className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-bold mt-2 hover:bg-slate-300">
                                Cancel
                            </button>
                        )}
                    </form>
                </div>

                <div className="lg:col-span-2">
                    <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-slate-100">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Bus Identifier</th>
                                    <th className="p-4 font-bold">Status</th>
                                    <th className="p-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {buses.map(bus => (
                                    <tr key={bus.bus_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-900">{bus.bus_number}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${bus.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {bus.status}
                                            </span>
                                        </td>
                                        <td className="p-4 flex justify-end gap-2">
                                            <button onClick={() => handleEdit(bus)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(bus.bus_id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {buses.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-slate-400 font-medium">No buses found. Add one to get started.</td>
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
