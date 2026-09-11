'use client';

/**
 * Publiek bestelformulier voor de gourmetbox.
 * Briefing §3 (velden en teksten), plan docs/bestelstroom-bouwplan.md.
 *
 * Mobiel eerst — mensen bestellen dit op hun telefoon, op de bank. Donker,
 * zoals de app.
 *
 * Vier schermen achter één route, want de API bepaalt welk van de vier aan de
 * beurt is:
 *   open          het formulier
 *   momenten_vol  alle momenten bezet, maar er zijn nog dozen → mail ons
 *   uitverkocht   de dozen zijn op → wachtlijst
 *   gesloten      er staat niets open, of we weten de doosmaat niet
 *
 * Wat hier NIET gebeurt: geen getal verzinnen. Ontbreekt de prijs, dan staat er
 * geen prijs. Ontbreekt de samenstelling, dan valt die regel weg. Een plausibel
 * getal is erger dan een leeg veld, want het ziet eruit alsof iemand het heeft
 * nagekeken.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEur } from '@/lib/format';
import {
    berekenDozen,
    samenstellingsZin,
    formatteerAfhaalmoment,
    formatteerDatum,
    kortTijd,
    type DoosOnderdeel,
} from '@/lib/bestelstroom';
import './bestellen.css';

interface Moment {
    id: string;
    datum: string;
    start_tijd: string;
    eind_tijd: string | null;
    vrij: number;
}

interface DoosType {
    id: string;
    slug: string;
    prijs_cents: number | null;
    personen_min: number | null;
    personen_max: number | null;
    personen_per_doos: number;
    titel: string | null;
    onderdelen: DoosOnderdeel[] | null;
}

/** "15:00 – 18:00", of alleen de starttijd als er geen eind is. */
function venster(m: Moment): string {
    const start = kortTijd(m.start_tijd);
    const eind = kortTijd(m.eind_tijd);
    if (!start) return '';
    return eind ? `${start} – ${eind}` : start;
}

export interface Config {
    bedrijfsnaam: string;
    telefoon: string | null;
    email: string | null;
    toestand: 'open' | 'momenten_vol' | 'uitverkocht' | 'gesloten';
    reden?: string;
    doostype?: DoosType;
    momenten?: Moment[];
    dozen_over?: number | null;
}

