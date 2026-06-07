const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const funcEnvFile = fs.readFileSync('functions/.env', 'utf-8');

const supabaseUrl = envFile.match(/VITE_SUPABASE_URL="(.*?)"/)[1];
const supabaseKey = funcEnvFile.match(/SUPABASE_SERVICE_ROLE_KEY="(.*?)"/)[1];

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('mandi_prices')
    .select('arrival_date')
    .order('arrival_date', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}
test();
