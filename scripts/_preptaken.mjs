import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('./.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const ORG = '3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879';
const { data } = await sb.from('prep_tasks')
  .select('id,text,status,scheduled_at,created_at,event_id,bron:recipe_step_id')
  .eq('organization_id', ORG).neq('status','done').order('created_at');
console.log(`${data.length} open prep-taken\n`);
const perMaand = {};
for (const t of data) {
  const m = (t.scheduled_at ?? t.created_at ?? '').slice(0,7);
  (perMaand[m] ??= []).push(t);
}
for (const [maand, lijst] of Object.entries(perMaand).sort()) {
  console.log(`${maand}: ${lijst.length} taken · events ${[...new Set(lijst.map(t=>t.event_id))].join(',')}`);
  for (const t of lijst.slice(0,3)) console.log(`   ${t.status.padEnd(10)} ${(t.text ?? '').slice(0,60)}`);
  if (lijst.length > 3) console.log(`   … en ${lijst.length - 3} meer`);
}
