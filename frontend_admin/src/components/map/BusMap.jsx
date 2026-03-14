import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MotionEngine } from '../../lib/MotionEngine';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Inject pulse keyframe once
if (typeof document !== 'undefined' && !document.getElementById('bus-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'bus-pulse-style';
    style.textContent = `
        @keyframes busPulse {
            0%   { transform: scale(1);   opacity: 0.6; }
            70%  { transform: scale(2.8); opacity: 0; }
            100% { transform: scale(1);   opacity: 0; }
        }
        .bus-pulse-ring { animation: busPulse 1.8s ease-out infinite; }
    `;
    document.head.appendChild(style);
}

const getBusIcon = (rotation = 0) => L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:44px;height:44px;">
        <div class="bus-pulse-ring" style="position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;background:rgba(245,158,11,0.35);border-radius:50%;"></div>
        <div style="position:absolute;top:50%;left:50%;width:36px;height:36px;margin:-18px 0 0 -18px;background:rgba(245,158,11,0.12);border-radius:50%;"></div>
        <div style="position:absolute;top:50%;left:50%;width:20px;height:20px;margin:-10px 0 0 -10px;background:#fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.25);"></div>
        <div style="position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;background:#F59E0B;border-radius:50%;"></div>
        <div style="position:absolute;top:50%;left:50%;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #F59E0B;transform-origin:center 13px;transform:rotate(${rotation}deg) translate(-5px,-18px);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26],
});

const stopIcon = L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:#64748B;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
});

function StaticRoutePolyline({ routePolyline }) {
    if (!routePolyline?.coordinates) return null;
    const positions = routePolyline.coordinates.map(c => [c[1], c[0]]);
    return <Polyline positions={positions} pathOptions={{ color: '#F59E0B', weight: 5, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }} />;
}

function BusMarkersLayer({ buses }) {
    const map = useMap();
    const markerRefs = useRef({});
    const engineRefs = useRef({});
    const animFrameRef = useRef(null);
    const lastTickRef = useRef(performance.now());

    // 1. Consume Socket Events and feed into Motion Engine
    useEffect(() => {
        if (!buses || !buses.length) return;

        buses.forEach(bus => {
            const loc = bus.location;
            if (!loc?.latitude || !loc?.longitude) return;

            const key = String(bus.bus_id || bus.id);
            if (!key || key === 'undefined') return;

            const newLat = parseFloat(loc.latitude);
            const newLng = parseFloat(loc.longitude);
            if (isNaN(newLat) || isNaN(newLng)) return;

            const label = bus.bus_name || bus.bus_number || `Bus ${key}`;
            const routeName = bus.route_name || '—';

            // Create Engine + Marker if missing
            if (!markerRefs.current[key] || !engineRefs.current[key]) {
                const engine = new MotionEngine();
                if (bus.route_polyline?.coordinates) {
                    engine.setRouteGeometry(bus.route_polyline.coordinates.map(c => ({ lat: c[1], lng: c[0] })));
                }
                engineRefs.current[key] = engine;

                const marker = L.marker([newLat, newLng], { icon: getBusIcon(loc.heading || 0) });
                const popupEl = document.createElement('div');
                popupEl.innerHTML = `
                    <div style="font-weight:800;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:6px">${label}</div>
                    <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Route</div>
                    <div style="font-size:12px;font-weight:700;color:#1e293b;margin-top:2px">${routeName}</div>
                `;
                marker.bindPopup(popupEl);
                marker.addTo(map);
                markerRefs.current[key] = marker;
            }

            // Push GPS data into Engine
            engineRefs.current[key].pushGPSUpdate({
                lat: newLat,
                lng: newLng,
                speed: parseFloat(loc.speed) || 0,
                heading: parseFloat(loc.heading) || loc.bearing || 0,
                confidence_score: bus.confidence_score || 1.0
            });
        });

        // Cleanup dead buses
        const liveKeys = new Set(buses.map(b => String(b.bus_id || b.id)));
        Object.keys(markerRefs.current).forEach(key => {
            if (!liveKeys.has(key)) {
                markerRefs.current[key].remove();
                delete markerRefs.current[key];
                delete engineRefs.current[key];
            }
        });
    }, [buses, map]);

    // 2. Continuous 60fps Native Loop
    useEffect(() => {
        const tick = (now) => {
            const deltaMs = Math.min(now - lastTickRef.current, 100); // Cap extreme delays
            lastTickRef.current = now;

            // Tick all engines and update markers natively
            Object.keys(engineRefs.current).forEach(key => {
                const engine = engineRefs.current[key];
                const marker = markerRefs.current[key];
                if (!engine || !marker) return;

                const renderState = engine.tick(deltaMs);
                if (renderState && renderState.lat !== null) {
                    marker.setLatLng([renderState.lat, renderState.lng]);
                    marker.setIcon(getBusIcon(renderState.heading));
                }
            });

            animFrameRef.current = requestAnimationFrame(tick);
        };

        lastTickRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            Object.values(markerRefs.current).forEach(m => m.remove());
        };
    }, []);

    return null;
}

function MapFocus({ selectedBus }) {
    const map = useMap();
    const prevLatRef = useRef(null);
    const prevLngRef = useRef(null);
    useEffect(() => {
        if (!selectedBus?.location) return;
        const { latitude, longitude } = selectedBus.location;
        if (!latitude || !longitude) return;
        if (prevLatRef.current === latitude && prevLngRef.current === longitude) return;
        prevLatRef.current = latitude;
        prevLngRef.current = longitude;
        map.panTo([latitude, longitude], { animate: true, duration: 0.8, easeLinearity: 0.5 });
    }, [selectedBus?.location?.latitude, selectedBus?.location?.longitude, map]);
    return null;
}

function StopMarkersLayer({ stops }) {
    const map = useMap();
    const mountedRef = useRef(false);
    useEffect(() => {
        if (mountedRef.current || !stops?.length) return;
        mountedRef.current = true;
        stops.forEach(stop => {
            if (!stop.latitude || !stop.longitude) return;
            const marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon });
            marker.bindPopup(`<div style="font-weight:700;font-size:12px">${stop.stop_name}</div>`);
            marker.addTo(map);
        });
    }, [stops, map]);
    return null;
}

export default function BusMap({ buses, selectedBus, stops }) {
    const defaultCenter = [11.2721, 77.5855];
    return (
        <div className="h-full w-full relative z-0">
            <MapContainer center={defaultCenter} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} preferCanvas={true}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />
                <StopMarkersLayer stops={stops} />
                <BusMarkersLayer buses={buses} />
                <StaticRoutePolyline routePolyline={selectedBus?.route_polyline} />
                <MapFocus selectedBus={selectedBus} />
            </MapContainer>
        </div>
    );
}
