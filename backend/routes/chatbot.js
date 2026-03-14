import express from 'express';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { supabase } from '../supabaseClient.js';

dotenv.config();

const router = express.Router();

let groq = null;
try {
    if (process.env.GROQ_API_KEY) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
} catch (err) {
    console.error("Groq initialization error:", err.message);
}

// System prompt defining the AI's boundaries and language capabilities.
const SYSTEM_PROMPT = `
You are the official AI Bus Assistant for M.P.N.M.J Engineering College Bus Tracking System. 
Your sole purpose is to help students and staff with inquiries related strictly to our college buses, routes, timings, drivers, and the MPNMJ tracking application.

LANGUAGE CAPABILITIES (TAMIL & TANGLISH):
1. You are fully capable of understanding and speaking English, pure Tamil (தமிழ்), and Tanglish (Tamil written in English script).
2. MATCH THE USER'S LANGUAGE: If the user types in Tanglish (e.g., "Bus eppa varum?"), you MUST reply in natural, polite Tanglish. If they type in Tamil script, reply in Tamil script. If English, reply in English.
3. Examples of Tanglish interactions:
   - User: "Erode bus eppa kelambum?" -> Bot: "Erode bus innumnu 10 minutes la kelambum. App la live tracking check pannikonga."
   - User: "Ammapettai bus enga irukku bro?" -> Bot: "Ammapettai bus ippo Unjapalayam kitta vandhutirukku. Seekiram reach aagidum."
   - User: "Driver number kedaikuma?" -> Bot: "Kandippa, admin panel la assign aagiruka driver details app la kaatum."

CRITICAL RULES:
1. ONLY answer questions related to MPNMJ buses, stops, routes, timings, or the tracking system.
2. If a user asks a question unrelated to the college or buses (weather, coding, movies), politely refuse IN THE REQUESTED LANGUAGE. 
   - Example (Tanglish refusal): "Sorry nga, naan MPNMJ College bus details solla mattum thaan irukken. Vera ethavathu bus pathi kekkanuma?"
3. Keep your answers concise, respectful, and highly helpful.
4. EXACT REPLIES: You MUST use the "CRITICAL REALTIME DATABASE" provided below to give exact answers! If a user asks for a driver number, give it directly from the live context. If they ask what routes are running, list the EXACT routes assigned. Never guess or hallucinate details.
`;

router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        if (!groq || !process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server. Please add it to your .env file." });
        }

        // Fetch Live Database Info: Assignments link Bus, Driver, and Route together!
        const { data: assignments } = await supabase
            .from('assignments')
            .select('bus_id, buses(bus_number, status), drivers(driver_name, phone), routes(route_name)');

        const { data: locations } = await supabase
            .from('bus_locations')
            .select('bus_id, speed, updated_at')
            .order('updated_at', { ascending: false });

        let realtimeData = "\n\n--- CRITICAL REALTIME DATABASE BEGIN (Use this to answer queries) ---\n";
        if (assignments && assignments.length > 0) {
            assignments.forEach(a => {
                const loc = locations?.find(l => l.bus_id === a.bus_id);
                const locString = loc ? `| Moving at ${loc.speed || 0} km/h (Last Ping: ${new Date(loc.updated_at).toLocaleTimeString()})` : "| No live GPS ping available";
                realtimeData += `- Bus: ${a.buses?.bus_number || 'Unknown'} | Route: ${a.routes?.route_name || 'Unassigned'} | Driver: ${a.drivers?.driver_name || 'Unknown'} (Ph: ${a.drivers?.phone || 'N/A'}) | Status: ${a.buses?.status || 'Unknown'} ${locString}\n`;
            });
        } else {
            realtimeData += "No buses are currently configured or assigned in the database.\n";
        }
        realtimeData += "--- CRITICAL REALTIME DATABASE END ---\n";

        // Reconstruct messages array for the Groq API
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT + realtimeData }
        ];

        if (history && Array.isArray(history)) {
            history.forEach(msg => {
                messages.push({
                    role: msg.isBot ? 'assistant' : 'user',
                    content: msg.text
                });
            });
        }

        messages.push({ role: 'user', content: message });

        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.1-8b-instant", // Updated to active model
            temperature: 0.2, // Low temperature for more focused/less hallucinating responses
            max_tokens: 256,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Sorry, I'm having trouble processing that right now.";

        res.json({ reply });
    } catch (error) {
        console.error("Chatbot Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
