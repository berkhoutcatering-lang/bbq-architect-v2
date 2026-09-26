'use client';

/**
 * /verkoop/webshop — elke betaalde bestelling van de website, in het vakje
 * van de dag waarop hij klaar moet zijn. Plus het beheer van de kassa:
 * artikelen, momenten, instellingen.
 * Plan: docs/webshop-beheer-bouwplan.md §3. Ontwerp: .design-import/webshop.
 *
 * Reads via de supabase-client (RLS), writes via server actions (Zod +
 * re-auth). De vakjes worden hier geteld uit de orders (zuiver, in
 * _lib/vakjes.ts); de plaatsing zelf gebeurt in de kassa bij de betaling.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { vandaagISO } from '@/lib/winkel/rekenen';
import VakjesPaneel from './_components/VakjesPaneel';
import ArtikelenPaneel, { type GerechtKeuze, type VoorraadKeuze } from './_components/ArtikelenPaneel';
import MomentenPaneel from './_components/MomentenPaneel';
import ProductenPaneel from './_components/ProductenPaneel';
import InstellingenPaneel, { type InstellingenRij } from './_components/InstellingenPaneel';
import type { ArtikelRij, ComponentRij, MomentRij, OrderRij, ProductRij, SlotRij } from './_lib/vakjes';
import '@/styles/menu-hub.css';
import './webshop.css';

type Paneel = 'vakjes' | 'artikelen' | 'producten' | 'momenten' | 'instellingen';
const PANELEN: { key: Paneel; label: string; onderschrift: string }[] = [
    { key: 'vakjes', label: 'Vakjes', onderschrift: 'Elke betaalde bestelling van de website, in het vakje van de dag waarop hij klaar moet zijn.' },
    { key: 'artikelen', label: 'Artikelen', onderschrift: 'Wat de website verkoopt, en wat de keuken daarvoor maakt of jij daarvoor inkoopt.' },
    { key: 'producten', label: 'Producten', onderschrift: 'Wat er in een pakket of op een plank ligt: bier, wijn, worst, amandelen, doos — met prijs en voorraad.' },
    { key: 'momenten', label: 'Momenten', onderschrift: 'Wanneer klanten kunnen ophalen, en hoeveel er per keer past.' },
    { key: 'instellingen', label: 'Instellingen', onderschrift: 'Hoe de kassa op de website werkt.' },
];

const ORDER_SELECT = 'id, nummer, status, status_reden, leverwijze, moment_id, contact_naam, contact_email, contact_telefoon, adres, opmerking, subtotaal_cents, leverkosten_cents, totaal_cents, reservering_tot, betaald_at, betaalmethode, created_at, refund_status, refund_fout, mail_status, mail_fout, wensen, wensen_bron, plaatsing_status, plaatsing_fout, betaalwijze, nu_te_betalen_cents, rest_cents, rest_betaald_at, rest_betaalmethode, winkel_order_regels(id, artikel_id, slug, naam, aantal, eenheid, stuk_cents, bedrag_cents, moment_id, eenheden, klaar_op, event_id, klaargezet_at, afhaalmoment_tekst, alcohol, btw_cents)';

function paneelUitHash(): Paneel {
    if (typeof window === 'undefined') return 'vakjes';
    const h = window.location.hash.replace('#', '');
    return PANELEN.some((p) => p.key === h) ? (h as Paneel) : 'vakjes';
}

export default function WebshopPagina() {
    const { organization } = useOrg();
    const toast = useToast();
    const [paneel, setPaneel] = useState<Paneel>('vakjes');
    const [laden, setLaden] = useState(true);
    const [orders, setOrders] = useState<OrderRij[]>([]);
    const [artikelen, setArtikelen] = useState<ArtikelRij[]>([]);
    const [momenten, setMomenten] = useState<MomentRij[]>([]);
    const [instellingen, setInstellingen] = useState<InstellingenRij | null>(null);
    const [gerechten, setGerechten] = useState<GerechtKeuze[]>([]);
    const [voorraad, setVoorraad] = useState<VoorraadKeuze[]>([]);
    const [producten, setProducten] = useState<ProductRij[]>([]);
    const [slots, setSlots] = useState<SlotRij[]>([]);
    const [componenten, setComponenten] = useState<ComponentRij[]>([]);
    const vandaag = useMemo(() => vandaagISO(), []);

    useEffect(() => { setPaneel(paneelUitHash()); }, []);
    function kies(p: Paneel) {
        setPaneel(p);
        if (typeof window !== 'undefined') window.history.replaceState(null, '', p === 'vakjes' ? window.location.pathname : `#${p}`);
    }

    const melding = useCallback((tekst: string, soort: 'success' | 'error' | 'info' = 'info') => toast(tekst, soort), [toast]);

    const laad = useCallback(async () => {
        const [o, a, m, i, g, v, p, sl, c] = await Promise.all([
            supabase.from('winkel_orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(500),
            supabase.from('winkel_artikelen').select('*').order('naam'),
            supabase.from('winkel_momenten').select('id, groep, datum, van, tot, capaciteit, bestellen_tot, sluit_op, actief').order('datum'),
            supabase.from('winkel_instellingen').select('verzendkosten_cents, gratis_verzenden_vanaf_cents, verzendkosten_btw_pct, reservering_minuten, offerte_geldig_minuten, nummer_prefix, nummer_jaar, nummer_laatste, kassa_open, site_url, reservering_bedrag_cents, qr_basis_url').maybeSingle(),
            supabase.from('gerechten').select('id, naam').eq('actief', true).order('naam'),
            supabase.from('inventory').select('id, naam, unit, current_stock').order('naam'),
            supabase.from('winkel_producten').select('*').order('type').order('naam'),
            supabase.from('winkel_artikel_slots').select('*').order('volgorde'),
            /* De componenten van de regels (S7): wat er precies in elk pakket en op elke plank ligt. */
            supabase.from('winkel_order_regel_componenten').select('id, order_regel_id, product_id, slot_type, naam, hoeveelheid, eenheid').order('id').limit(5000),
        ]);
        const fout = [o, a, m, i, g, v, p, sl, c].find((r) => r.error)?.error;
        if (fout) { melding(fout.message, 'error'); return; }
        setProducten(((p.data ?? []) as ProductRij[]).map((x) => ({ ...x, prijs_per: Number(x.prijs_per), voorraad: x.voorraad == null ? null : Number(x.voorraad) })));
        setSlots(((sl.data ?? []) as SlotRij[]).map((x) => ({ ...x, hoeveelheid: Number(x.hoeveelheid), alternatieven: x.alternatieven ?? [] })));
        setComponenten(((c.data ?? []) as ComponentRij[]).map((x) => ({ ...x, hoeveelheid: Number(x.hoeveelheid) })));
        setOrders((o.data ?? []) as unknown as OrderRij[]);
        setArtikelen((a.data ?? []) as unknown as ArtikelRij[]);
        setMomenten((m.data ?? []) as MomentRij[]);
        setInstellingen((i.data as InstellingenRij | null) ?? null);
        setGerechten((g.data ?? []) as GerechtKeuze[]);
        setVoorraad(((v.data ?? []) as VoorraadKeuze[]).map((x) => ({ ...x, id: Number(x.id) })));
    }, [melding]);

    useEffect(() => {
        if (!organization) return;
        let levend = true;
        laad().finally(() => { if (levend) setLaden(false); });
        return () => { levend = false; };
    }, [organization, laad]);

    const actief = PANELEN.find((p) => p.key === paneel)!;
    const kassaOpen = instellingen?.kassa_open ?? false;

    return (
        <div className="ws-root" style={{ padding: '18px 32px 48px', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="ws-eyebrow" style={{ letterSpacing: '.16em' }}>Verkoop · website-kassa</div>
                    <h1 className="ws-kop">Webshop</h1>
                    <div className="ws-onderschrift">{actief.onderschrift}</div>
                </div>
                <span className={`pill ${kassaOpen ? 'pill-green' : 'pill-red'}`} style={{ cursor: 'pointer' }} onClick={() => kies('instellingen')} title="Naar instellingen">{kassaOpen ? 'Kassa open' : 'Kassa dicht'}</span>
            </div>

            <div className="ws-segment" role="tablist" aria-label="Webshop-onderdelen">
                {PANELEN.map((p) => <button key={p.key} type="button" role="tab" aria-selected={paneel === p.key} onClick={() => kies(p.key)}>{p.label}</button>)}
            </div>

            {laden ? (
                <div className="ws-leeg" style={{ padding: 24 }}>Laden…</div>
            ) : paneel === 'vakjes' ? (
                <VakjesPaneel orders={orders} artikelen={artikelen} momenten={momenten} componenten={componenten} vandaag={vandaag} herlaad={laad} melding={melding} />
            ) : paneel === 'artikelen' ? (
                <ArtikelenPaneel artikelen={artikelen} gerechten={gerechten} voorraad={voorraad} producten={producten} slots={slots} herlaad={laad} melding={melding} />
            ) : paneel === 'producten' ? (
                <ProductenPaneel producten={producten} slots={slots} artikelen={artikelen} componenten={componenten} orders={orders} herlaad={laad} melding={melding} />
            ) : paneel === 'momenten' ? (
                <MomentenPaneel momenten={momenten} artikelen={artikelen} orders={orders} vandaag={vandaag} herlaad={laad} melding={melding} />
            ) : (
                <InstellingenPaneel instellingen={instellingen} herlaad={laad} melding={melding} />
            )}
        </div>
    );
}
