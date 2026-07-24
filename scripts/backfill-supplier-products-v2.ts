/**
 * Backfill supplier_products → leverancierssync v2-velden (dry-run standaard).
 *
 * Vult identity_key + supplier_account_key + base_unit/total_base_quantity op
 * bestaande supplier_products-rijen zodat toekomstige syncs erop UPSERTEN i.p.v.
 * duplicaten maken. Alleen ondubbelzinnige mapping (§16 Fase D). Logt aantallen:
 * automatisch gemapt / handmatige keuze nodig / overgeslagen.
 *
 *   npx tsx scripts/backfill-supplier-products-v2.ts            # dry-run
 *   npx tsx scripts/backfill-supplier-products-v2.ts --apply    # schrijft
 *
 * Vereist SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sha256Hex(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

/** Zelfde vorm als packVariantKey in identity.ts (uit bestaande pakvelden). */
function packVariant(sp: Record<string, unknown>): string {
    const size = sp.package_size ?? sp.total_base_quantity ?? '';
    const unit = sp.package_unit ?? sp.base_unit ?? '';
    if (!size && !unit) return 'pack:unknown';
    return `pack:package||${size}|${unit}||`;
}

function identityFor(sp: Record<string, unknown>, orgId: string): string | null {
    const account = (sp.supplier_account_key as string) || 'main';
    const supplierId = sp.supplier_id != null ? String(sp.supplier_id) : '';
    const pack = packVariant(sp);
    let core: string;
    if (sp.supplier_sku) core = `sku:${String(sp.supplier_sku).toLowerCase()}|${pack}`;
    else if (sp.gtin || sp.ean) core = `ean:${sp.gtin || sp.ean}|${pack}`;
    else return null; // geen stabiele identiteit → handmatig
    return sha256Hex([orgId, supplierId, account, core].join(' '));
}

async function main() {
    if (!URL || !KEY) {
        console.error('❌ Ontbrekende env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });
    console.log(`\n🔧 Backfill supplier_products v2 — ${APPLY ? 'APPLY (schrijft)' : 'DRY-RUN (geen writes)'}\n`);

    let mapped = 0, needsManual = 0, skipped = 0, page = 0;
    const PAGE = 500;

    for (;;) {
        const { data, error } = await sb
            .from('supplier_products')
            .select('id, organization_id, supplier_id, supplier_sku, gtin, ean, package_size, package_unit, total_base_quantity, base_unit, supplier_account_key, identity_key')
            .is('identity_key', null)
            .range(page * PAGE, page * PAGE + PAGE - 1);

        if (error) { console.error('DB-fout:', error.message); process.exit(1); }
        if (!data || data.length === 0) break;

        for (const sp of data) {
            const id = identityFor(sp, sp.organization_id);
            if (!id) { needsManual += 1; continue; }

            if (APPLY) {
                const patch: Record<string, unknown> = {
                    identity_key: id,
                    supplier_account_key: sp.supplier_account_key || 'main',
                };
                // Base-velden afleiden uit bestaande pakvelden als ze leeg zijn.
                if (sp.base_unit == null && sp.package_unit) patch.base_unit = sp.package_unit;
                if (sp.total_base_quantity == null && sp.package_size != null) patch.total_base_quantity = sp.package_size;
                const { error: upErr } = await sb.from('supplier_products').update(patch).eq('id', sp.id);
                if (upErr) { skipped += 1; continue; }
            }
            mapped += 1;
        }
        page += 1;
    }

    console.log('── Resultaat ─────────────────────────────');
    console.log(`  automatisch gemapt:      ${mapped}`);
    console.log(`  handmatige keuze nodig:  ${needsManual}  (geen SKU/EAN)`);
    console.log(`  overgeslagen (fout):     ${skipped}`);
    console.log(APPLY ? '\n✅ Writes toegepast.' : '\nℹ️  Dry-run — draai met --apply om te schrijven.');
}

main().catch((e) => { console.error(e); process.exit(1); });
