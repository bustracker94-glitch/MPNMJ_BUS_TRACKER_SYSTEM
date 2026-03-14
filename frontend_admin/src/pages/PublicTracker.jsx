import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import BusMap from '../components/map/BusMap';
import TrackerSearch from '../components/tracker/TrackerSearch';
import BusCard from '../components/tracker/BusCard';
import ChatbotButton from '../components/chatbot/ChatbotButton';
import { BusFront, Search } from 'lucide-react';

export default function PublicTracker() {
    const [buses, setBuses] = useState([]);
    const [stops, setStops] = useState([]);
    const [selectedBus, setSelectedBus] = useState(null);
    const [filteredBuses, setFilteredBuses] = useState([]);

    useEffect(() => {
        fetchStops();
        fetchActiveBuses();

        // Subscribe to realtime location updates
        const channel = supabase.channel('bus_locations_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations' }, (payload) => {
                // Update live location
                setBuses(currentBuses =>
                    currentBuses.map(bus =>
                        bus.id === payload.new.bus_id
                            ? { ...bus, location: payload.new }
                            : bus
                    )
                );
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchStops = async () => {
        const { data } = await supabase.from('stops').select('*').order('stop_name');
        if (data) setStops(data);
    };

    const fetchActiveBuses = async () => {
        // We would join buses with routes, latest locations, and route stops.
        // Simplifying for now with mock shape until DB is populated
        setBuses([]);
    };

    const handleSearch = (from, to) => {
        // Logic to filter buses based on route stops matching 'from' and 'to'
        if (!from || !to) return setFilteredBuses(buses);
        // basic filtering placeholder
        setFilteredBuses(buses);
    };

    return (
        <div className="flex flex-col h-screen md:flex-row bg-[#F9FAFB]">
            {/* Sidebar for Search & Bus List */}
            <div className="w-full md:w-96 flex flex-col shadow-xl z-20 bg-white border-r">
                <div className="p-6 primary-gradient text-white rounded-br-3xl shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                        <BusFront size={28} className="text-white" />
                        <h1 className="text-2xl font-bold tracking-tight text-white">College Bus Tracker</h1>
                    </div>
                    <p className="text-[#FFF3E0] text-sm font-medium">M.P.N.M.J Engineering College</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <TrackerSearch stops={stops} onSearch={handleSearch} />

                    <div className="mt-4 space-y-3">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Available Buses</h2>
                        {filteredBuses.length > 0 ? (
                            filteredBuses.map(bus => (
                                <BusCard
                                    key={bus.id}
                                    bus={bus}
                                    isSelected={selectedBus?.id === bus.id}
                                    onClick={() => setSelectedBus(bus)}
                                />
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                                <div className="p-4 bg-yellow-50 rounded-full">
                                    <Search size={24} className="text-yellow-600" />
                                </div>
                                <p className="text-gray-500 mx-4">Select 'From' and 'To' stops to find your bus route.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Map View */}
            <div className="flex-1 relative h-[50vh] md:h-screen">
                <BusMap buses={filteredBuses} selectedBus={selectedBus} stops={stops} />
                <ChatbotButton />
            </div>
        </div>
    );
}
