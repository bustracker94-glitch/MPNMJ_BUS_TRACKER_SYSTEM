// Ported from web etaCalculator.js — pure JS, no React dependencies
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Smooth Confidence Bracket UX
function getConfidenceBracket(etaMins, confidenceScore) {
    if (etaMins <= 1) return "1";
    if (etaMins <= 3) return `${etaMins}-${etaMins + 1}`; // e.g. 2-3

    // Higher uncertainty (lower confidence) means wider brackets
    // e.g., 80% confidence -> +/- 10%
    // e.g., 50% confidence -> +/- 25%
    const uncertaintyFactor = Math.max(0.05, 1.0 - confidenceScore);
    const spread = Math.max(1, Math.round(etaMins * uncertaintyFactor));

    const minEta = Math.max(1, etaMins - spread);
    const maxEta = etaMins + spread;

    if (minEta === maxEta) return `${minEta}`;
    return `${minEta}-${maxEta}`;
}

export function getBusETAAndStops(busLocation, routeStops, isReverse = false) {
    if (!busLocation || !routeStops || routeStops.length === 0) {
        return { current_stop: 'Unknown', next_stop: 'Unknown', eta: '--', eta_bracket: '--', upcoming_stops: [], all_stops: [], closest_index: 0 };
    }

    const { latitude, longitude, speed, confidence_score = 1.0 } = busLocation;
    let closestStop = null;
    let minDistance = Infinity;
    let closestIndex = -1;

    let sortedStops = [...routeStops].sort((a, b) => a.stop_order - b.stop_order);
    if (isReverse) {
        sortedStops = sortedStops.reverse();
    }

    sortedStops.forEach((rs, index) => {
        const stop = rs.stops;
        if (!stop) return;
        const dist = calculateDistanceKm(latitude, longitude, stop.latitude, stop.longitude);
        if (dist < minDistance) {
            minDistance = dist;
            closestStop = stop;
            closestIndex = index;
        }
    });

    if (!closestStop) {
        return { current_stop: 'Tracking...', next_stop: 'Unknown', eta: '--', eta_bracket: '--', upcoming_stops: [], all_stops: [], closest_index: 0 };
    }

    let nextStop = closestStop;
    let distanceToNext = minDistance;
    let currentStopName = closestStop.stop_name;

    if (minDistance < 0.2) {
        currentStopName = 'At ' + closestStop.stop_name;
        if (closestIndex + 1 < sortedStops.length) {
            nextStop = sortedStops[closestIndex + 1].stops;
            distanceToNext = calculateDistanceKm(latitude, longitude, nextStop.latitude, nextStop.longitude);
        } else {
            return { current_stop: currentStopName, next_stop: 'Destination Reached', eta: 0, eta_bracket: '0', upcoming_stops: [], all_stops: [], closest_index: closestIndex };
        }
    } else {
        currentStopName = 'Near ' + closestStop.stop_name;
    }

    const effectiveSpeed = (speed && speed > 5) ? speed : 25;
    const upcomingStops = [];
    let cumulativeDistance = 0;
    const remainingStops = sortedStops.slice(closestIndex);
    
    // Estimate total trip length for Context-Adaptive Tolerance calculation
    const isShortTrip = routeStops.length <= 8; 

    remainingStops.forEach((rs, idx) => {
        const stop = rs.stops;
        if (!stop) return;
        let dist = 0;
        if (idx === 0) {
            dist = minDistance;
        } else {
            const prevStop = remainingStops[idx - 1].stops;
            dist = calculateDistanceKm(prevStop.latitude, prevStop.longitude, stop.latitude, stop.longitude);
        }
        cumulativeDistance += dist;
        const etaMin = Math.max(1, Math.round((cumulativeDistance / effectiveSpeed) * 60));
        const bracket = getConfidenceBracket(etaMin, confidence_score);
        
        upcomingStops.push({ 
            stop_name: stop.stop_name, 
            eta_minutes: etaMin, 
            eta_bracket: bracket, 
            distance_km: cumulativeDistance.toFixed(2) 
        });
    });

    const allStops = sortedStops.map((rs, idx) => {
        const stop = rs.stops;
        const scheduledTimeStr = rs.scheduled_arrival_time; // format "HH:MM:SS"

        // Calculate Live Arrival Time (Current Time + ETA)
        const now = new Date();
        let expectedArrival = null;
        let delayStatus = 'On Time';
        let delayValue = 0;

        if (scheduledTimeStr) {
            const [h, m, s] = scheduledTimeStr.split(':').map(Number);
            const scheduledDate = new Date();
            scheduledDate.setHours(h, m, s || 0, 0);

            // Handle next day scheduling (e.g., late night routes)
            if (scheduledDate < now && (now.getTime() - scheduledDate.getTime()) > 12 * 3600000) {
                scheduledDate.setDate(scheduledDate.getDate() + 1);
            }

            // If we have an ETA for this stop (from upcomingStops)
            const upcoming = upcomingStops.find(u => u.stop_name === stop?.stop_name);
            if (upcoming) {
                expectedArrival = new Date(now.getTime() + upcoming.eta_minutes * 60000);

                // Diff in minutes
                delayValue = Math.round((expectedArrival.getTime() - scheduledDate.getTime()) / 60000);

                // Context-Adaptive Tolerance Bands
                const minorDelayThreshold = isShortTrip ? 3 : 5;
                const majorDelayThreshold = isShortTrip ? 7 : 10;

                if (delayValue >= majorDelayThreshold) delayStatus = 'Major Delay';
                else if (delayValue >= minorDelayThreshold) delayStatus = 'Minor Delay';
                else if (delayValue < -3) delayStatus = 'Early';
                else delayStatus = 'On Time';
            }
        }

        // Determine if this stop is passed based on bus location
        const isPassed = idx < closestIndex || (idx === closestIndex && minDistance < 0.2);
        const isCurrent = idx === closestIndex && minDistance < 0.2;
        const isNext = (minDistance >= 0.2 && idx === closestIndex) || (minDistance < 0.2 && idx === closestIndex + 1);

        return {
            stop_id: rs.stop_id,
            stop_name: stop?.stop_name,
            latitude: stop?.latitude,
            longitude: stop?.longitude,
            stop_order: rs.stop_order,
            is_passed: isPassed,
            is_current: isCurrent,
            is_next: isNext,
            scheduled_time: scheduledTimeStr,
            delay_mins: delayValue,
            status: delayStatus
        };
    });
    
    const primaryEtaMinutes = upcomingStops[0]?.eta_minutes || 0;

    return {
        current_stop: currentStopName,
        next_stop: nextStop.stop_name,
        eta: primaryEtaMinutes,
        eta_bracket: upcomingStops[0]?.eta_bracket || '--',
        upcoming_stops: upcomingStops,
        all_stops: allStops,
        closest_index: closestIndex,
    };
}

export function calcBearing(oldLat, oldLng, newLat, newLng) {
    const y = Math.sin((newLng - oldLng) * Math.PI / 180) * Math.cos(newLat * Math.PI / 180);
    const x = Math.cos(oldLat * Math.PI / 180) * Math.sin(newLat * Math.PI / 180) -
        Math.sin(oldLat * Math.PI / 180) * Math.cos(newLat * Math.PI / 180) *
        Math.cos((newLng - oldLng) * Math.PI / 180);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export function isLocationLive(updatedAt, thresholdMs = 30000) {
    if (!updatedAt) return false;
    return (Date.now() - new Date(updatedAt).getTime()) < thresholdMs;
}
