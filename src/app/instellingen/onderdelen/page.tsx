'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { refreshSettings } from '@/lib/useSupabase';
import { useOnderdelen } from '@/lib/useOnderdelen';
import { VASTE_TABS, navSections } from '@/lib/navigation';
import { zetVerborgenOnderdelen } from './actions';
import './onderdelen.css';

/**
 * /instellingen/onderdelen — zet onderdelen die je bedrijf niet gebruikt uit.
 *
 * Zoals apps in Odoo: een foodtruck heeft geen Webshop of Boekhouder nodig.
 * Uitzetten verbergt het onderdeel uit het tegelscherm, de werkruimtebalk, de
 * onderbalk en het zoekvenster. Er wordt niets verwijderd: gegevens blijven
 * staan, een directe link blijft werken, en weer aanzetten zet alles terug.
 *
 * Elke schakelaar slaat meteen op. Alleen de rol Admin kan schakelen.
 */
export default function OnderdelenPagina() {
    const { orgId, isAdmin } = useOrg();
    const { verborgen: opgeslagen, opties, loading } = useOnderdelen();
    const showToast = useToast();
    /* Lokale stand, zodat een tik meteen zichtbaar is; null = volg de
       opgeslagen stand. */
    const [lokaal, setLokaal] = useState<string[] | null>(null);
    const [bezig, setBezig] = useState(false);
    const volgnummer = useRef(0);
    const verborgen = lokaal ?? opgeslagen;

    async function bewaar(nieuw: string[]) {
        if (!orgId) return;
        setLokaal(nieuw);
        setBezig(true);
        const mijn = ++volgnummer.current;
        const uitkomst = await zetVerborgenOnderdelen({ orgId, verborgen: nieuw });
        /* Snel achter elkaar schakelen: alleen de laatste telt. */
        if (mijn !== volgnummer.current) return;
        setBezig(false);
        if ('error' in uitkomst) {
            setLokaal(null);
            showToast('Niet opgeslagen: ' + uitkomst.error, 'error');
            return;
        }
        await refreshSettings(orgId);
        setLokaal(null);
    }

    function wissel(sleutel: string) {
        const nu = verborgen.includes(sleutel);
        void bewaar(nu ? verborgen.filter(function (k) { return k !== sleutel; }) : verborgen.concat([sleutel]));
    }

    const werkruimtes = navSections;
    const aantalUit = werkruimtes.filter(function (s) { return !s.vast && verborgen.includes(s.slug); }).length;

    return (
        <div className="main-content od-pagina">
            <Link href="/instellingen" className="od-terug">
                <ArrowLeft size={16} /> Instellingen
            </Link>
            <PageHeader
                title="Onderdelen"
                description="Zet uit wat je bedrijf niet gebruikt. Het verdwijnt uit het tegelscherm, de balk en het zoekvenster — er gaat niets verloren, en aanzetten zet alles terug."
                actions={<span className="od-status" aria-live="polite">{bezig ? 'Opslaan…' : aantalUit > 0 ? aantalUit + ' onderdeel' + (aantalUit === 1 ? '' : 'en') + ' uit' : 'Alles staat aan'}</span>}
            />

            {!isAdmin && (
                <div className="od-melding" role="note">
                    <Lock size={16} /> Alleen een beheerder (rol Admin) kan onderdelen aan- of uitzetten. Je ziet hier hoe het nu staat.
                </div>
            )}

            {loading ? (
                <div className="od-laden">Laden…</div>
            ) : (
                <div className="od-lijst">
                    {werkruimtes.map(function (s) {
                        const hubAan = s.vast || !verborgen.includes(s.slug);
                        const tabs = s.children.filter(function (c) { return !c.adminOnly || opties.isPlatformAdmin; });
                        return (
                            <section key={s.slug} className={'od-kaart' + (hubAan ? '' : ' od-kaart--uit')} style={{ ['--wr-kleur' as string]: s.kleur }}>
                                <div className="od-kop">
                                    <span className="od-icoon" aria-hidden="true">{s.icon}</span>
                                    <div className="od-tekst">
                                        <h2 className="od-naam">{s.title}</h2>
                                        <p className="od-uitleg">{s.description}</p>
                                    </div>
                                    {s.vast ? (
                                        <span className="od-vast" title="Moet altijd bereikbaar blijven"><Lock size={14} /> Altijd aan</span>
                                    ) : (
                                        <Schakelaar
                                            aan={hubAan}
                                            label={s.title}
                                            uitgeschakeld={!isAdmin}
                                            onWissel={function () { wissel(s.slug); }}
                                        />
                                    )}
                                </div>
                                <ul className="od-tabs">
                                    {tabs.map(function (c) {
                                        const vast = VASTE_TABS.has(c.href) || !!c.adminOnly;
                                        const aan = vast || !verborgen.includes(c.href);
                                        return (
                                            <li key={c.href} className="od-tab">
                                                <span className="od-tab-icoon" aria-hidden="true">{c.icon}</span>
                                                <span className="od-tab-naam">{c.label}</span>
                                                {vast ? (
                                                    <span className="od-vast"><Lock size={12} /> Vast</span>
                                                ) : (
                                                    <Schakelaar
                                                        klein
                                                        aan={aan && hubAan}
                                                        label={s.title + ' — ' + c.label}
                                                        uitgeschakeld={!isAdmin || !hubAan}
                                                        onWissel={function () { wissel(c.href); }}
                                                    />
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Schakelaar({ aan, label, uitgeschakeld, klein, onWissel }: {
    aan: boolean;
    label: string;
    uitgeschakeld?: boolean;
    klein?: boolean;
    onWissel: () => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={aan}
            aria-label={label + (aan ? ' staat aan' : ' staat uit')}
            disabled={uitgeschakeld}
            onClick={onWissel}
            className={'od-schakelaar' + (aan ? ' od-schakelaar--aan' : '') + (klein ? ' od-schakelaar--klein' : '')}
        >
            <span className="od-schakelaar-knop" />
        </button>
    );
}
