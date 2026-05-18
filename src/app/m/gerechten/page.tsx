import { createServerSupabase } from '@/lib/supabase-server';
import MobileLarsView, { type MobileDish } from './_components/MobileLarsView';

export const metadata = {
    title: 'Lars Mobile · BBQ Architect',
    description: 'Mobile-first view voor de foodtruck-operator',
};

/* Fallback-data uit het Claude Design package (mobile-lars.html lines 112-119).
   Wordt getoond als de tenant nog geen gerechten heeft of als de fetch faalt.
   Identieke shape als de echte rows die we uit Supabase halen. */
const FALLBACK_DISHES: MobileDish[] = [
    { id: 'h1', name: 'Low & Slow Brisket',       glyph: '🍖', sub: '14u · oak smoke · au jus',              cost: 6.20, price: 18.00, tags: ['BBQ', 'Vlees'], provenance: 'curated', allergens: ['—'], status: 'live', gang: 'hoofd' },
    { id: 'h2', name: 'Pulled Pork Classic',      glyph: '🥩', sub: 'Boston butt · appelhout · brioche bun', cost: 4.10, price: 14.50, tags: ['BBQ', 'Vlees'], provenance: 'curated', allergens: ['Gluten'], status: 'live', gang: 'hoofd' },
    { id: 'h3', name: 'St. Louis Ribs',           glyph: '🍗', sub: 'Dry rub · cherry glaze · 5u smoke',     cost: 7.20, price: 19.50, tags: ['BBQ', 'Vlees'], provenance: 'ai',      allergens: ['—'], status: 'live', gang: 'hoofd' },
    { id: 'h4', name: 'Smoked Watermelon "Ham"',  glyph: '🍉', sub: 'Vegan showstopper · 4u in de smoker',   cost: 1.85, price: 9.50,  tags: ['Vegan', 'BBQ'], provenance: 'ai',      allergens: ['Soja'], status: 'concept', gang: 'hoofd' },
    { id: 'bj1', name: 'Smoked Mac & Cheese',     glyph: '🧀', sub: '3-kazen · pankokorst',                  cost: 1.20, price: 6.50,  tags: ['Veg'],          provenance: 'curated', allergens: ['Lactose', 'Gluten'], status: 'live', gang: 'bij' },
    { id: 'd1', name: 'Smoked Chocolate Brownie', glyph: '🍫', sub: 'Hickory · zeezout · vanilleroom',       cost: 1.30, price: 6.00,  tags: ['Zoet'],         provenance: 'curated', allergens: ['Lactose', 'Gluten', 'Ei'], status: 'live', gang: 'dessert' },
];

/* Emoji-selectie op basis van gang_slug. Production-grade zou per-gerecht een
   foto/glyph in DB hebben, voor de mobile shell is een emoji genoeg + snel. */
function glyphForGang(slug: string | null): string {
    switch (slug) {
        case 'voor': case 'voorgerecht': return '🥗';
        case 'hoofd': case 'hoofdgerecht': return '🍖';
        case 'bij':   case 'bijgerecht':   return '🥔';
        case 'dessert': return '🍰';
        case 'bites':   return '🍢';
        case 'hapje':   return '🥨';
        default: return '🍽️';
    }
}

function shortify(text: string | null, max = 80): string {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max).trimEnd() + '…';
}

async function loadMobileDishes(): Promise<MobileDish[] | null> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return null;
        const orgId = mem.organization_id as string;

        const { data, error } = await sb
            .from('gerechten')
            .select('id, naam, beschrijving, gang_slug, total_cost_cents, verkoopprijs, allergenen, tags, bron, status')
            .eq('organization_id', orgId)
            .neq('status', 'inactief')
            .limit(20);

        if (error || !data || data.length === 0) return null;

        return data.map((row) => {
            const cost = (row.total_cost_cents ?? 0) / 100;
            const price = Number(row.verkoopprijs ?? 0);
            return {
                id: String(row.id),
                name: row.naam ?? 'Naamloos',
                glyph: glyphForGang(row.gang_slug),
                sub: shortify(row.beschrijving),
                cost,
                price,
                tags: Array.isArray(row.tags) ? row.tags.slice(0, 2) : [],
                provenance: row.bron === 'ai' ? 'ai' : 'curated',
                allergens: Array.isArray(row.allergenen) ? row.allergenen : [],
                status: row.status === 'concept' ? 'concept' : 'live',
                gang: row.gang_slug ?? null,
            } satisfies MobileDish;
        });
    } catch {
        return null;
    }
}

export default async function MobileLarsPage() {
    const dishes = (await loadMobileDishes()) ?? FALLBACK_DISHES;
    return <MobileLarsView dishes={dishes} />;
}
