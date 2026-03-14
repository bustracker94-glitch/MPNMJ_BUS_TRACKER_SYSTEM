import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Link } from 'lucide-react';

export default function AssignmentsModule() {
    const [assignments, setAssignments] = useState([]);
    const [buses, setBuses] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [routes, setRoutes] = useState([]);

    const [formData, setFormData] = useState({ bus_id: '', driver_id: '', route_id: '' });
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
        const [aRes, bRes, dRes, rRes] = await Promise.all([
            supabase.from('assignments').select('*, buses(bus_number, bus_name), drivers(driver_name), routes(route_name)'),
            supabase.from('buses').select('*').order('bus_number'),
            supabase.from('drivers').select('*').order('driver_name'),
            supabase.from('routes').select('*').order('route_name')
        ]);
        if (aRes.data) setAssignments(aRes.data);
        if (bRes.data) setBuses(bRes.data);
        if (dRes.data) setDrivers(dRes.data);
        if (rRes.data) setRoutes(rRes.data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tenantId) { alert('Organization not found. Please run the Supabase schema first.'); return; }

        let dbError = null;
        if (editingId) {
            const { error } = await supabase.from('assignments').update(formData).eq('assignment_id', editingId);
            dbError = error;
        } else {
            const existing = assignments.find(a => a.bus_id === formData.bus_id);
            if (existing) {
                alert("This bus is already assigned. Please edit the existing assignment.");
                return;
            }
            const { error } = await supabase.from('assignments').insert([{ ...formData, tenant_id: tenantId }]);
            dbError = error;
        }

        if (dbError) {
            alert("Database Error: " + dbError.message + "\n\nDid you run the supabase_update_query.sql file?");
            return;
        }

        setFormData({ bus_id: '', driver_id: '', route_id: '' });
        setEditingId(null);
        fetchData();
    };

    const handleEdit = (assignment) => {
        setEditingId(assignment.assignment_id);
        setFormData({
            bus_id: assignment.bus_id || '',
            driver_id: assignment.driver_id || '',
            route_id: assignment.route_id || ''
        });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this assignment?')) {
            await supabase.from('assignments').delete().eq('assignment_id', id);
            fetchData();
        }
    };

    return (
        <div className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-slate-100 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Manage Assignments</h2>
                    <p className="text-sm text-slate-500 mt-1">Step 5: Tie Everything Together (Bus + Driver + Route).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-slate-50 p-6 rounded-2xl border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-900">{editingId ? 'Edit Assignment' : 'Create Assignment'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Select Bus</label>
                            <select
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.bus_id}
                                onChange={e => setFormData({ ...formData, bus_id: e.target.value })}
                                required
                            >
                                <option value="">-- Choose Bus --</option>
                                {buses.map(b => <option key={b.bus_id} value={b.bus_id}>{b.bus_number}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Select Driver</label>
                            <select
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.driver_id}
                                onChange={e => setFormData({ ...formData, driver_id: e.target.value })}
                                required
                            >
                                <option value="">-- Choose Driver --</option>
                                {drivers.map(d => <option key={d.driver_id} value={d.driver_id}>{d.driver_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase">Select Route</label>
                            <select
                                className="w-full mt-1 p-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-yellow-500"
                                value={formData.route_id}
                                onChange={e => setFormData({ ...formData, route_id: e.target.value })}
                                required
                            >
                                <option value="">-- Choose Route --</option>
                                {routes.map(r => <option key={r.route_id} value={r.route_id}>{r.route_name}</option>)}
                            </select>
                        </div>

                        <button type="submit" className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-yellow-600 shadow-md hover:shadow-yellow-500/20 transition-all mt-4">
                            {editingId ? <><Edit2 size={16} /> Update Linking</> : <><Link size={16} /> Link System</>}
                        </button>
                        {editingId && (
                            <button type="button" onClick={() => { setEditingId(null); setFormData({ bus_id: '', driver_id: '', route_id: '' }) }} className="w-full py-3 bg-slate-200 text-slate-600 rounded-xl font-bold mt-2 hover:bg-slate-300 transition-colors">
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
                                    <th className="p-4 font-bold">Bus</th>
                                    <th className="p-4 font-bold">Driver</th>
                                    <th className="p-4 font-bold">Route Assigned</th>
                                    <th className="p-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.map(assignment => (
                                    <tr key={assignment.assignment_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-900">{assignment.buses?.bus_number}</td>
                                        <td className="p-4 font-medium text-slate-600">{assignment.drivers?.driver_name}</td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100">
                                                {assignment.routes?.route_name}
                                            </span>
                                        </td>
                                        <td className="p-4 flex justify-end gap-2 text-right">
                                            <button onClick={() => handleEdit(assignment)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(assignment.assignment_id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {assignments.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No active assignments found.</td>
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
