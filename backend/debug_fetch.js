import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function check() {
    console.log('Using URL:', url);
    try {
        const res = await fetch(`${url}/rest/v1/drivers?select=*`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        const drivers = await res.json();
        console.log('\nDrivers in DB:');
        if (Array.isArray(drivers)) {
            drivers.forEach(d => {
                console.log(`- Phone: "${d.phone}", Password: "${d.password}", Name: "${d.driver_name}"`);
            });
        } else {
            console.log('Error/Response:', drivers);
        }

        const res2 = await fetch(`${url}/rest/v1/organizations?select=*`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        const orgs = await res2.json();
        console.log('\nOrganizations:');
        console.log(orgs);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

check();
