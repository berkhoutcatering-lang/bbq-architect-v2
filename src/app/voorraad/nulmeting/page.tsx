import { createServerSupabase } from '@/lib/supabase-server';
import { pakVoorstel } from '@/lib/voorraadTelling';
import NulmetingClient, { type GeteldItem } from './_components/NulmetingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Keuken tellen · Voorraad',
    description: 'Loop met je telefoon door de keuken en zet je startvoorraad in één ronde vast.',
};

const FOTO_BUCKET = 'voorraad-fotos';
const FOTO_URL_GELDIG_SEC = 60 * 60 * 24 * 7;

/**
 * Keuken-telling (nulmeting) — server-shell.
 *
 * Laadt wat er al geteld is, zodat de cateraar ziet waar hij gebleven was en
 * een product dat al bestaat bijwerkt in plaats van dubbel aanmaakt. De
 * fotolinks worden hier in één batch ondertekend: de bucket is privaat, dus
 * de client kan er zelf geen leesbare URL van maken.
 */
export default async function NulmetingPage() {
    const supabase = await createServerSupabase();

    const { data: rows } = await supabase
        .from('inventory')
        .select('id, naam, categorie, current_stock, unit, par_level, min_stock, purchase_price, supplier, storage_type, foto_url, last_count_at, preferred_supplier_product_id')
        .order('naam')
        .limit(2000);

    const items = (rows ?? []) as Array<Record<string, unknown>>;

    /* Pakmaat van de vaste leverancier ophalen. Zonder dit begint een hertelling
       weer op "1 × 1": tel je dan 2 emmers, dan legt de app 2 kg vast in plaats
       van 10 kg — en een telling is een absolute stand, dus die fout wordt de
       waarheid. */
    const supplierProductIds = Array.from(new Set(
        items.map((r) => r.preferred_supplier_product_id).filter((v): v is number => typeof v === 'number'),
    ));
    const pakPerProduct = new Map<number, { inhoud: number; eenheid: string }>();
    if (supplierProductIds.length > 0) {
        const { data: sps } = await supabase
            .from('supplier_products')
            .select('id, total_base_quantity, base_unit, package_size, package_unit')
            .in('id', supplierProductIds);
        for (const sp of sps ?? []) {
            const pak = pakVoorstel({
                pack_total_quantity: (sp.total_base_quantity ?? sp.package_size) as number | null,
                pack_total_unit: (sp.base_unit ?? sp.package_unit) as string | null,
            });
            if (pak) pakPerProduct.set(sp.id as number, pak);
        }
    }

    /* Fotolinks in één keer ondertekenen — één call i.p.v. één per item. */
    const paden = items.map((r) => r.foto_url).filter((p): p is string => typeof p === 'string' && p.length > 0);
    const fotoPerPad = new Map<string, string>();
    if (paden.length > 0) {
        const { data: signed } = await supabase.storage.from(FOTO_BUCKET).createSignedUrls(paden, FOTO_URL_GELDIG_SEC);
        for (const s of signed ?? []) {
            if (s.path && s.signedUrl) fotoPerPad.set(s.path, s.signedUrl);
        }
    }

    const geteld: GeteldItem[] = items.map((r) => ({
        id: Number(r.id),
        naam: String(r.naam ?? ''),
        categorie: (r.categorie as string | null) ?? null,
        current_stock: Number(r.current_stock ?? 0),
        unit: String(r.unit ?? 'stuks'),
        par_level: Number(r.par_level ?? r.min_stock ?? 0),
        purchase_price: r.purchase_price != null ? Number(r.purchase_price) : null,
        supplier: (r.supplier as string | null) ?? null,
        zone: (r.storage_type as GeteldItem['zone']) ?? null,
        foto: typeof r.foto_url === 'string' ? fotoPerPad.get(r.foto_url) ?? null : null,
        last_count_at: (r.last_count_at as string | null) ?? null,
        pak: typeof r.preferred_supplier_product_id === 'number'
            ? pakPerProduct.get(r.preferred_supplier_product_id) ?? null
            : null,
    }));

    return <NulmetingClient initial={geteld} />;
}
