import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import BusMap from '../../components/map/BusMap';
import { ArrowLeft, Navigation, MapPin, Clock } from 'lucide-react';

export default function BusTracking() {
    const { busId } = useParams();
    const navigate = useNavigate();
    const [bus, setBus] = useState(null);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStops();
        fetchBusDetails();

        // Subscribe to live tracking specifically for this bus
        const channel = supabase.channel(`tracking_${busId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bus_locations',
                filter: `bus_id=eq.${busId}`
            }, (payload) => {
                setBus(currentBus => {
                    if (!currentBus) return currentBus;
                    return { ...currentBus, location: payload.new };
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [busId]);

    const fetchBusDetails = async () => {
        setLoading(true);
        const { data } = await supabase.from('buses').select('*').eq('id', busId).single();
        if (data) {
            setBus(data);
        } else {
            // Mock data if real bus not found in DB
            setBus({
                id: busId,
                bus_name: "Bus " + busId + " (Demo)",
                route_name: "Tracked Route",
                status: "active",
                current_stop: "Perundurai",
                next_stop: "Bhavani",
                eta: 10,
                location: { latitude: 11.2721, longitude: 77.5855, speed: 45 }
            });
        }
        setLoading(false);
    };

    const fetchStops = async () => {
        const { data } = await supabase.from('stops').select('*').order('stop_name');
        if (data) setStops(data);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 font-bold space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-200 border-t-yellow-500"></div>
                <p>Establishing Satellite Connection...</p>
            </div>
        );
    }

    if (!bus) {
        return <div className="min-h-screen flex items-center justify-center font-bold text-gray-600">Bus not found!</div>
    }

    return (
        <div className="flex flex-col h-screen bg-[#F9FAFB] relative overflow-hidden animate-in fade-in duration-300">
            {/* Top Bar Floating Status */}
            <div className="absolute top-4 left-4 right-4 z-[400] md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-full md:max-w-xl pointer-events-none">
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-xl flex flex-col pointer-events-auto border border-gray-100/50 overflow-hidden transform transition-all hover:shadow-2xl">
                    <div className="p-4 flex items-center border-b border-gray-100/50">
                        <button onClick={() => navigate(-1)} className="p-2 mr-4 bg-gray-100 rounded-full hover:bg-gray-200 hover:scale-105 text-gray-800 transition-all">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1">
                            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight leading-none">{bus.bus_name}</h2>
                            <p className="text-xs font-bold text-yellow-600 mt-1 uppercase tracking-wider">Live Tracking Active</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full text-xs font-bold shadow-inner border border-gray-50 ${bus.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {bus.status === 'active' ? 'Moving' : 'Idle'}
                        </div>
                    </div>
                    {/* Live Stats */}
                    <div className="bg-gray-50/80 px-6 py-4 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-800">
                            <Clock size={18} className={bus.delay_mins > 5 ? "text-red-500 drop-shadow-sm animate-pulse" : "text-yellow-500 drop-shadow-sm"} />
                            <div className="flex flex-col">
                                <span className="font-extrabold text-base leading-none">
                                    <span className={bus.delay_mins > 5 ? "text-red-600" : ""}>{bus.eta || 15}</span> <span className="text-xs text-gray-500 font-bold ml-0.5">MIN</span>
                                </span>
                                <span className={`text-[10px] uppercase font-bold tracking-wider hidden sm:block ${bus.delay_mins > 5 ? "text-red-500" : "text-gray-400"}`}>
                                    {bus.delay_mins > 5 ? `Delayed ${bus.delay_mins}m` : 'ETA'}
                                </span>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200 rounded-full"></div>
                        <div className="flex items-center gap-2 text-gray-800">
                            <Navigation size={18} className="text-blue-500 drop-shadow-sm" />
                            <div className="flex flex-col">
                                <span className="font-extrabold text-base leading-none">{bus.location?.speed || 0} <span className="text-xs text-gray-500 font-bold ml-0.5">KM/H</span></span>
                                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider hidden sm:block">Speed</span>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200 rounded-full"></div>
                        <div className="flex items-center gap-2 text-gray-800 max-w-[120px]">
                            <MapPin size={18} className="text-red-500 flex-shrink-0 drop-shadow-sm" />
                            <div className="flex flex-col overflow-hidden">
                                <span className="font-extrabold text-base leading-none truncate w-full">{bus.next_stop || 'Destination'}</span>
                                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider truncate hidden sm:block">Next Stop</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 w-full relative z-0 bg-yellow-50">
                <BusMap buses={[bus]} selectedBus={bus} stops={stops} />
            </div>
        </div>
    );
}
