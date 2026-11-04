'use client';

/**
 * Leveringen: wat er binnenkomt en wat er ligt. Eén knop om een levering te
 * melden (rechter-lade), daaronder de datums, daaronder de open leveringen.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import { useToast } from '@/components/Toast';
import type { PartijRij } from '@/lib/winkel/winkelOverzicht';
import { sluitPartij } from '../actions';
import BinnenLade, { type BinnenProduct } from './BinnenClient';
import DatumLijst, { type Groep } from './DatumsClient';

const datumKort = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

export default function LeveringenClient({ openBinnen, producten, leveranciers, partijen, groepen, ontbreekt }: {
    openBinnen: boolean;
    producten: BinnenProduct[];
    leveranciers: { id: number; naam: string }[];
    partijen: (PartijRij & { product: string; gestickerd: number })[];
    groepen: Groep[];
    ontbreekt: boolean;
}) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const [binnen, setBinnen] = useState(openBinnen && producten.length > 0);
    const leeg = producten.length === 0 && groepen.length === 0 && partijen.length === 0;

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Leveringen</h1>
                    <div className="wk-onder">Wat je weegt en stickert: wat er binnenkwam en wat er ligt.</div>
                </div>
                {producten.length > 0 && !ontbreekt && (
                    <button type="button" className="btn btn-brand btn-touch" onClick={() => setBinnen(true)}><Truck size={16} /> Levering binnenmelden</button>
                )}
            </div>

            {ontbreekt ? (
                <div className="kf-empty"><p>Leveringen en datums komen er zodra de update voor stickers draait (migratie 20261103120000).</p></div>
            ) : leeg ? (
                <div className="kf-empty"><p>Er staat nog niets op gewicht. Voeg bij <Link href="/voorraad/winkel" style={{ color: 'var(--brand-gold, #c4a35a)' }}>Assortiment</Link> een product toe met "Op gewicht", dan meld je hier de leveringen.</p></div>
            ) : (
                <>
                    <DatumLijst groepen={groepen} />

                    {partijen.length > 0 && (
                        <>
                            <div className="wk-sectie">Open leveringen (te kiezen bij het stickeren)</div>
                            <div className="wk-lijst">
                                {partijen.map((x) => (
                                    <div key={x.id} className="wk-rij" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'default' }}>
                                        <span style={{ minWidth: 0 }}>
                                            <span className="wk-naam" style={{ display: 'block' }}>{x.product}</span>
                                            <span className="wk-klein" style={{ display: 'block' }}>{x.leverancier ?? 'Levering'} van {datumKort(x.geleverd_op)} · THT {datumKort(x.tht)} · {x.gestickerd} gestickerd</span>
                                        </span>
                                        <button type="button" className="btn btn-ghost" disabled={bezig} onClick={() => start(async () => {
                                            const r = await sluitPartij({ id: x.id });
                                            if ('error' in r) { toast(r.error, 'error'); return; }
                                            toast('Levering afgesloten: hij staat niet meer in de keuze bij het stickeren.', 'success');
                                            router.refresh();
                                        })}>Afsluiten</button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}

            {binnen && <BinnenLade producten={producten} leveranciers={leveranciers} onClose={() => setBinnen(false)} />}
        </div>
    );
}
