'use client';

/**
 * /verkoop/kerst — de Kerst-Box-bestellingen op één plek.
 *
 * De bestellingen zelf zijn gewone winkel-orders (betaalwijze 'bij_afhalen',
 * zie src/lib/winkel/kerst.ts), dus ze staan óók in de vakjes van de webshop.
 * Dit scherm telt ze per afhaaldag: personen, vegetarisch, proeverijen, dozen,
 * geld — en rekent met wat er per persoon in de doos zit hoeveel er gemaakt
 * moet worden.
 *
 * Reads via de supabase-client (RLS), writes via server actions.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { KERST_SLUG, KERST_SLUG_LIJST, kerstTotalen, type KerstOnderdeel } from '@/lib/winkel/kerstTellen';
import Overzicht from './_components/Overzicht';
import Bestellingen from './_components/Bestellingen';
import Inhoud from './_components/Inhoud';
import type { ArtikelRij, KerstLead, KerstOrderRij, MomentRij } from './_components/types';
import '@/styles/menu-hub.css';
import '../webshop/webshop.css';
import './kerst.css';

type Paneel = 'overzicht' | 'bestellingen' | 'inhoud';
const PANELEN: { key: Paneel; label: string; onderschrift: string }[] = [
    { key: 'overzicht', label: 'Overzicht', onderschrift: 'Hoeveel personen, hoeveel vegetarisch en hoeveel er gemaakt moet worden, per afhaaldag.' },
    { key: 'bestellingen', label: 'Bestellingen', onderschrift: 'Elke Kerst-Box-bestelling: aantal aanpassen, betaald en opgehaald aanvinken, annuleren.' },
    { key: 'inhoud', label: 'Inhoud & prijzen', onderschrift: 'Wat er per persoon in de doos zit, en wat de proeverijen kosten.' },
];

/** De dagen die de site aanbiedt; ook zonder bestellingen een kolom. */
const KERST_DAGEN = ['2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26'];

const ORDER_SELECT = 'id, nummer, status, contact_naam, contact_email, contact_telefoon, opmerking, totaal_cents, rest_cents, rest_betaald_at, rest_betaalmethode, betaalwijze, mail_status, mail_fout, plaatsing_status, plaatsing_fout, created_at, lead_id, aantal_onzeker, navraag_verstuurd_at, herinnering_verstuurd_at, geannuleerd_at, winkel_order_regels!inner(id, slug, naam, aantal, klaar_op, eenheden, opgehaald_at, klaargezet_at, event_id)';

function paneelUitHash(): Paneel {
    if (typeof window === 'undefined') return 'overzicht';
    const h = window.location.hash.replace('#', '');
    return PANELEN.some((p) => p.key === h) ? (h as Paneel) : 'overzicht';
}

