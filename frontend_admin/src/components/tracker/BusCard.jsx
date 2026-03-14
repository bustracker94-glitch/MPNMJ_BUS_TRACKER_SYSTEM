import { MapPin, Clock, Navigation } from 'lucide-react';

export default function BusCard({ bus, isSelected, onClick }) {
    // Dummy ETA calculation for visual placeholder
    const etaMinutes = bus.eta || 15;
    const speed = bus.location?.speed || 45;

    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-300 border-2 ${isSelected ? 'border-yellow-400 bg-yellow-50 shadow-md transform -translate-y-1' : 'border-transparent bg-white shadow-sm hover:shadow hover:bg-gray-50'}`}
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-bold text-lg text-gray-900 leading-tight">{bus.bus_name}</h3>
                    <p className="text-xs font-semibold text-yellow-600 uppercase tracking-widest mt-1">Route {bus.route_name}</p>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${bus.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {bus.status === 'active' ? 'Moving' : 'Idle'}
                </div>
            </div>

            <div className="space-y-2 mt-4">
                <div className="flex items-center text-sm text-gray-600">
                    <MapPin size={16} className="text-gray-400 mr-2" />
                    <span className="truncate">Current: <span className="font-medium text-gray-900">{bus.current_stop || 'Fetching location...'}</span></span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                    <Navigation size={16} className="text-gray-400 mr-2" />
                    <span className="truncate">Next: <span className="font-medium text-gray-900">{bus.next_stop || 'Unknown'}</span></span>
                </div>
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-center text-gray-700">
                    <Clock size={16} className="text-yellow-500 mr-1.5" />
                    <span className="font-bold">{etaMinutes} min</span>
                    <span className="text-xs text-gray-400 ml-1 italic">{bus.delay_mins > 5 ? `Delayed ${bus.delay_mins}m` : bus.delay_mins < 0 ? 'Early' : 'On Time'}</span>
                </div>
                <div className="flex items-center gap-2">
                    {bus.delay_mins > 5 && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">DELAYED</span>
                    )}
                    <div className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
                        {speed} km/h
                    </div>
                </div>
            </div>
            {/* 
      {isSelected && (
        <button className="w-full mt-4 bg-gray-900 text-white py-2 rounded-xl text-sm font-bold shadow-md active:bg-gray-800 transition-colors">
          Track Live Focus
        </button>
      )} */}
        </div>
    );
}
