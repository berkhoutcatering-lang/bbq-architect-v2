import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('./.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const ORG='3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879';

const { count: totaal } = await sb.from('supplier_products').select('id',{count:'exact',head:true}).eq('supplier_id',28);
const { data: lev } = await sb.from('leveranciers').select('products_count,last_sync_at,last_sync_status,portal_url').eq('id',28).single();
console.log('supplier_products voor Bidfood:', totaal);
console.log('leveranciers.products_count :', lev.products_count);
console.log('stand:', lev.last_sync_status, '· laatst:', lev.last_sync_at);
console.log('laatste portal_url:', lev.portal_url);

const vandaag = new Date().toISOString().slice(0,10);
const { count: vers } = await sb.from('supplier_products').select('id',{count:'exact',head:true})
  .eq('supplier_id',28).gte('last_updated_at', vandaag);
console.log('\nvandaag bijgewerkt/toegevoegd:', vers);

const { data: nieuw } = await sb.from('supplier_products').select('name,price_cents,package_size,package_unit,unit,last_updated_at')
  .eq('supplier_id',28).gte('last_updated_at', vandaag).order('last_updated_at',{ascending:false}).limit(6);
for (const p of nieuw ?? []) console.log(`   €${(p.price_cents/100).toFixed(2)} / ${p.package_size ?? '?'}${p.package_unit ?? p.unit ?? ''} · ${p.name.slice(0,56)}`);