export default function BestelFormulier({ slug, dev = false }: { slug: string; dev?: boolean }) {
    const router = useRouter();

    const [config, setConfig] = useState<Config | null>(null);
    const [laden, setLaden] = useState(true);
    const [fout, setFout] = useState<string | null>(null);

    const [personen, setPersonen] = useState(6);
    const [naam, setNaam] = useState('');
    const [email, setEmail] = useState('');
    const [telefoon, setTelefoon] = useState('');
    const [momentId, setMomentId] = useState<string | null>(null);
    const [allergieAan, setAllergieAan] = useState(false);
    const [allergie, setAllergie] = useState('');
    const [akkoord, setAkkoord] = useState('');
    const [avg, setAvg] = useState(false);
    const [versturen, setVersturen] = useState(false);

    /* Eén sleutel per formulier-sessie: twee keer op de knop drukken mag geen
       tweede bestelling opleveren. Ververst de bezoeker de pagina, dan is het
       een nieuwe sessie — dat vangt de hub op als "mogelijk dubbel", want twee
       dozen voor één gezin kan echt. */
    const [sleutel] = useState(() => crypto.randomUUID());

    useEffect(() => {
        if (!slug) return;
        let levend = true;
        fetch(`/api/public-bestelling/${slug}${dev ? '?dev=1' : ''}`)
            .then((r) => r.json())
            .then((d) => { if (levend) setConfig(d); })
            .catch(() => { if (levend) setConfig(null); })
            .finally(() => { if (levend) setLaden(false); });
        return () => { levend = false; };
    }, [slug, dev]);

    const doostype = config?.doostype;
    const momenten = config?.momenten ?? [];

    const min = doostype?.personen_min ?? 1;
    const max = doostype?.personen_max ?? 40;

    const dozen = useMemo(
        () => berekenDozen(personen, doostype?.personen_per_doos) ?? 1,
        [personen, doostype?.personen_per_doos],
    );

    const zin = useMemo(
        () => samenstellingsZin(doostype?.onderdelen, personen),
        [doostype?.onderdelen, personen],
    );

    /* Een moment waar deze bestelling niet meer in past, is voor deze bezoeker
       vol. Zet iemand de teller van 8 naar 9, dan springt het aantal dozen van
       1 naar 2 en kan een moment op datzelfde scherm dichtvallen. */
    const momentVol = useCallback((m: Moment) => m.vrij < dozen, [dozen]);

    useEffect(() => {
        if (momentId && momenten.some((m) => m.id === momentId && momentVol(m))) setMomentId(null);
    }, [momentId, momenten, momentVol]);

    const totaal = doostype?.prijs_cents != null ? (doostype.prijs_cents * dozen) / 100 : null;

    async function verstuur(e: React.FormEvent) {
        e.preventDefault();
        if (!doostype || !momentId || versturen) return;
        setFout(null);
        setVersturen(true);
        try {
            const res = await fetch(`/api/public-bestelling/${slug}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doos_type_id: doostype.id,
                    afhaalmoment_id: momentId,
                    personen,
                    naam,
                    email,
                    telefoon,
                    allergie_notitie: allergieAan ? allergie : '',
                    gdpr_consent: avg,
                    idempotency_key: sleutel,
                    website: akkoord,
                }),
            });
            const d = await res.json();
            if (!res.ok) {
                setFout(d?.error === 'validation'
                    ? 'Er ontbreekt nog iets. Loop de velden even na.'
                    : (d?.error ?? 'Je bestelling is niet opgeslagen. Probeer het nog een keer, of bel ons.'));
                setVersturen(false);
                /* Capaciteit is verschoven terwijl dit formulier openstond:
                   opnieuw ophalen, zodat de bezoeker de juiste momenten ziet. */
                if (d?.code === 'BB001' || d?.code === 'BB003' || d?.code === 'BB002') {
                    fetch(`/api/public-bestelling/${slug}${dev ? '?dev=1' : ''}`).then((r) => r.json()).then(setConfig).catch(() => {});
                }
                return;
            }

            /* Het bevestigingsscherm mag geen persoonsgegevens uit de URL lezen.
               Wat er te tonen valt gaat via sessionStorage; is dat leeg (directe
               link, andere tab), dan toont /gelukt de neutrale versie. */
            const moment = momenten.find((m) => m.id === momentId);
            try {
                sessionStorage.setItem('hb-bestelling', JSON.stringify({
                    personen,
                    dozen,
                    moment: moment ? formatteerAfhaalmoment(moment.datum, moment.start_tijd) : null,
                    titel: doostype.titel,
                }));
            } catch { /* privémodus: dan gewoon de neutrale versie */ }

            router.push(`/bestellen/${slug}/gelukt`);
        } catch {
            setFout('Je bestelling is niet opgeslagen. Probeer het nog een keer, of bel ons.');
            setVersturen(false);
        }
    }

    if (laden) {
        return <div className="hb"><div className="hb-wrap"><p className="hb-klein">Even geduld…</p></div></div>;
    }

    if (!config) {
        return (
            <div className="hb"><div className="hb-wrap">
                <h1 className="hb-kop hb-kop-groot">Deze pagina kunnen we niet laden</h1>
                <p className="hb-uitleg">Probeer het zo nog een keer.</p>
            </div></div>
        );
    }

    if (config.toestand !== 'open' || !doostype) {
        return <GeslotenScherm config={config} slug={slug} />;
    }

    return (
        <div className="hb">
            <div className="hb-wrap">
                <header className="hb-hoofd">
                    <span className="hb-label">Bestellen</span>
                    <h1 className="hb-kop hb-kop-groot">{doostype.titel || 'De Eettocht'}</h1>
                    <p className="hb-uitleg">
                        Kies met hoeveel jullie zijn en wanneer je hem ophaalt. De rest doen wij.
                    </p>
                </header>

                <form onSubmit={verstuur} noValidate>
                    {fout && <div className="hb-fout" role="alert">{fout}</div>}

                    {/* 1 · Aantal personen */}
                    <div className="hb-blok">
                        <span className="hb-label" id="lbl-personen">Aantal personen</span>
                        <div className="hb-teller">
                            <button type="button" className="hb-teller-knop" aria-label="Eén persoon minder"
                                disabled={personen <= min}
                                onClick={() => setPersonen((p) => Math.max(min, p - 1))}>−</button>
                            <div className="hb-teller-waarde" aria-live="polite">
                                {personen}
                                <span>{dozen === 1 ? 'één doos' : `${dozen} dozen`}</span>
                            </div>
                            <button type="button" className="hb-teller-knop" aria-label="Eén persoon meer"
                                disabled={personen >= max}
                                onClick={() => setPersonen((p) => Math.min(max, p + 1))}>+</button>
                        </div>
                        {/* Valt weg zodra we de samenstelling niet kennen — nooit een
                            geraden aantal stukjes. */}
                        {zin && <p className="hb-klein hb-hint">Dat is {zin}</p>}
                    </div>

                    {/* 2 · Naam */}
                    <div className="hb-veld">
                        <label className="hb-label" htmlFor="naam">Naam</label>
                        <input id="naam" type="text" required autoComplete="name" maxLength={200}
                            value={naam} onChange={(e) => setNaam(e.target.value)} />
                        <p className="hb-klein hb-hint">Je volledige naam — die komt op de doos.</p>
                    </div>

                    {/* 3 · E-mail */}
                    <div className="hb-veld">
                        <label className="hb-label" htmlFor="email">E-mail</label>
                        <input id="email" type="email" required autoComplete="email" maxLength={200}
                            value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>

                    {/* 4 · Telefoon — mensen geven hun nummer makkelijker als ze
                        weten waarom. */}
                    <div className="hb-veld">
                        <label className="hb-label" htmlFor="telefoon">Telefoon</label>
                        <input id="telefoon" type="tel" autoComplete="tel" maxLength={50}
                            value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
                        <p className="hb-klein hb-hint">Voor als er iets is met je bestelling.</p>
                    </div>

                    <hr className="hb-streep" />

                    {/* 5 · Afhaalmoment */}
                    <div className="hb-blok">
                        <span className="hb-label">Afhaalmoment</span>
                        <div className="hb-momenten">
                            {momenten.map((m) => {
                                const vol = momentVol(m);
                                const tekst = formatteerDatum(m.datum);
                                return (
                                    <button key={m.id} type="button" className="hb-moment"
                                        disabled={vol}
                                        aria-pressed={momentId === m.id}
                                        onClick={() => setMomentId(m.id)}>
                                        <b>{tekst ?? 'Onbekend moment'}</b>
                                        {/* Open of vol — geen aantallen. Hoeveel er nog
                                            zijn is onze zorg, niet die van de klant. */}
                                        <small>{vol ? 'vol' : venster(m)}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 6 · Allergieën */}
                    <div className="hb-blok">
                        <label className="hb-vink">
                            <input type="checkbox" checked={allergieAan}
                                onChange={(e) => setAllergieAan(e.target.checked)} />
                            <span>Ik wil iets doorgeven over allergieën</span>
                        </label>
                        {allergieAan && (
                            <div className="hb-veld" style={{ marginTop: 12 }}>
                                <textarea maxLength={2000} value={allergie}
                                    onChange={(e) => setAllergie(e.target.value)}
                                    aria-label="Wat wil je doorgeven over allergieën?" />
                                {/* Niet vrijblijvend: dit is wat we wél en niet kunnen. */}
                                <p className="hb-klein hb-hint">
                                    We kunnen de doos niet allergeenvrij maken, maar we bellen je als er iets niet kan.
                                    Je notitie wordt gelezen voordat we je bestelling bevestigen, en zes maanden na het
                                    afhalen gewist.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="hb-blok">
                        <label className="hb-vink">
                            <input type="checkbox" checked={avg} onChange={(e) => setAvg(e.target.checked)} />
                            <span>
                                Ik ga akkoord met de <a href="/legal" target="_blank" rel="noreferrer">privacyvoorwaarden</a>.
                            </span>
                        </label>
                    </div>

                    {/* Honeypot */}
                    <div className="hb-honing" aria-hidden="true">
                        <label htmlFor="website">Website</label>
                        <input id="website" type="text" tabIndex={-1} autoComplete="off"
                            value={akkoord} onChange={(e) => setAkkoord(e.target.value)} />
                    </div>

                    <hr className="hb-streep" />

                    <div className="hb-totaal">
                        <span>{personen} personen <em>· {dozen === 1 ? 'één doos' : `${dozen} dozen`}</em></span>
                        {/* Geen prijs bekend? Dan staat er niets — geen € 0,00. */}
                        {totaal != null && <span>{formatEur(totaal)}</span>}
                    </div>

                    <button type="submit" className="hb-knop"
                        disabled={versturen || !momentId || !naam.trim() || !email.trim() || !avg}>
                        {versturen ? 'Bezig…' : 'Bestellen'}
                    </button>

                    {totaal != null && (
                        <p className="hb-klein hb-rest">Je krijgt een betaalverzoek van ons.</p>
                    )}
                </form>

                <footer className="hb-voet">
                    <span className="hb-label">{config.bedrijfsnaam}</span>
                </footer>
            </div>
        </div>
    );
}

/* ── De drie gesloten schermen ───────────────────────────────────────────── */

export function GeslotenScherm({ config, slug }: { config: Config; slug: string }) {
    if (config.toestand === 'momenten_vol') {
        return (
            <div className="hb"><div className="hb-wrap">
                <span className="hb-label">Bestellen</span>
                <h1 className="hb-kop hb-kop-groot">Alle afhaalmomenten zijn bezet</h1>
                <p className="hb-uitleg">
                    Mail ons even — kunnen er genoeg mensen op een ander moment, dan zetten we er een bij.
                </p>
                {config.email && (
                    <p style={{ marginTop: 22 }}>
                        <a href={`mailto:${config.email}?subject=${encodeURIComponent('Ander afhaalmoment')}`}>
                            {config.email}
                        </a>
                    </p>
                )}
            </div></div>
        );
    }

    if (config.toestand === 'uitverkocht' && config.doostype) {
        return <Wachtlijst config={config} slug={slug} />;
    }

    return (
        <div className="hb"><div className="hb-wrap">
            <span className="hb-label">Bestellen</span>
            <h1 className="hb-kop hb-kop-groot">Er staat nu geen bestelling open</h1>
            <p className="hb-uitleg">
                Zodra er weer besteld kan worden, staat het hier.
                {config.telefoon ? ' Iets dringends? Bel ons even.' : ''}
            </p>
            {config.telefoon && <p style={{ marginTop: 18 }}><a href={`tel:${config.telefoon}`}>{config.telefoon}</a></p>}
        </div></div>
    );
}

function Wachtlijst({ config, slug }: { config: Config; slug: string }) {
    const [email, setEmail] = useState('');
    const [avg, setAvg] = useState(false);
    const [akkoord, setAkkoord] = useState('');
    const [bezig, setBezig] = useState(false);
    const [gelukt, setGelukt] = useState(false);
    const [fout, setFout] = useState<string | null>(null);

    async function verstuur(e: React.FormEvent) {
        e.preventDefault();
        if (bezig || !config.doostype) return;
        setBezig(true);
        setFout(null);
        try {
            const res = await fetch(`/api/public-wachtlijst/${slug}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doos_type_id: config.doostype.id,
                    email,
                    gdpr_consent: avg,
                    website: akkoord,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setFout(d?.error ?? 'Je adres is niet opgeslagen. Probeer het nog een keer.'); setBezig(false); return; }
            setGelukt(true);
        } catch {
            setFout('Je adres is niet opgeslagen. Probeer het nog een keer.');
            setBezig(false);
        }
    }

    return (
        <div className="hb"><div className="hb-wrap">
            <span className="hb-label">Uitverkocht</span>
            <h1 className="hb-kop hb-kop-groot">De dozen zijn op</h1>
            <p className="hb-uitleg">
                We maken er een vast aantal, want alles gaat door één paar handen. Laat je mailadres
                achter en je krijgt één bericht zodra de bestelling volgend jaar opengaat. Verder niets.
            </p>

            {gelukt ? (
                <p className="hb-uitleg" style={{ marginTop: 26 }} role="status">
                    Genoteerd. Je hoort één keer van ons.
                </p>
            ) : (
                <form onSubmit={verstuur} noValidate style={{ marginTop: 26 }}>
                    {fout && <div className="hb-fout" role="alert">{fout}</div>}
                    <div className="hb-veld">
                        <label className="hb-label" htmlFor="wl-email">E-mail</label>
                        <input id="wl-email" type="email" required autoComplete="email" maxLength={200}
                            value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="hb-blok">
                        <label className="hb-vink">
                            <input type="checkbox" checked={avg} onChange={(e) => setAvg(e.target.checked)} />
                            <span>
                                Ik ga akkoord met de <a href="/legal" target="_blank" rel="noreferrer">privacyvoorwaarden</a>.
                            </span>
                        </label>
                    </div>
                    <div className="hb-honing" aria-hidden="true">
                        <label htmlFor="wl-website">Website</label>
                        <input id="wl-website" type="text" tabIndex={-1} autoComplete="off"
                            value={akkoord} onChange={(e) => setAkkoord(e.target.value)} />
                    </div>
                    <button type="submit" className="hb-knop" disabled={bezig || !email.trim() || !avg}>
                        {bezig ? 'Bezig…' : 'Hou me op de hoogte'}
                    </button>
                </form>
            )}
        </div></div>
    );
}