export default function KerstPagina() {
    const { organization } = useOrg();
    const toast = useToast();
    const [paneel, setPaneel] = useState<Paneel>('overzicht');
    const [laden, setLaden] = useState(true);
    const [migratieOntbreekt, setMigratieOntbreekt] = useState(false);
    const [orders, setOrders] = useState<KerstOrderRij[]>([]);
    const [leads, setLeads] = useState<KerstLead[]>([]);
    const [artikelen, setArtikelen] = useState<ArtikelRij[]>([]);
    const [momenten, setMomenten] = useState<MomentRij[]>([]);
    const [onderdelen, setOnderdelen] = useState<KerstOnderdeel[]>([]);

    useEffect(() => { setPaneel(paneelUitHash()); }, []);
    function kies(p: Paneel) {
        setPaneel(p);
        if (typeof window !== 'undefined') window.history.replaceState(null, '', p === 'overzicht' ? window.location.pathname : `#${p}`);
    }
    const melding = useCallback((tekst: string, soort: 'success' | 'error' | 'info' = 'info') => toast(tekst, soort), [toast]);

    const laad = useCallback(async () => {
        const [o, l, a, m, d] = await Promise.all([
            supabase.from('winkel_orders').select(ORDER_SELECT).in('winkel_order_regels.slug', KERST_SLUG_LIJST).order('created_at', { ascending: false }).limit(1000),
            supabase.from('leads').select('id, naam, email, telefoon, event_datum, gasten, bericht, omzet_fout, created_at').ilike('event_type', 'kerst%').eq('status', 'nieuw').not('omzet_fout', 'is', null).order('created_at', { ascending: false }),
            supabase.from('winkel_artikelen').select('id, slug, naam, eenheid, prijs_cents, actief, minimum').in('slug', KERST_SLUG_LIJST),
            supabase.from('winkel_momenten').select('id, datum, capaciteit, actief, bestellen_tot').eq('groep', 'kerst-box').order('datum'),
            supabase.from('kerst_onderdelen').select('id, naam, soort, eenheid, per_persoon, per_persoon_vega, volgorde').order('volgorde').order('naam'),
        ]);
        const fout = [o, l, a, m, d].find((r) => r.error)?.error;
        if (fout) {
            /* Kolommen of tabel uit de Kerst-migratie ontbreken: zeg dat, niet een kale databasefout. */
            if (/column|relation|does not exist|schema cache/i.test(fout.message)) setMigratieOntbreekt(true);
            else melding(fout.message, 'error');
            return;
        }
        setMigratieOntbreekt(false);
        setOrders((o.data ?? []) as unknown as KerstOrderRij[]);
        setLeads((l.data ?? []) as KerstLead[]);
        setArtikelen((a.data ?? []) as ArtikelRij[]);
        setMomenten((m.data ?? []) as MomentRij[]);
        setOnderdelen(((d.data ?? []) as KerstOnderdeel[]).map((x) => ({
            ...x,
            per_persoon: x.per_persoon == null ? null : Number(x.per_persoon),
            per_persoon_vega: x.per_persoon_vega == null ? null : Number(x.per_persoon_vega),
        })));
    }, [melding]);

    useEffect(() => {
        if (!organization) return;
        let levend = true;
        laad().finally(() => { if (levend) setLaden(false); });
        return () => { levend = false; };
    }, [organization, laad]);

    const dagen = useMemo(() => [...new Set([...KERST_DAGEN, ...momenten.filter((m) => m.actief).map((m) => m.datum)])].sort(), [momenten]);
    const totalen = useMemo(() => kerstTotalen(orders.map((o) => ({ ...o, regels: o.winkel_order_regels })), dagen), [orders, dagen]);
    const actief = PANELEN.find((p) => p.key === paneel)!;
    const vegaArtikel = artikelen.find((a) => a.slug === KERST_SLUG.vega);

    return (
        <div className="ws-root kr-root" style={{ padding: '18px 32px 48px', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="ws-eyebrow" style={{ letterSpacing: '.16em' }}>Verkoop · Kerst-Box 2026</div>
                    <h1 className="ws-kop">Kerst</h1>
                    <div className="ws-onderschrift">{actief.onderschrift}</div>
                </div>
                {!laden && !migratieOntbreekt && (
                    <span className="ws-merk" title="Geldige bestellingen (niet geannuleerd)">
                        <b className="ws-mono">{totalen.totaal.orders}</b> bestellingen · <b className="ws-mono">{totalen.totaal.personen}</b> personen
                    </span>
                )}
            </div>

            <div className="ws-segment kr-niet-printen" role="tablist" aria-label="Kerst-onderdelen">
                {PANELEN.map((p) => <button key={p.key} type="button" role="tab" aria-selected={paneel === p.key} onClick={() => kies(p.key)}>{p.label}</button>)}
            </div>

            {laden ? (
                <div className="ws-leeg" style={{ padding: 24 }}>Laden…</div>
            ) : migratieOntbreekt ? (
                <div className="ws-banner" style={{ gridTemplateColumns: '1fr' }}>
                    <div>
                        <div className="ws-banner-titel">De database is nog niet bijgewerkt voor Kerst</div>
                        <div className="ws-onderschrift" style={{ marginTop: 4 }}>
                            De migratie <span className="ws-mono">20261005110000_kerst_bestellingen.sql</span> moet nog worden toegepast. Tot die tijd komen Kerst-bestellingen binnen als aanvraag (Verkoop → Aanvragen) en krijgt de klant wel zijn bevestiging.
                        </div>
                    </div>
                </div>
            ) : paneel === 'overzicht' ? (
                <Overzicht totalen={totalen} onderdelen={onderdelen} momenten={momenten} leads={leads} vegaApart={Boolean(vegaArtikel?.actief)} herlaad={laad} melding={melding} naarInhoud={() => kies('inhoud')} />
            ) : paneel === 'bestellingen' ? (
                <Bestellingen orders={orders} dagen={dagen} herlaad={laad} melding={melding} />
            ) : (
                <Inhoud onderdelen={onderdelen} artikelen={artikelen} herlaad={laad} melding={melding} />
            )}
        </div>
    );
}
