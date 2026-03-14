import { supabase } from '../supabaseClient.js';
import fetch from 'node-fetch';

const SENT_NOTIFICATIONS = {}; // Cache to prevent spamming notifications

export async function checkAndNotify(busId, delayMins, nextStopName) {
    // Only notify if delay is significant (> 10 mins)
    if (delayMins < 10) return;

    // prevent spam: only notify once every 15 minutes for the same bus/delay level
    const lastSent = SENT_NOTIFICATIONS[busId];
    if (lastSent && (Date.now() - lastSent < 15 * 60000)) return;

    console.log(`[NotificationEngine] Bus ${busId} is delayed by ${delayMins}m. Checking for subscribers...`);

    try {
        // 1. Fetch subscribers for this bus
        const { data: subscribers, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('bus_id', busId);

        if (error || !subscribers || subscribers.length === 0) return;

        const tokens = subscribers.map(s => s.expo_token).filter(Boolean);
        if (tokens.length === 0) return;

        // 2. Prepare message
        const message = {
            to: tokens,
            sound: 'default',
            title: '🚌 Bus Delay Alert',
            body: `Your bus is running ${delayMins} minutes late. New estimated pickup at ${nextStopName}.`,
            data: { busId, delayMins },
        };

        // 3. Send via Expo (Example)
        console.log(`[NotificationEngine] Sending alert to ${tokens.length} users...`);
        
        // In a real app, you'd use fetch('https://exp.host/--/api/v2/push/send', ...)
        // We will log it for now.
        
        SENT_NOTIFICATIONS[busId] = Date.now();

    } catch (err) {
        console.error('[NotificationEngine] Error:', err);
    }
}
