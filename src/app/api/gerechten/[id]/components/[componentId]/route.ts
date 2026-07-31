/* /api/gerechten/[id]/components/[componentId]
   DELETE — verwijder koppeling (AFTER-trigger recomputes gerechten.total_cost_cents)
   PATCH  — corrigeer de dosering (hoeveelheid + eenheid) */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { unitFamily } from '@/lib/unitPrice';

/* Waarom deze PATCH moest bestaan:

   Er was geen enkele manier om "100 g bavette" naar "150 g" te veranderen. De
   primaire sleutel is (gerecht_id, component_id), dus een tweede POST stuit op
   409 "zit al in dit gerecht". De enige uitweg was de koppeling weggooien en
   opnieuw aanmaken — weggooien-en-opnieuw bij élke correctie op een dosering.
   Zolang iemand dat niet deed, stond er een hoeveelheid in de kostprijs die
   niemand ooit gekozen had (de basis-hoeveelheid van de bouwsteen, die er per
   ongeluk in kwam bij het toevoegen).

   Hoeveelheid en eenheid gaan bewust samen door één weg: de eenheid bepaalt de
   factor (2,5 kg is duizend keer 2,5 g), en de database herrekent de kostprijs
   alleen als één van die twee door deze update heen komt. */
export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; componentId: string }> },
) {
    const { id, componentId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return NextResponse.json({ error: 'Dit gerecht kon ik niet terugvinden.' }, { status: 400 });
    }
    const cid = Number(componentId);
    if (!Number.isInteger(cid) || cid <= 0) {
        return NextResponse.json({ error: 'Deze bouwsteen kon ik niet terugvinden.' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ error: 'Er kwam niets binnen om op te slaan.' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const quantityUsed = typeof b.quantity_used === 'number' ? b.quantity_used : Number(b.quantity_used);
    const unit = typeof b.unit === 'string' ? b.unit.trim() : '';

    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
        return NextResponse.json({ error: 'Vul een hoeveelheid groter dan 0 in.' }, { status: 400 });
    }
    if (!unit) return NextResponse.json({ error: 'Kies een eenheid.' }, { status: 400 });

    /* Bestaat deze bouwsteen in de eigen organisatie, en past de eenheid?
       De omrekening in de database laat een hoeveelheid ONGEWIJZIGD staan als
       de eenheden uit verschillende families komen (gram versus milliliter,
       stuks versus gram). Dat levert stil een verkeerd bedrag op in plaats van
       een foutmelding — dus houden we die combinatie hier tegen. Kennen we een
       van beide eenheden niet, dan oordelen we niet: dan is er niets te
       vergelijken en zou weigeren de gebruiker klemzetten. */
    const { data: comp } = await supabase
        .from('components')
        .select('base_unit')
        .eq('id', cid)
        .eq('organization_id', membership.organization_id)
        .maybeSingle();
    if (!comp) return NextResponse.json({ error: 'Bouwsteen niet gevonden' }, { status: 404 });

    const gekozen = unitFamily(unit);
    const basis = unitFamily(String(comp.base_unit ?? ''));
    if (gekozen && basis && gekozen !== basis) {
        return NextResponse.json({
            error: `Deze bouwsteen rekent per ${comp.base_unit}. Een hoeveelheid in ${unit} kan de app daar niet naar omrekenen — kies een passende eenheid.`,
        }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('gerecht_components')
        .update({ quantity_used: quantityUsed, unit })
        .eq('gerecht_id', id)
        .eq('component_id', cid)
        .eq('organization_id', membership.organization_id)
        .select('gerecht_id, component_id, quantity_used, unit, cost_at_use_cents')
        .maybeSingle();

    if (error) {
        /* Nooit de rauwe Postgres-tekst doorgeven: beide editors zetten die
           letterlijk op het scherm, en dan leest Sam iets als "column ... does not
           exist in the schema cache". Techniek naar de serverlog, mensentaal naar
           het scherm. */
        console.error('[PATCH gerecht_components]', error);
        return NextResponse.json({ error: 'Opslaan lukte niet. Probeer het nog een keer.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Deze bouwsteen zit niet in dit gerecht' }, { status: 404 });

    return NextResponse.json({ item: data });
}

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; componentId: string }> },
) {
    const { id, componentId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return NextResponse.json({ error: 'Dit gerecht kon ik niet terugvinden.' }, { status: 400 });
    }
    const cid = Number(componentId);
    if (!Number.isInteger(cid) || cid <= 0) {
        return NextResponse.json({ error: 'Deze bouwsteen kon ik niet terugvinden.' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { error } = await supabase
        .from('gerecht_components')
        .delete()
        .eq('gerecht_id', id)
        .eq('component_id', cid)
        .eq('organization_id', membership.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
