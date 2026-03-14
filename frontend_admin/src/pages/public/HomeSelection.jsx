import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import TrackerSearch from '../../components/tracker/TrackerSearch';
import { BusFront } from 'lucide-react';

export default function HomeSelection() {
    const navigate = useNavigate();
    const [stops, setStops] = useState([]);

    useEffect(() => {
        const fetchStops = async () => {
            const { data } = await supabase.from('stops').select('*').order('stop_name');
            if (data) setStops(data);
        };
        fetchStops();
    }, []);

    const handleSearch = (from, to) => {
        navigate(`/buses?from=${from}&to=${to}`);
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#F9FAFB] items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] animate-in fade-in duration-500">
            <div className="w-full max-w-md flex flex-col shadow-2xl z-20 bg-white rounded-[2rem] overflow-hidden ring-1 ring-gray-100 transform transition-all">
                <div className="px-8 py-10 primary-gradient text-white shadow-inner relative overflow-hidden">
                    {/* Decorative Background Circles */}
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10 blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-white opacity-10 blur-xl"></div>

                    <div className="flex items-center gap-4 mb-3 justify-center relative z-10">
                        <BusFront size={42} className="text-white drop-shadow-md" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white text-center drop-shadow-sm mb-1">
                        College Bus Tracker
                    </h1>
                    <p className="text-[#FFF3E0] text-center font-medium opacity-90 text-sm tracking-wide">
                        M.P.N.M.J Engineering College
                    </p>
                </div>

                <div className="p-8 space-y-6">
                    <p className="text-gray-500 text-sm text-center font-medium">Select your current stop and destination to find available buses.</p>
                    <TrackerSearch stops={stops} onSearch={handleSearch} />
                </div>
            </div>
            <div className="mt-8 text-gray-400 text-sm font-medium">
                Live Tracking • Fast Updates • Easy Access
            </div>
        </div>
    );
}
