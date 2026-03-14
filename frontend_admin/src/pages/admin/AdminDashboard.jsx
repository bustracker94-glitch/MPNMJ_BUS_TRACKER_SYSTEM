import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Bus, Users, Map, Navigation, Power, LayoutDashboard, Database, Activity, Link as LinkIcon, Clock, Menu, X } from 'lucide-react';
import BusesModule from '../../components/admin/BusesModule';
import StopsModule from '../../components/admin/StopsModule';
import RoutesModule from '../../components/admin/RoutesModule';
import DriversModule from '../../components/admin/DriversModule';
import AssignmentsModule from '../../components/admin/AssignmentsModule';
import TripsModule from '../../components/admin/TripsModule';

import FleetOverview from '../../components/admin/FleetOverview';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ buses: 0, drivers: 0, routes: 0 });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!localStorage.getItem('admin')) {
            navigate('/admin/login');
            return;
        }
        fetchStats();
    }, [activeTab]); // Refresh stats whenever tab changes

    const fetchStats = async () => {
        const promises = [
            supabase.from('buses').select('*', { count: 'exact', head: true }),
            supabase.from('drivers').select('*', { count: 'exact', head: true }),
            supabase.from('routes').select('*', { count: 'exact', head: true })
        ];

        const results = await Promise.all(promises);
        setStats({
            buses: results[0].count || 0,
            drivers: results[1].count || 0,
            routes: results[2].count || 0
        });
    };

    const handleLogout = () => {
        localStorage.removeItem('admin');
        navigate('/admin/login');
    };

    const handleNavClick = (tab) => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Mobile Header Toggle */}
            <div className="md:hidden bg-white text-slate-900 p-4 flex justify-between items-center z-20 absolute top-0 left-0 right-0 shadow-sm border-b border-slate-200">
                <h2 className="text-xl font-bold text-yellow-600 tracking-tight">Admin<span className="text-slate-900">Panel</span></h2>
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-900">
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Sidebar Overlay for Mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/70 z-20 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`fixed md:static inset-y-0 left-0 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out w-64 bg-white text-slate-950 flex flex-col z-30 shadow-2xl h-full border-r border-slate-200`}>
                <div className="p-6 border-b border-slate-100 hidden md:block">
                    <h2 className="text-2xl font-bold text-yellow-600 tracking-tight">Admin<span className="text-slate-900">Panel</span></h2>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold flex items-center gap-1">Fleet Operations v2.0</p>
                </div>

                <div className="overflow-y-auto flex-1 mt-16 md:mt-0 custom-scrollbar">
                    <nav className="py-6 space-y-2 px-4">
                        <NavItem icon={<LayoutDashboard size={18} />} label="Overview" active={activeTab === 'dashboard'} onClick={() => handleNavClick('dashboard')} />

                        <div className="pt-4 pb-2">
                            <p className="px-4 text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Management Stack</p>
                        </div>

                        <NavItem icon={<Bus size={18} />} label="Buses" active={activeTab === 'buses'} onClick={() => handleNavClick('buses')} />
                        <NavItem icon={<Users size={18} />} label="Drivers" active={activeTab === 'drivers'} onClick={() => handleNavClick('drivers')} />
                        <NavItem icon={<Navigation size={18} />} label="Routes" active={activeTab === 'routes'} onClick={() => handleNavClick('routes')} />
                        <NavItem icon={<Map size={18} />} label="Stops" active={activeTab === 'stops'} onClick={() => handleNavClick('stops')} />
                        <NavItem icon={<LinkIcon size={18} />} label="Assignments" active={activeTab === 'assignments'} onClick={() => handleNavClick('assignments')} />

                        <div className="pt-4 pb-2">
                            <p className="px-4 text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Insights & Reports</p>
                        </div>
                        <NavItem icon={<Activity size={18} />} label="Analytics" active={activeTab === 'trips'} onClick={() => handleNavClick('trips')} />
                    </nav>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full p-3 rounded-xl"
                    >
                        <Power size={20} />
                        <span className="font-bold">End Session</span>
                    </button>
                </div>
            </div>

            {/* Main Content Areas */}
            <div className="flex-1 overflow-auto bg-slate-50 p-4 md:p-8 pt-20 md:pt-8 w-full custom-scrollbar">
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Fleet Monitoring</h1>
                            <p className="text-slate-500 font-medium mt-1">Unified command center for real-time transit intelligence.</p>
                        </div>

                        <FleetOverview />
                    </div>
                )}


                {activeTab === 'buses' && <BusesModule />}
                {activeTab === 'drivers' && <DriversModule />}
                {activeTab === 'routes' && <RoutesModule />}
                {activeTab === 'stops' && <StopsModule />}
                {activeTab === 'assignments' && <AssignmentsModule />}
                {activeTab === 'trips' && <TripsModule />}

            </div>
        </div>
    );
}

function NavItem({ icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-sm
        ${active ? 'bg-yellow-500 text-white shadow-md font-bold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
        >
            {icon}
            {label}
        </button>
    );
}

function StatCard({ icon, label, value, color, borderColor, pulse }) {
    return (
        <div className={`bg-white rounded-2xl md:rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden transition-all hover:bg-slate-50`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</p>
                    <h3 className="text-3xl md:text-4xl font-black text-slate-900 mt-2">{value}</h3>
                </div>
                <div className={`p-4 rounded-full ${color} ${borderColor} border relative`}>
                    {icon}
                    {pulse && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>}
                </div>
            </div>
        </div>
    );
}
