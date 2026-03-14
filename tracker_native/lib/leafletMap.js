export function getLeafletMapHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body, #map { width:100%; height:100%; background:#fff; }
        
        .bus-marker-container {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .bus-marker { 
            width:36px; height:36px; background:#F59E0B; border-radius:50%; 
            border:2px solid #fff; display:flex; align-items:center; justify-content:center; 
            font-size:18px; box-shadow:0 2px 8px rgba(0,0,0,0.3);
            transition: transform 0.15s linear;
            z-index: 10;
        }

        .bus-marker.selected {
            background: #D97706;
            width: 42px; height: 42px;
            font-size: 22px;
            border-width: 3px;
            box-shadow: 0 0 15px rgba(245,158,11,0.6);
            z-index: 1000;
        }

        .bus-marker.off-route {
            background: #EF4444;
        }

        .uncertainty-halo {
            position: absolute;
            border-radius: 50%;
            background: rgba(59, 130, 246, 0.1);
            border: 1px dashed rgba(59, 130, 246, 0.4);
            pointer-events: none;
            display: none;
        }

        .pulse {
            position: absolute;
            width: 36px; height: 36px;
            border-radius: 50%;
            background: rgba(245, 158, 11, 0.3);
            animation: pulse-animation 2s infinite;
            z-index: -1;
        }

        @keyframes pulse-animation {
            0% { transform: scale(0.9); opacity: 0.8; }
            70% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(0.9); opacity: 0; }
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        (function() {
            var map, routePoly, stopLayer;
            var buses = {}; 

            // High-Fidelity Motion Engine Logic (Embedded)
            class MotionEngine {
                constructor() {
                    this.state = { lat: null, lng: null, heading: 0, speedKmh: 0, confidence: 1.0 };
                    this.target = { lat: null, lng: null, time: 0, speedKmh: 0, heading: 0 };
                    this.lastPacket = 0;
                    this.status = 'INIT';
                }

                update(d) {
                    const now = Date.now();
                    const speed = d.speed || 0;
                    const heading = d.heading || 0;
                    const conf = d.confidence || 1.0;

                    if (this.state.lat === null) {
                        this.state = { lat: d.lat, lng: d.lng, heading, speedKmh: speed, confidence: conf };
                        this.target = { ...this.state, time: now };
                        this.lastPacket = now;
                        return;
                    }

                    const horizon = 3500 * (1 + (speed / 100));
                    if (speed < 3) {
                        this.status = 'DWELLING';
                        this.target = { lat: d.lat, lng: d.lng, time: now + 2000, speedKmh: 0, heading: this.state.heading };
                    } else {
                        this.status = 'MOVING';
                        // Predictive Projection
                        const dist = (speed / 3.6) * (horizon / 1000);
                        const brng = heading * Math.PI / 180;
                        const R = 6371000;
                        const dR = dist / R;
                        const pLat = this.state.lat * Math.PI / 180;
                        const pLng = this.state.lng * Math.PI / 180;
                        const fLat = Math.asin(Math.sin(pLat)*Math.cos(dR) + Math.cos(pLat)*Math.sin(dR)*Math.cos(brng));
                        const fLng = pLng + Math.atan2(Math.sin(brng)*Math.sin(dR)*Math.cos(pLat), Math.cos(dR)-Math.sin(pLat)*Math.sin(fLat));
                        
                        this.target = { lat: fLat * 180 / Math.PI, lng: fLng * 180 / Math.PI, time: now + horizon, speedKmh: speed, heading };
                    }

                    // Snap threshold
                    const dx = (this.state.lat - d.lat) * 111320;
                    const dy = (this.state.lng - d.lng) * 111320 * Math.cos(d.lat * Math.PI / 180);
                    if (Math.sqrt(dx*dx + dy*dy) > 100 / conf) {
                        this.state.lat = d.lat; this.state.lng = d.lng;
                    }

                    this.state.confidence = conf;
                    this.lastPacket = now;
                }

                tick(deltaMs) {
                    if (this.state.lat === null) return null;
                    const now = Date.now();

                    if (this.status === 'DWELLING') {
                        this.state.lat += (this.target.lat - this.state.lat) * 0.06;
                        this.state.lng += (this.target.lng - this.state.lng) * 0.06;
                    } else {
                        if (now > this.target.time) {
                            // Coasting
                            const elapsed = (now - this.lastPacket) / 1000;
                            if (elapsed < 6) {
                                const speedMs = (this.target.speedKmh / 3.6) * Math.pow(0.98, elapsed);
                                const dist = speedMs * (deltaMs / 1000);
                                const brng = this.state.heading * Math.PI / 180;
                                const R = 6371000;
                                const dR = dist / R;
                                const pLat = this.state.lat * Math.PI / 180;
                                const pLng = this.state.lng * Math.PI / 180;
                                const fLat = Math.asin(Math.sin(pLat)*Math.cos(dR) + Math.cos(pLat)*Math.sin(dR)*Math.cos(brng));
                                const fLng = pLng + Math.atan2(Math.sin(brng)*Math.sin(dR)*Math.cos(pLat), Math.cos(dR)-Math.sin(pLat)*Math.sin(fLat));
                                this.state.lat = fLat * 180 / Math.PI;
                                this.state.lng = fLng * 180 / Math.PI;
                            }
                        } else {
                            // Kinematic Interpolation
                            const remain = Math.max(16, this.target.time - now);
                            const t = Math.min(0.2, deltaMs / remain);
                            const weight = t * (this.state.confidence || 1.0);
                            this.state.lat += (this.target.lat - this.state.lat) * weight * 1.1;
                            this.state.lng += (this.target.lng - this.state.lng) * weight * 1.1;
                        }
                    }

                    let diff = this.target.heading - this.state.heading;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;
                    this.state.heading += diff * 0.1;
                    return this.state;
                }
            }

            function initMap() {
                map = L.map('map', { 
                    zoomControl: false, 
                    attributionControl: false,
                    zoomAnimation: true
                }).setView([11.2721, 77.5855], 14);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
                    maxZoom: 19
                }).addTo(map);
                
                stopLayer = L.layerGroup().addTo(map);
                let lastTick = Date.now();
                
                function frame() {
                    const now = Date.now();
                    const dt = now - lastTick;
                    lastTick = now;

                    Object.keys(buses).forEach(id => {
                        const b = buses[id];
                        b.engine.tick(dt);
                        updateVisuals(id);
                    });
                    requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            }

            function updateVisuals(id) {
                const b = buses[id];
                const state = b.engine.state;
                if (!state || state.lat === null) return;

                if (!b.marker) {
                    const icon = L.divIcon({ 
                        className: 'bus-marker-container', 
                        html: '<div class="uncertainty-halo"></div><div class="pulse"></div><div class="bus-marker" id="marker-'+id+'">🚌</div>', 
                        iconSize: [60, 60], iconAnchor: [30, 30] 
                    });
                    b.marker = L.marker([state.lat, state.lng], { icon: icon }).addTo(map);
                    b.marker.on('click', () => {
                        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'marker_press', busId: id }));
                    });
                }
                
                b.marker.setLatLng([state.lat, state.lng]);

                // Intelligent continuous pan to selected bus
                if (b.selected && !map.isDragging) {
                    map.panTo([state.lat, state.lng], { animate: true, duration: 0.1 });
                }
                const el = b.marker.getElement();
                if (el) {
                    const iconEl = el.querySelector('.bus-marker');
                    const pulseEl = el.querySelector('.pulse');
                    const haloEl = el.querySelector('.uncertainty-halo');
                    
                    if (iconEl) {
                        iconEl.style.transform = 'rotate(' + (state.heading || 0) + 'deg)';
                        b.selected ? iconEl.classList.add('selected') : iconEl.classList.remove('selected');
                        b.lifecycle === 'OFF_ROUTE' ? iconEl.classList.add('off-route') : iconEl.classList.remove('off-route');
                    }
                    
                    if (pulseEl) {
                        pulseEl.style.display = (b.lifecycle === 'ONLINE' || b.lifecycle === 'OFF_ROUTE') ? 'block' : 'none';
                    }

                    if (haloEl) {
                        const conf = b.confidence || 1.0;
                        if (conf < 0.7) {
                            const size = 30 + (1 - conf) * 120;
                            haloEl.style.width = size + 'px';
                            haloEl.style.height = size + 'px';
                            haloEl.style.display = 'block';
                            haloEl.style.top = (30 - size/2) + 'px';
                            haloEl.style.left = (30 - size/2) + 'px';
                        } else {
                            haloEl.style.display = 'none';
                        }
                    }
                }
            }

            window.onMsg = function(raw) {
                try {
                    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    
                    if (d.type === 'init') {
                        map.setView([d.lat, d.lng], d.zoom || 15);
                    }
                    
                    if (d.type === 'bus_update') {
                        const id = String(d.bus_id || 'default');
                        if (!buses[id]) {
                            buses[id] = {
                                engine: new MotionEngine(),
                                selected: false,
                                lifecycle: d.lifecycle || 'ONLINE',
                                confidence: d.confidence || 1.0
                            };
                        }
                        buses[id].engine.update(d);
                        buses[id].lifecycle = d.lifecycle || 'ONLINE';
                    }
                    
                    if (d.type === 'select_bus') {
                        Object.keys(buses).forEach(id => {
                            buses[id].selected = (id === String(d.busId));
                            if (buses[id].marker) buses[id].marker.setZIndexOffset(buses[id].selected ? 1000 : 0);
                        });
                        
                        // Map interaction state listener to prevent fighting dragging
                        if (!map.interactionBound) {
                            map.on('dragstart', () => map.isDragging = true);
                            map.on('zoomstart', () => map.isDragging = true);
                            map.on('dragend', () => setTimeout(() => map.isDragging = false, 3000));
                            map.on('zoomend', () => setTimeout(() => map.isDragging = false, 3000));
                            map.interactionBound = true;
                        }

                        if (d.focus && buses[d.busId] && buses[d.busId].engine.state.lat) {
                            map.isDragging = false; // Reset drag lock
                            map.flyTo([buses[d.busId].engine.state.lat, buses[d.busId].engine.state.lng], 16, { animate: true, duration: 1.5 });
                        }
                    }

                    if (d.type === 'route_update') {
                        if (routePoly) map.removeLayer(routePoly);
                        if (d.polyline && d.polyline.length > 0) {
                            routePoly = L.polyline(d.polyline, { color: '#2563eb', weight: 4, opacity: 0.8 }).addTo(map);
                            if (d.fit) map.fitBounds(routePoly.getBounds(), { padding: [40, 40] });
                        }
                    }

                    if (d.type === 'stops_update') {
                        stopLayer.clearLayers();
                        d.stops.forEach(s => {
                            if (!s.lat || !s.lng) return;
                            const icon = L.divIcon({
                                className: '',
                                html: '<div style="width:10px;height:10px;background:'+(s.isPassed?'#94a3b8':'#2563eb')+';border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>',
                                iconSize: [10, 10], iconAnchor: [5, 5]
                            });
                            L.marker([s.lat, s.lng], { icon: icon }).addTo(stopLayer);
                        });
                    }
                } catch(e) { console.error('Map Error:', e); }
            };

            initMap();
            window.addEventListener('message', e => onMsg(e.data));
            document.addEventListener('message', e => onMsg(e.data));
        })();
    <\/script>
</body>
</html>`;
}
