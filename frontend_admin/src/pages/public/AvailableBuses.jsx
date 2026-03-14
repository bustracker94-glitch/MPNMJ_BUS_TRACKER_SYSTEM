import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import BusCard from '../../components/tracker/BusCard';
import { Search, ArrowLeft, RefreshCw } from 'lucide-react';

export default function AvailableBuses() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const fromStop = searchParams.get('from');
    const toStop = searchParams.get('to');

    const [buses, setBuses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActiveBuses();
    }, [fromStop, toStop]);

    const fetchActiveBuses = async () => {
        setLoading(true);
        // Fetch buses joined with their live state
        const { data } = await supabase.from('buses').select('*, bus_state(*)');
        if (data && data.length > 0) {
            const formatted = data.map(b => ({
                ...b,
                current_stop: b.bus_state?.[0]?.next_stop || 'Locating...',
                next_stop: b.bus_state?.[0]?.next_stop || '--',
                eta: b.bus_state?.[0]?.eta_mins || 0,
                delay_mins: b.bus_state?.[0]?.delay_mins || 0,
                location: { speed: b.bus_state?.[0]?.speed || 0 }
            }));
            setBuses(formatted);
        } else {
            // Mock data for UI presentation if DB is empty
            setBuses([
                { id: '1', bus_name: "Bus 1 - Erode Route", route_name: "R1", status: "active", current_stop: "Perundurai", next_stop: "Bhavani", eta: 10, location: { speed: 40 } },
                { id: '2', bus_name: "Bus 2 - Salem Route", route_name: "R2", status: "idle", current_stop: "Salem", next_stop: "--", eta: 45, location: { speed: 0 } },
                { id: '3', bus_name: "Bus 3 - Tirupur Route", route_name: "R3", status: "active", current_stop: "Avinashi", next_stop: "Chengapalli", eta: 22, location: { speed: 55 } }
            ]);
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#F9FAFB] items-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-2xl mt-4 sm:mt-8 mb-4">
                {/* Header Navigation */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-bold bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 hover:shadow-md"
                    >
                        <ArrowLeft size={18} /> Back
                    </button>
                    <button
                        onClick={fetchActiveBuses}
                        className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-full transition-all"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="mb-6">
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Available Buses</h1>
                    <p className="text-gray-500 mt-2 font-medium">Showing routes from your selection</p>
                </div>

                <div className="mt-6 space-y-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-white rounded-3xl shadow-sm border border-gray-100">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-yellow-200 border-t-yellow-500"></div>
                            <p className="font-semibold text-gray-500">Scanning Routes...</p>
                        </div>
                    ) : buses.length > 0 ? (
                        buses.map(bus => (
                            <BusCard
                                key={bus.id}
                                bus={bus}
                                onClick={() => navigate(`/track/${bus.id}`)}
                            />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100 text-center space-y-4">
                            <div className="p-5 bg-yellow-50 rounded-full text-yellow-600">
                                <Search size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">No Buses Found</h3>
                            <p className="text-gray-500 max-w-[250px] font-medium text-sm">We couldn't find any buses active for your route right now.</p>
                            <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-opacity mt-4 active:scale-95">
                                Modify Search
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
