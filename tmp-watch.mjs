import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('./.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];})
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const { data: ups } = await sb.from('org_pricelist_uploads')
  .select('id, filename, status, parsed_product_count, new_count, chunk_index, chunk_total, parent_upload_id, ai_model, parse_error, created_at, ai_cost_cents')
  .eq('leverancier_id', 1).order('created_at', { ascending: false }).limit(8);

console.log('=== uploads beef club (nieuwste eerst) ===');
for (const u of ups||[]) {
  const kind = u.parent_upload_id ? `blok ${(u.chunk_index??0)+1}/${u.chunk_total}` : 'HOOFD';
  console.log(`[${u.status.padEnd(8)}] ${kind.padEnd(10)} ${(u.filename||'').slice(0,42).padEnd(44)} producten=${u.parsed_product_count ?? '-'} nieuw=${u.new_count ?? '-'} ${u.ai_cost_cents!=null?u.ai_cost_cents+'ct':''} ${u.created_at?.slice(11,19)} ${u.parse_error?'ERR: '+u.parse_error.slice(0,60):''}`);
}

const { count: pending } = await sb.from('org_price_mutations')
  .select('id',{count:'exact',head:true}).eq('leverancier_id',1).eq('status','pending');
console.log(`\npending mutaties beef club: ${pending}`);

const { data: coppa } = await sb.from('org_price_mutations')
  .select('parsed_naam, parsed_prijs, parsed_eenheid, status')
  .eq('leverancier_id',1).ilike('parsed_naam','%coppa%');
console.log('coppa-mutaties:', (coppa||[]).map(c=>`[${c.status}] ${c.parsed_naam} €${c.parsed_prijs} ${c.parsed_eenheid}`).join(' | ') || 'nog geen');
