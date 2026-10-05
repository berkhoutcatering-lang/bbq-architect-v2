'use client';

/**
 * Apart zetten — de wegzet-taken (BA-6, plan v5 §M1).
 *
 * Losse winkelwaar uit de webshop (artikel met afhandeling 'wegzetten') die na
 * betaling nog uit het schap moet: "4 × Naober voor Jansen". Eén regel per
 * order; afvinken zet alles van die order in één keer apart en boekt de
 * voorraad af (verkoop_online). Ligt er te weinig, dan weigert de database
 * (WV010) en is er niets geboekt. Rood = ophalen binnen 24 uur. Op dezelfde
 * dag kun je het ongedaan maken; na ophalen niet meer (WV011).
 *
 * De taken komen uit de view winkel_wegzet_taken (RLS via security_invoker).
 * Wat vandaag apart is gezet, leidt het paneel af uit de orders die de pagina
 * al heeft (vandaagApartGezet, dezelfde regel als de database).
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Timer } from 'lucide-react';
import Button from '@/components/Button';
import {
    afhaalTekst, isRood, productKort, taakTekst, vandaagApartGezet, wegzetProducten,
    type ApartGezet, type WegzetTaak,
} from '@/lib/winkel/wegzetten';
import type { ArtikelRij, OrderRij } from '../_lib/vakjes';
import { zetOrderApart, zetOrderApartTerug } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Props {
    /** De open wegzet-taken uit winkel_wegzet_taken. */
    taken: WegzetTaak[];
    orders: OrderRij[];
    artikelen: ArtikelRij[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

const tijdstip = (iso: string) =>
    new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

export default function ApartZettenPaneel({ taken, orders, artikelen, herlaad, melding }: Props) {
    const [bezig, setBezig] = useState<string | null>(null);
    /* De klok voor "binnen 24 uur": loopt door terwijl het scherm openstaat. */
    const [nu, setNu] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNu(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    const wegzetIds = useMemo(() => new Set(artikelen.filter((a) => a.afhandeling === 'wegzetten').map((a) => a.id)), [artikelen]);
    const vandaag = useMemo(() => vandaagApartGezet(orders, wegzetIds, nu), [orders, wegzetIds, nu]);
    const rood = taken.filter((t) => isRood(t, nu)).length;

    async function apart(t: WegzetTaak) {
        setBezig(`apart:${t.order_id}`);
        try {
            const r = await zetOrderApart({ orderId: t.order_id });
            if ('error' in r) { melding(r.error, 'error'); return; }
            if (r.data.uitkomst === 'al_apart') melding(`${t.nummer} stond al apart.`, 'info');
            else if (r.data.uitkomst === 'geen_taak') melding(`${t.nummer} heeft niets om apart te zetten.`, 'info');
            else melding(`${t.nummer} apart gezet: ${wegzetProducten(t).map(productKort).join(', ')} van de voorraad af.`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    async function terug(a: ApartGezet) {
        setBezig(`terug:${a.order_id}`);
        try {
            const r = await zetOrderApartTerug({ orderId: a.order_id });
            if ('error' in r) { melding(r.error, 'error'); return; }
            if (r.data.uitkomst === 'niet_apart') melding(`${a.nummer} stond niet (meer) apart.`, 'info');
            else melding(`${a.nummer} terug op het schap; de taak staat weer open.`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    return (
        <>
            {(taken.length > 0 || rood > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="ws-teller" style={{ cursor: 'default' }}><b>{taken.length}</b> {taken.length === 1 ? 'order' : 'orders'} apart te zetten</span>
                    {rood > 0 && <span className="ws-teller ws-teller-vuur" style={{ cursor: 'default' }}><b>{rood}</b> binnen 24 uur</span>}
                </div>
            )}

            <div className="panel ws-apart" style={{ padding: '4px 20px' }}>
                {taken.length === 0 && (
                    <div className="ws-leeg" style={{ padding: '20px 0', textWrap: 'pretty' }}>
                        Niets apart te zetten.{' '}
                        {wegzetIds.size === 0
                            ? 'Nog geen artikel wordt uit het schap apart gezet: kies dat bij een artikel onder Artikelen, bij Klaarmaken.'
                            : 'Zodra een webshoporder met losse winkelwaar betaald is, staat hij hier.'}
                    </div>
                )}
                {taken.map((t) => {
                    const isBezig = bezig === `apart:${t.order_id}`;
                    const isRoodNu = isRood(t, nu);
                    const voorbij = t.afhaalmoment != null && new Date(t.afhaalmoment).getTime() < nu.getTime();
                    return (
                        <div key={t.order_id} className="ws-klaar">
                            <button type="button" className="ws-vink" role="checkbox" aria-checked={false} aria-label={taakTekst(t)} disabled={bezig !== null} onClick={() => apart(t)}>
                                <span>{isBezig ? <Loader2 size={14} style={{ color: 'var(--muted)' }} /> : null}</span>
                            </button>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
                                <div className="ws-klaar-titel">{wegzetProducten(t).map(productKort).join(' · ')}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    {t.naam} · <span className="ws-mono">{t.nummer}</span> · ophalen {afhaalTekst(t.afhaalmoment)}
                                </div>
                                {t.regels.length > 1 && (
                                    <div className="ws-order-wat">{t.regels.map((r) => `${r.aantal}× ${r.artikel}`).join(' · ')}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {isRoodNu && <span className="ws-merk ws-merk-vuur"><Timer size={13} />{voorbij ? 'ophalen voorbij' : 'binnen 24 uur'}</span>}
                                <Button icon={<Check size={14} />} loading={isBezig} disabled={bezig !== null && !isBezig} onClick={() => apart(t)}>Apart gezet</Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {vandaag.length > 0 && (
                <>
                    <div className="ws-eyebrow" style={{ marginTop: 6 }}>Vandaag apart gezet · {vandaag.length}</div>
                    <div className="ws-onderschrift" style={{ marginTop: -10 }}>Vergist? Vandaag kun je het nog ongedaan maken; de voorraad gaat terug op het schap. Na ophalen niet meer.</div>
                    <div className="panel ws-apart" style={{ padding: '4px 20px' }}>
                        {vandaag.map((a) => {
                            const isBezig = bezig === `terug:${a.order_id}`;
                            return (
                                <div key={a.order_id} className="ws-klaar ws-klaar-af">
                                    <button type="button" className="ws-vink" role="checkbox" aria-checked={true} aria-label={`${a.nummer} terug op het schap`} disabled={bezig !== null} onClick={() => terug(a)}>
                                        <span>{isBezig ? <Loader2 size={14} style={{ color: 'var(--muted)' }} /> : <Check size={15} />}</span>
                                    </button>
                                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
                                        <div className="ws-klaar-titel">{a.regels.map((r) => `${r.aantal}× ${r.artikel}`).join(' · ')}</div>
                                        <div style={{ fontSize: 12 }}>{a.naam} · <span className="ws-mono">{a.nummer}</span> · apart gezet {tijdstip(a.apart_gezet_at)}</div>
                                    </div>
                                    <div style={{ paddingTop: 4 }}>
                                        <Button variant="ghost" icon={<RotateCcw size={14} />} loading={isBezig} disabled={bezig !== null && !isBezig} onClick={() => terug(a)}>Ongedaan maken</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </>
    );
}
