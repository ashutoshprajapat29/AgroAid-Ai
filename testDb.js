import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const funcEnvFile = fs.readFileSync('functions/.env', 'utf-8');

const supabaseUrl = envFile.match(/VITE_SUPABASE_URL="(.*?)"/)[1];
const supabaseKey = funcEnvFile.match(/SUPABASE_SERVICE_ROLE_KEY="(.*?)"/)[1];

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('mandi_prices')
    .select('*')
    .eq('district', 'Ratlam')
    .ilike('commodity', 'Wheat')
    .order('arrival_date', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error(error);
  } else {
    console.log("DB Ratlam Wheat records:", data.map(d => ({ date: d.arrival_date, market: d.market_name, price: d.modal_price })));
  }
}
test();
