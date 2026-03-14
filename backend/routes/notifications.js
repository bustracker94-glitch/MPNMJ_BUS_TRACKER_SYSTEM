import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

// Subscribe to delay alerts for a bus
router.post('/subscribe', async (req, res) => {
    const { user_id, bus_id, stop_id, expo_token } = req.body;

    if (!user_id || !bus_id || !expo_token) {
        return res.status(400).json({ error: 'user_id, bus_id, and expo_token are required' });
    }

    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .upsert({
                user_id,
                bus_id,
                stop_id: stop_id || null,
                expo_token
            }, { onConflict: 'user_id,bus_id,stop_id' })
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, subscription: data });
    } catch (err) {
        console.error('[Subscribe] Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Unsubscribe from alerts
router.delete('/unsubscribe', async (req, res) => {
    const { user_id, bus_id } = req.body;

    if (!user_id || !bus_id) {
        return res.status(400).json({ error: 'user_id and bus_id are required' });
    }

    try {
        const { error } = await supabase
            .from('subscriptions')
            .delete()
            .eq('user_id', user_id)
            .eq('bus_id', bus_id);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (err) {
        console.error('[Unsubscribe] Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check subscription status
router.get('/status', async (req, res) => {
    const { user_id, bus_id } = req.query;

    if (!user_id || !bus_id) {
        return res.status(400).json({ error: 'user_id and bus_id are required' });
    }

    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user_id)
            .eq('bus_id', bus_id)
            .maybeSingle();

        res.json({ subscribed: !!data, subscription: data });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
