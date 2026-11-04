import { createServerSupabase } from '@/lib/supabase-server';
import { fotoUrl } from '@/lib/toonbank/vragen';
import { WINKEL_RUIMTE, type LivePlek } from '@/lib/winkel/plekken';
import VloerClient, { type VloerData } from './VloerClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Afdelingen indelen',
    description: 'Welke afdelingen de winkel heeft en wat waar staat.',
};

/**
 * Afdelingen indelen (eerste stap van fase 3): de ruimte "Winkel" met haar
 * afdelingen, en per afdeling de producten die er te koop staan. Faalt het
 * laden omdat migratie 20261102120000_winkel_plekken er nog niet staat, dan
 * zegt het scherm dat, in plaats van een 500.
 */
export default async function WinkelVloerPage() {
    const supabase = await createServerSupabase();

    const [plekken, plaatsingen, producten] = await Promise.all([
        supabase.from('opslag_locaties').select('id, code, naam, soort, parent_id, volgorde').order('volgorde'),
        supabase.from('winkel_plaatsingen').select('id, product_id, locatie_id, rol, volgorde').order('volgorde'),
        supabase.from('winkel_producten').select('id, naam, type, actief, foto, foto_url').order('naam'),
    ]);

    if (plekken.error || plaatsingen.error) {
        console.error('[voorraad/winkel/vloer] laden mislukt:', plekken.error?.message ?? plaatsingen.error?.message);
        return <VloerClient data={null} />;
    }

    const alle = (plekken.data ?? []) as LivePlek[];
    const ruimte = alle.find((p) => p.code === WINKEL_RUIMTE.code) ?? null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const data: VloerData = {
        ruimte,
        plekken: ruimte ? alle.filter((p) => p.parent_id === ruimte.id) : [],
        plaatsingen: (plaatsingen.data ?? []).map((p) => ({
            id: p.id as string, product_id: p.product_id as string, locatie_id: p.locatie_id as string, rol: p.rol as string, volgorde: p.volgorde as number,
        })),
        producten: (producten.data ?? []).map((p) => ({
            id: p.id as string,
            naam: p.naam as string,
            type: p.type as string,
            actief: !!p.actief,
            foto: fotoUrl(supabaseUrl, p.foto, (p.foto_url as string | null) ?? null),
        })),
    };
    return <VloerClient data={data} />;
}
