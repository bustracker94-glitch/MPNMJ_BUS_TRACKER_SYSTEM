import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yoaexeyornhulqzhewgz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvYWV4ZXlvcm5odWxxemhld2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTgzMTUsImV4cCI6MjA4ODYzNDMxNX0.D9HiBUfZcby9X2rm33jrIRU14hiW3y-q03vOBJIM_SY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
});

export const BACKEND_URL = 'https://mpnmjbusesbackend.vercel.app';
