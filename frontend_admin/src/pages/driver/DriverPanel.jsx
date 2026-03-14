import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Power, MapPin, Bus, Route, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function DriverPanel() {
    const [driver, setDriver] = useState(null);
    const [bus, setBus] = useState(null);
    const [isTripActive, setIsTripActive] = useState(false);
    const [isLocationEnabled, setIsLocationEnabled] = useState(false);
    const watchIdRef = useRef(null);
    const lastUpdateRef = useRef(0);

    useEffect(() => {
        const d = JSON.parse(localStorage.getItem('driver'));
        if (d) {
            setDriver(d);
            fetchBusDetails(d.driver_id);
        }

        // Cleanup geolocation on unmount
        return () => {
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    const fetchBusDetails = async (driverId) => {
        if (!driverId) return;
        const { data } = await supabase.from('buses').select('*, routes(*)').eq('assigned_driver', driverId).single();
        if (data) {
            setBus(data);
            setIsTripActive(data.status === 'active');
        }
    };

    const handleStartTrip = async () => {
        await supabase.from('buses').update({ status: 'active' }).eq('bus_id', bus.bus_id);
        setIsTripActive(true);
        startTracking();
    };

    const handleStopTrip = async () => {
        await supabase.from('buses').update({ status: 'inactive' }).eq('bus_id', bus.bus_id);
        setIsTripActive(false);
        stopTracking();
    };

    const startTracking = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setIsLocationEnabled(true);
                sendLocation(position);
            },
            (error) => {
                alert('Please enable location services to start the trip.');
                setIsLocationEnabled(false);
            },
            { enableHighAccuracy: true }
        );

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const now = Date.now();
                // Send updates every 5 seconds
                if (now - lastUpdateRef.current >= 5000) {
                    sendLocation(position);
                    lastUpdateRef.current = now;
                }
            },
            (error) => {
                console.error('Watch position error:', error);
            },
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    };

    const stopTracking = () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        setIsLocationEnabled(false);
    };

    const sendLocation = async (position) => {
        if (!bus) return;
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
            await axios.post(`${backendUrl}/api/update-location`, {
                bus_id: bus.bus_id,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                speed: position.coords.speed ? (position.coords.speed * 3.6).toFixed(1) : 0, // m/s to km/h
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to send location update', error);
        }
    };

    if (!driver) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-yellow-500 w-10 h-10" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-4 md:p-8">
            {/* Header */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl mb-6 relative overflow-hidden border border-gray-100 flex justify-between items-center">
                <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">Driver Dashboard</h1>
                    <p className="text-gray-500 font-medium text-sm mt-1">Welcome back, {driver.driver_name}</p>
                </div>
                <div className={`px-4 py-2 rounded-full font-bold shadow-sm border ${isTripActive ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {isTripActive ? 'Trip Active' : 'Trip Stopped'}
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Info Card */}
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-gray-100 relative">
                    <div className="flex gap-4 mb-6 pb-6 border-b border-gray-100">
                        <div className="bg-yellow-100 p-4 rounded-full flex items-center justify-center">
                            <Bus className="text-yellow-600 w-8 h-8" />
                        </div>
                        <div className="py-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Assigned Bus</p>
                            <h2 className="text-xl font-bold text-gray-900">{bus?.bus_name || 'Not assigned'}</h2>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-blue-50 p-4 rounded-full flex items-center justify-center">
                            <Route className="text-blue-500 w-8 h-8" />
                        </div>
                        <div className="py-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Assigned Route</p>
                            <h2 className="text-xl font-bold text-gray-900">{bus?.routes?.route_name || 'N/A'}</h2>
                        </div>
                    </div>
                </div>

                {/* Action Card */}
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col justify-center space-y-6">
                    <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className={`w-3 h-3 rounded-full ${isLocationEnabled ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}></div>
                        <p className="font-semibold text-gray-700">GPS Status: {isLocationEnabled ? 'Tracking Enabled' : 'Tracking Disabled'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            disabled={isTripActive}
                            onClick={handleStartTrip}
                            className={`w-full py-4 rounded-2xl font-bold text-white shadow-md transition-all flex items-center justify-center gap-2 
                ${isTripActive ? 'bg-gray-300 cursor-not-allowed opacity-70' : 'bg-green-500 hover:bg-green-600 active:scale-95'}`}
                        >
                            <Power size={20} />
                            Start Trip
                        </button>
                        <button
                            disabled={!isTripActive}
                            onClick={handleStopTrip}
                            className={`w-full py-4 rounded-2xl font-bold text-white shadow-md transition-all flex items-center justify-center gap-2 
                ${!isTripActive ? 'bg-gray-300 cursor-not-allowed opacity-70' : 'bg-red-500 hover:bg-red-600 active:scale-95'}`}
                        >
                            <MapPin size={20} />
                            Stop Trip
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
