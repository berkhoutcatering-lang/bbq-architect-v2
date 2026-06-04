/**
 * Menukaart-editor vanuit een event — spiegel van
 * `/offertes/[id]/menukaart-editor`, alleen begin je bij de event-id en
 * resolven we de gekoppelde offerte via `events.offerte_id`. De menukaart
 * leeft persistent in de offerte (zelfde 1 bron, twee toegangspunten),
 * dus alle Server Actions blijven offer-based en hoeven niet event-bewust
 * te worden.
 *
 * Edge case: een event zonder gekoppelde offerte → empty-state met CTA
 * terug naar de event-hub om er een te koppelen.
 *
 * Multi-tenant: RLS doet auto-isolatie. Een event uit een andere tenant
 * → notFound() (RLS filtert hem weg).
 */

import Link from 'next/link';
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

    /* Event + alle bibliotheek-data parallel; offerte-laden hangt af van
       event.offerte_id (kan ontbreken — empty-state hieronder). */
    const { data: event } = await supabase
        .from('events')
        .select('id, naam, date, guests, location, offerte_id')
        .eq('id', id)
        .maybeSingle();

    if (!event) notFound();

    if (!event.offerte_id) {
        return <NoOfferteState eventId={String(event.id)} eventName={event.naam || `Event ${event.id}`} />;
    }

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
            .eq('id', event.offerte_id)
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

    if (!offer) {
        /* offerte_id wijst naar iets dat niet bestaat (verwijderd?) — toon
           dezelfde empty-state als de unlinked-case. */
        return <NoOfferteState eventId={String(event.id)} eventName={event.naam || `Event ${event.id}`} />;
    }

    const templateId = offer.menukaart_template_id || settings?.menukaart_template_id || DEFAULT_TEMPLATE_ID;
    const brandOverrides = (settings?.menukaart_overrides as Overrides) ?? {};
    const customOverrides = (offer.menukaart_overrides as Overrides) ?? {};

    /* Label combineert event + offerte-context — staat in breadcrumb +
       canvas-header zodat de cateraar ziet vanuit welk event hij komt. */
    const offerLabel = offer.nummer || offer.client_naam || `Offerte ${offer.id}`;
    const contextLabel = `${event.naam || `Event ${event.id}`} · ${offerLabel}`;

    const rawSel = offer.menu_selectie as unknown;
    const menuSelectie: Record<string, string[]> | null =
        rawSel && typeof rawSel === 'object' && !Array.isArray(rawSel)
            ? (rawSel as Record<string, string[]>)
            : null;

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
            contextLabel={contextLabel}
        />
    );
}

/* ── Empty state: geen gekoppelde offerte ───────────────────────────
   Vermijdt de offerte-route omdat die zou crashen op notFound — hier
   stuurt de CTA de cateraar netjes terug naar de event-hub om eerst
   een offerte te koppelen. */
function NoOfferteState({ eventId, eventName }: { eventId: string; eventName: string }) {
    return (
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{
                maxWidth: 440, width: '100%', textAlign: 'center',
                padding: 32, borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated, var(--surface, #16161a))',
            }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Menukaart-editor</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                    Eerst een offerte koppelen
                </h1>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 20 }}>
                    De menukaart leeft in de offerte. Koppel <strong style={{ color: 'var(--text)' }}>{eventName}</strong> aan een offerte op de event-pagina; daarna kun je hier menu en stijl bewerken.
                </p>
                <Link
                    href={`/events/${eventId}/hub`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 8,
                        background: 'var(--brand-gold, #c4a35a)', color: '#1a1a1e',
                        fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    }}
                >
                    Terug naar event
                </Link>
            </div>
        </div>
    );
}
