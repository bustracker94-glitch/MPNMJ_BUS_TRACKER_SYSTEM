import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Key } from 'lucide-react';

export default function DriversModule() {
    const [drivers, setDrivers] = useState([]);
    const [buses, setBuses] = useState([]);

    const [formData, setFormData] = useState({ driver_name: '', phone: '', password: '', assigned_bus: '' });
    const [editingId, setEditingId] = useState(null);
    const [tenantId, setTenantId] = useState(null);

    useEffect(() => {
        fetchData();
        fetchBuses();
        fetchTenant();
    }, []);

    const fetchTenant = async () => {
        const { data } = await supabase.from('organizations').select('tenant_id').limit(1).single();
        if (data) setTenantId(data.tenant_id);
    };

    const fetchData = async () => {
        const { data } = await supabase.from('drivers').select('*, buses(bus_number)').order('created_at', { ascending: false });
        if (data) setDrivers(data);
    };

    const fetchBuses = async () => {
        const { data } = await supabase.from('buses').select('*');
        if (data) setBuses(data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tenantId) { alert('Organization not found. Please run the Supabase schema first.'); return; }
        const payload = { ...formData, tenant_id: tenantId };
        if (!payload.assigned_bus) payload.assigned_bus = null;

        let dbError = null;
        if (editingId) {
            if (!payload.password) delete payload.password;
            const { error } = await supabase.from('drivers').update(payload).eq('driver_id', editingId);
            dbError = error;
        } else {
            const { error } = await supabase.from('drivers').insert([payload]);
            dbError = error;
        }

        if (dbError) {
            alert("Database Error: " + dbError.message + "\n\nDid you run the supabase_update_query.sql file?");
            return;
        }

        setFormData({ driver_name: '', phone: '', password: '', assigned_bus: '' });
        setEditingId(null);
        fetchData();
    };

    const handleEdit = (driver) => {
        setEditingId(driver.driver_id);
        setFormData({
            driver_name: driver.driver_name || '',
            phone: driver.phone || '',
            password: '',
            assigned_bus: driver.assigned_bus || ''
        });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this driver?')) {
            await supabase.from('drivers').delete().eq('driver_id', id);
            fetchData();
        }
    };

    return (
        <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Manage Drivers</h2>
                    <p className="text-sm text-slate-500 mt-1">Step 2: Add drivers and visually link them to their primary bus.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-slate-50 p-6 rounded-2xl border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-900">{editingId ? 'Edit Driver' : 'Add New Driver'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Driver Name</label>
                            <input
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.driver_name}
                                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                                autoComplete="off"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                            <input
                                type="tel"
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                autoComplete="off"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    className="w-full mt-1 p-3 pl-10 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    autoComplete="new-password"
                                    required={!editingId}
                                    placeholder={editingId ? "Leave blank to keep" : ""}
                                />
                                <Key className="absolute left-3 top-4 text-slate-400 w-5 h-5" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Link Primary Bus</label>
                            <select
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.assigned_bus}
                                onChange={e => setFormData({ ...formData, assigned_bus: e.target.value })}
                            >
                                <option value="">None</option>
                                {buses.map(b => <option key={b.bus_id} value={b.bus_id}>{b.bus_number} - {b.bus_name}</option>)}
                            </select>
                        </div>

                        <button type="submit" className="w-full py-3 bg-yellow-500 text-white rounded-xl shadow-md hover:shadow-yellow-500/20 font-bold flex justify-center items-center gap-2 hover:bg-yellow-600">
                            {editingId ? <><Edit2 size={16} /> Update Driver</> : <><Plus size={16} /> Create Driver</>}
                        </button>
                        {editingId && (
                            <button type="button" onClick={() => { setEditingId(null); setFormData({ driver_name: '', phone: '', password: '', assigned_bus: '' }) }} className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-bold mt-2 hover:bg-slate-300">
                                Cancel Edit
                            </button>
                        )}
                    </form>
                </div>

                <div className="lg:col-span-2">
                    <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-slate-100">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Driver Info</th>
                                    <th className="p-4 font-bold">Phone</th>
                                    <th className="p-4 font-bold">Linked Bus</th>
                                    <th className="p-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drivers.map(driver => (
                                    <tr key={driver.driver_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-900">{driver.driver_name}</td>
                                        <td className="p-4 text-slate-600 font-mono text-sm leading-tight">
                                            <div className="text-slate-500 font-medium mt-1">{driver.phone}</div>
                                        </td>
                                        <td className="p-4 text-slate-600 font-medium">
                                            {driver.buses?.bus_number ? (
                                                <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded-lg text-xs font-bold border border-yellow-100 italic">
                                                    {driver.buses.bus_number}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="p-4 flex justify-end gap-2 text-right">
                                            <button onClick={() => handleEdit(driver)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(driver.driver_id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {drivers.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No drivers registered yet.</td>
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
