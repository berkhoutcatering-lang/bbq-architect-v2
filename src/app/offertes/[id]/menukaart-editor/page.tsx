/**
 * Menukaart-editor — server-page laadt offerte + brand-overrides en hand-off
 * naar de client-side MenukaartEditor.
 *
 * S4-fase-1: alleen restaurant-01 template live. Andere 9 in registry maar
 * `enabled: false`.
 */

import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import MenukaartEditor from '@/components/menukaart/editor/MenukaartEditor';
import { DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { buildMenuData } from '@/lib/menukaart/build-menu-data';
import type { Gerecht, Gang } from '@/types';
import type { MenuTemplateLite } from '@/components/menu/MenuMenukaartCanvas';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Menukaart aanpassen · BBQ Architect',
};

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
    const { id } = await params;
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) notFound();

    /* Parallelle queries: offerte + tenant-settings + gerechten/gangen-
       bibliotheek + opgeslagen menukaart-templates. Alles via RLS gefilterd. */
    const [
        { data: offer },
        { data: settings },
        { data: gerechtenData },
        { data: gangenData },
        { data: menuTemplatesData },
    ] = await Promise.all([
        supabase
            .from('offertes')
            .select('id, nummer, client_naam, datum, menukaart_template_id, menukaart_overrides, menu_selectie')
            .eq('id', id)
            .maybeSingle(),
        supabase
            .from('settings')
            .select('logo_url, menukaart_template_id, menukaart_overrides')
            .limit(1)
            .maybeSingle(),
        supabase.from('gerechten').select('*'),
        supabase.from('gangen').select('*').order('volgorde'),
        supabase
            .from('menu_templates')
            .select('id, naam, is_default, menu_selectie')
            .eq('actief', true)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false }),
    ]);

    if (!offer) notFound();

    const templateId = offer.menukaart_template_id || settings?.menukaart_template_id || DEFAULT_TEMPLATE_ID;
    const brandOverrides = (settings?.menukaart_overrides as Overrides) ?? {};
    const customOverrides = (offer.menukaart_overrides as Overrides) ?? {};
    const offerLabel = offer.nummer || offer.client_naam || `Offerte ${offer.id}`;

    /* menu_selectie kan in legacy DB-rijen string-JSON of array zijn.
       Alleen de object-shape geeft een betekenisvolle menukaart. */
    const rawSel = offer.menu_selectie as unknown;
    const menuSelectie: Record<string, string[]> | null =
        rawSel && typeof rawSel === 'object' && !Array.isArray(rawSel)
            ? (rawSel as Record<string, string[]>)
            : null;

    /* Server-side menuData zodat de preview de échte gerechten toont
       i.p.v. DEMO_MENU. Allergenen volgen de showAllergens-toggle. */
    const showAllergens = (customOverrides.showAllergens as boolean | undefined)
        ?? (brandOverrides.showAllergens as boolean | undefined)
        ?? false;

    const menuData = buildMenuData(
        menuSelectie,
        (gerechtenData ?? []) as Array<{ naam?: string; beschrijving?: string; gang_slug?: string; allergenen?: unknown }>,
        (gangenData ?? []) as Array<{ slug?: string; naam?: string; volgorde?: number }>,
        { logoUrl: settings?.logo_url ?? null, showAllergens },
    );

    return (
        <MenukaartEditor
            offerId={String(offer.id)}
            offerLabel={offerLabel}
            templateId={templateId}
            brandOverrides={brandOverrides}
            customOverrides={customOverrides}
            logoUrl={settings?.logo_url ?? null}
            menuData={menuData}
            gerechten={(gerechtenData ?? []) as Gerecht[]}
            gangen={(gangenData ?? []) as Gang[]}
            menuTemplates={(menuTemplatesData ?? []) as MenuTemplateLite[]}
            initialMenuSelectie={menuSelectie}
            contextLabel={offerLabel}
        />
    );
}
