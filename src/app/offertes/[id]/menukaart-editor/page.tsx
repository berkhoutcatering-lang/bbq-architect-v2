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

    const [{ data: offer }, { data: settings }] = await Promise.all([
        supabase
            .from('offertes')
            .select('id, nummer, client_naam, datum, menukaart_template_id, menukaart_overrides')
            .eq('id', id)
            .maybeSingle(),
        supabase
            .from('settings')
            .select('logo_url, menukaart_template_id, menukaart_overrides')
            .limit(1)
            .maybeSingle(),
    ]);

    if (!offer) notFound();

    const templateId = offer.menukaart_template_id || settings?.menukaart_template_id || DEFAULT_TEMPLATE_ID;
    const brandOverrides = (settings?.menukaart_overrides as Overrides) ?? {};
    const customOverrides = (offer.menukaart_overrides as Overrides) ?? {};
    const offerLabel = offer.nummer || offer.client_naam || `Offerte ${offer.id}`;

    return (
        <MenukaartEditor
            offerId={String(offer.id)}
            offerLabel={offerLabel}
            templateId={templateId}
            brandOverrides={brandOverrides}
            customOverrides={customOverrides}
            logoUrl={settings?.logo_url ?? null}
        />
    );
}
