import { useState } from 'react';

export default function TrackerSearch({ stops, onSearch }) {
    const [fromStop, setFromStop] = useState('');
    const [toStop, setToStop] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        onSearch(fromStop, toStop);
    };

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mt-2">
            <form onSubmit={handleSearch} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-1">From Stop</label>
                    <select
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-3 font-medium transition-colors"
                        value={fromStop}
                        onChange={(e) => setFromStop(e.target.value)}
                    >
                        <option value="">Select current location</option>
                        {stops.map(stop => (
                            <option key={stop.stop_id} value={stop.stop_id}>{stop.stop_name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-1">To Stop</label>
                    <select
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-yellow-500 focus:border-yellow-500 block p-3 font-medium transition-colors"
                        value={toStop}
                        onChange={(e) => setToStop(e.target.value)}
                    >
                        <option value="">Select destination</option>
                        {stops.map(stop => (
                            <option key={stop.stop_id} value={stop.stop_id}>{stop.stop_name}</option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    className="w-full text-white primary-gradient hover:opacity-90 font-bold rounded-xl text-md px-5 py-3.5 text-center transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 mt-4"
                >
                    Find Available Buses
                </button>
            </form>
        </div>
    );
}
