const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function check() {
  const { data, error } = await supabase.from('gerechten').select('id,naam,ingredients_list,preparation_steps,allergenen').order('id', { ascending: false }).limit(3);
  console.log(JSON.stringify(data, null, 2));
}
check();
