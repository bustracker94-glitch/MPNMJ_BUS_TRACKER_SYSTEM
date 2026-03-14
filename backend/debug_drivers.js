import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDrivers() {
    const { data, error } = await supabase.from('drivers').select('*');
    if (error) {
        console.error('Error fetching drivers:', error);
        return;
    }
    console.log('Drivers in database:');
    data.forEach(d => {
        console.log(`- Name: ${d.driver_name}, Phone: ${d.phone}, Password: ${d.password}`);
    });

    const { data: orgs } = await supabase.from('organizations').select('*');
    console.log('\nOrganizations:');
    orgs.forEach(o => {
        console.log(`- Name: ${o.name}, Tenant ID: ${o.tenant_id}`);
    });
}

checkDrivers();
