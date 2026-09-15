'use client';

/**
 * Recept uit een boek → jouw receptuur.
 *
 * Drie schermen achter elkaar: foto's kiezen, wachten, en dan de goedkeur-lade.
 * Die laatste is waar het om gaat — daar zie je wat er vertaald is, wat er
 * vervallen is en waarom, en wat er nog beslist moet worden. Pas als dat leeg
 * is, gaat de opslaan-knop van het slot.
 *
 * Vormgeving volgt `docs/receptuur-designprompt.md` en het ontwerp dat daaruit
 * kwam. Twee dingen daaruit zitten hier: een beantwoorde beslissing krimpt tot
 * één regel met het antwoord ernaast, en alleen de bovenste openstaande vraag
 * krijgt amber. Anders wordt de lade een muur van waarschuwingen en leest
 * niemand hem meer.
 *
 * De foto's gaan niet de opslag in. Ze worden verkleind, verstuurd, gelezen en
 * vergeten. Alleen jouw eigen vertaalde receptuur blijft achter.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ReceptuurLijst, { type DeelRegel, type StapChip, type StapRegel } from '../../_components/ReceptuurLijst';
import { AllergenConfirmModal, type AllergenRow } from '@/components/menu/AllergenConfirmModal';
import { ALLERGENEN } from '@/lib/constants';
import { allergeenCodesNaarWoorden } from '@/lib/allergenCodes';
import { supabase } from '@/lib/supabase';
import {
    openstaandeVragen,
    metKeuzesVerwerkt,
    soortVraag,
    type Controle,
    type GecontroleerdeStap,
    type Antwoorden,
} from '@/lib/keukenplanner/ontleder';

type Fase = 'kiezen' | 'bezig' | 'nakijken';

/* Golf 5 — één receptuur-pijplijn. Bedenk met AI levert zijn recept hier af
   (sessionStorage), en een bestaand gerecht komt via ?gerecht=<id>. In beide
   gevallen slaan we de foto-stap over: het recept is er al, alleen de
   werkwijze (micro-stappen op onze apparatuur) ontbreekt nog. */
export const ONTLEDEN_OVERDRACHT = 'ontleden:van-bedenk';
export interface Overdracht {
    naam: string;
    /** Het recept als tekst: ingrediënten + bereiding, zoals de ontleder een boekpagina leest. */
    tekst: string;
    /** Velden die op het gerecht komen (ingredient_costs mét prijs, pitch, battle plan …). */
    extra: Record<string, unknown>;
    /** Voor de allergeencheck na opslaan. */
    ingredientNamen: string[];
}

interface Herkomst {
    soort: 'bedenk' | 'bestaand';
    naam: string;
    gerechtId?: string;
    bestaandeStappen?: number;
    extra: Record<string, unknown>;
    ingredientNamen: string[];
}

/** Eenheden die de rest van de app kent — dezelfde lijst als de opslagroute. */
const EENHEDEN = ['g', 'kg', 'ml', 'l', 'stuk'] as const;

interface Invulling {
    antwoorden: Antwoorden;
    /** Eenheid per component die aangemaakt gaat worden. */
    eenheden: Record<string, string>;
}

const LEEG: Invulling = {
    antwoorden: {
        herhaalDuren: {}, akkoordOndanks: [],
        componenten: [], componentenOvergeslagen: [], keuzes: {},
    },
    eenheden: {},
};

/* ── Kleuren, uit het ontwerpsysteem ────────────────────────────── */

const KLEUR = {
    paneel: '#1e1e22',
    lijn: 'rgba(245,245,245,.10)',
    lijnZacht: 'rgba(245,245,245,.07)',
    goudlijn: 'rgba(196,163,90,.22)',
    gedempt: '#8a8f98',
    amber: '#FFBF00',
    amberZacht: 'rgba(255,191,0,.14)',
} as const;

export default function OntledenClient() {
    const [fase, setFase] = useState<Fase>('kiezen');
    const [fotos, setFotos] = useState<string[]>([]);
    /* Een gerecht in woorden, als er geen kookboekpagina is. */
    const [idee, setIdee] = useState('');
    const [opmerking, setOpmerking] = useState('');
    const [controle, setControle] = useState<Controle | null>(null);
    const [kosten, setKosten] = useState<{ centen: number } | null>(null);
    const [fout, setFout] = useState<string | null>(null);
    const [invulling, setInvulling] = useState<Invulling>(LEEG);
    const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);
    const [resultaat, setResultaat] = useState<{ gerechtId: string; waarschuwing: string | null } | null>(null);
    const [herkomst, setHerkomst] = useState<Herkomst | null>(null);
    const [allergeenRijen, setAllergeenRijen] = useState<AllergenRow[]>([]);
    const searchParams = useSearchParams();
    const gerechtParam = searchParams.get('gerecht');

    /* Overdracht uit Bedenk met AI of een bestaand gerecht: meteen ontleden. */
    useEffect(() => {
        let gestart = false;
        const vanBedenk = (() => {
            try {
                const raw = sessionStorage.getItem(ONTLEDEN_OVERDRACHT);
                if (!raw) return null;
                sessionStorage.removeItem(ONTLEDEN_OVERDRACHT);
                return JSON.parse(raw) as Overdracht;
            } catch { return null; }
        })();
        if (vanBedenk && vanBedenk.tekst) {
            gestart = true;
            setHerkomst({ soort: 'bedenk', naam: vanBedenk.naam, extra: vanBedenk.extra ?? {}, ingredientNamen: vanBedenk.ingredientNamen ?? [] });
            setIdee(vanBedenk.tekst);
            void ontleed(undefined, {
                beschrijving: vanBedenk.tekst,
                opmerking: 'Dit recept is al bedacht en goedgekeurd. Schrijf het op onze werkwijze; verander de ingrediënten en hoeveelheden niet en verzin er geen bij.',
            });
        }
        if (!gestart && gerechtParam) {
            void (async () => {
                const { data: g } = await supabase
                    .from('gerechten')
                    .select('id, naam, beschrijving, bereidingswijze, ingredienten, ingredient_costs, porties')
                    .eq('id', gerechtParam)
                    .maybeSingle();
                if (!g) { setFout('Gerecht niet gevonden'); return; }
                const { count } = await supabase
                    .from('recipe_steps').select('id', { count: 'exact', head: true }).eq('gerecht_id', g.id);
                const costs: Array<{ naam?: string; qty_pp?: number; unit?: string }> = Array.isArray(g.ingredient_costs) ? g.ingredient_costs : [];
                const ingr = costs.length > 0
                    ? costs.map((c) => [c.qty_pp && c.unit ? `${c.qty_pp} ${c.unit} p.p.` : '', c.naam].filter(Boolean).join(' '))
                    : (Array.isArray(g.ingredienten) ? g.ingredienten : []);
                const tekst = [
                    `Recept: ${g.naam}`,
                    g.beschrijving ? `${g.beschrijving}` : '',
                    g.porties ? `Voor ${g.porties} porties.` : '',
                    ingr.length ? `\nIngrediënten:\n${ingr.map((i: string) => `- ${i}`).join('\n')}` : '',
                    g.bereidingswijze ? `\nBereiding:\n${g.bereidingswijze}` : '',
                ].filter(Boolean).join('\n');
                setHerkomst({
                    soort: 'bestaand', naam: g.naam, gerechtId: String(g.id), bestaandeStappen: count ?? 0,
                    extra: {}, ingredientNamen: costs.map((c) => c.naam ?? '').filter(Boolean),
                });
                setIdee(tekst);
                void ontleed(undefined, {
                    beschrijving: tekst,
                    opmerking: 'Dit gerecht bestaat al. Schrijf de bereiding op onze werkwijze; verander de ingrediënten en hoeveelheden niet.',
                });
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gerechtParam]);
    const invoer = useRef<HTMLInputElement>(null);

    const kiesBestanden = useCallback(async (lijst: FileList | null) => {
        if (!lijst) return;
        setFout(null);
        const nieuw: string[] = [];
        for (const bestand of Array.from(lijst).slice(0, 6)) {
            try {
                nieuw.push(await verklein(bestand));
            } catch {
                setFout(`${bestand.name} kon niet gelezen worden`);
            }
        }
        setFotos((b) => [...b, ...nieuw].slice(0, 6));
    }, []);

    /* `welkRecept` is gevuld als de kok het tweede recept van dezelfde pagina
       laat lezen. Dezelfde foto's, andere opdracht — geen nieuwe foto nodig. */
    async function ontleed(welkRecept?: string, overdracht?: { beschrijving: string; opmerking: string }) {
        setFase('bezig');
        setFout(null);
        try {
            const res = await fetch('/api/recipe/ontleed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(overdracht ? {
                    fotos: [],
                    beschrijving: overdracht.beschrijving,
                    opmerking: overdracht.opmerking,
                } : {
                    fotos,
                    beschrijving: idee,
                    opmerking: welkRecept
                        ? `Werk nu het recept "${welkRecept}" uit van deze pagina, niet het andere.${opmerking ? ` ${opmerking}` : ''}`
                        : opmerking,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFout(json.error ?? `Mislukt (${res.status})`);
                setFase('kiezen');
                return;
            }
            setControle(json.controle);
            setKosten(json.kosten ?? null);
            setInvulling(LEEG);
            setResultaat(null);
            setFase('nakijken');
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Geen verbinding');
            setFase('kiezen');
        }
    }

    async function bewaar() {
        if (!controle) return;
        setBezigMetOpslaan(true);
        setFout(null);
        try {
            const res = await fetch('/api/recipe/ontleed/opslaan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    controle,
                    antwoorden: invulling.antwoorden,
                    nieuweComponenten: (invulling.antwoorden.componenten ?? [])
                        .map((naam) => ({ naam, eenheid: invulling.eenheden[naam] ?? 'g' })),
                    /* Golf 5: bestaand gerecht bijwerken, en wat Bedenk al wist meegeven. */
                    gerechtId: herkomst?.gerechtId,
                    extra: herkomst?.extra,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFout(json.error ?? `Opslaan mislukt (${res.status})`);
                return;
            }
            setResultaat({ gerechtId: json.gerechtId, waarschuwing: json.waarschuwing ?? null });
            /* Golf 4: wat met een zekere koppeling is opgeslagen onthoudt de app
               als alias — dezelfde regel als in het gerecht-formulier. */
            const costs = Array.isArray(herkomst?.extra?.ingredient_costs) ? (herkomst!.extra.ingredient_costs as Array<Record<string, any>>) : [];
            const aliases = costs
                .filter((r) => r?.naam && r?.match && r.match.confidence === 'hoog' && r.match.line_cost_cents != null)
                .map((r) => ({ naam: r.naam, match: { source: r.match.source, ref_id: r.match.ref_id, name: r.match.name, supplier: r.match.supplier ?? null } }));
            if (aliases.length > 0) {
                fetch('/api/recipe/aliases', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ alleen_als_nieuw: true, aliases }),
                }).catch(() => { /* volgende keer opnieuw zoeken */ });
            }
            /* Allergeencheck, zoals bij het gerecht-formulier: de AI stelt voor,
               de kok bevestigt, en dan pas komt het op het gerecht. Alleen bij
               een nieuw gerecht uit Bedenk — een bestaand gerecht heeft zijn
               allergenen al, en die raken we hier niet aan. */
            if (herkomst?.soort === 'bedenk' && herkomst.ingredientNamen.length > 0) {
                try {
                    const r = await fetch('/api/detect-allergens', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ingredients: herkomst.ingredientNamen, dish_name: controle.gerechtNaam }),
                    });
                    const b = await r.json().catch(() => ({}));
                    const woorden = allergeenCodesNaarWoorden(b.allergens);
                    if (woorden.length > 0) {
                        setAllergeenRijen(woorden.map((a, i) => ({
                            id: `save-${i}-${a}`,
                            allergen: a,
                            label: ALLERGENEN.find((x) => x.code === a)?.label ?? a,
                            source: `AI-detectie via ${herkomst.ingredientNamen.length} ingrediënten`,
                            confidence: 90,
                        })));
                    }
                } catch { /* geen check → kok doet het zelf via Hercheck */ }
            }
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Geen verbinding');
        } finally {
            setBezigMetOpslaan(false);
        }
    }

    /* Dezelfde regel als de opslagroute gebruikt. Eén plek, geen twee waarheden. */
    const openstaand = controle ? openstaandeVragen(controle, invulling.antwoorden) : [];

    return (
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px 20px 96px' }}>
            {fout && <Melding soort="fout">{fout}</Melding>}

            {herkomst && fase !== 'kiezen' && (
                <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
                    background: KLEUR.amberZacht, border: `1px solid ${KLEUR.goudlijn}`,
                }}>
                    {herkomst.soort === 'bedenk'
                        ? <>Uit <strong>Bedenk met AI</strong>: “{herkomst.naam}”. De ingrediënten en prijzen zijn al gekoppeld; hier komt de werkwijze bij.</>
                        : <>Werkwijze voor bestaand gerecht <strong>{herkomst.naam}</strong>.{(herkomst.bestaandeStappen ?? 0) > 0 ? ` Het had al ${herkomst.bestaandeStappen} stappen — die worden vervangen bij opslaan.` : ''}</>}
                </div>
            )}

            <AllergenConfirmModal
                open={allergeenRijen.length > 0}
                rows={allergeenRijen}
                onClose={() => setAllergeenRijen([])}
                onSubmit={async ({ confirmed }) => {
                    const gekozen = confirmed
                        .map((id) => allergeenRijen.find((r) => r.id === id)?.allergen)
                        .filter((a): a is string => Boolean(a));
                    setAllergeenRijen([]);
                    if (resultaat && gekozen.length > 0) {
                        await supabase.from('gerechten').update({ allergenen: gekozen }).eq('id', resultaat.gerechtId);
                    }
                }}
            />

            {fase === 'kiezen' && (
                <Kiezen
                    fotos={fotos}
                    zetFotos={setFotos}
                    opmerking={opmerking}
                    zetOpmerking={setOpmerking}
                    invoer={invoer}
                    kiesBestanden={kiesBestanden}
                    idee={idee}
                    zetIdee={setIdee}
                    start={() => void ontleed()}
                />
            )}

            {fase === 'bezig' && <Wachten />}

            {fase === 'nakijken' && controle && (
                <Lade
                    controle={controle}
                    kosten={kosten}
                    invulling={invulling}
                    zetInvulling={setInvulling}
                    openstaand={openstaand}
                    bezigMetOpslaan={bezigMetOpslaan}
                    resultaat={resultaat}
                    bewaar={() => void bewaar()}
                    opnieuw={() => { setFase('kiezen'); setControle(null); setResultaat(null); setFotos([]); }}
                    leesAnder={(naam) => void ontleed(naam)}
                    uitIdee={fotos.length === 0}
                />
            )}
        </div>
    );
}

/* ── Foto's kiezen ──────────────────────────────────────────────── */

function Kiezen(props: {
    fotos: string[];
    zetFotos: (fn: (b: string[]) => string[]) => void;
    opmerking: string;
    zetOpmerking: (v: string) => void;
    invoer: React.RefObject<HTMLInputElement | null>;
    kiesBestanden: (l: FileList | null) => Promise<void>;
    idee: string;
    zetIdee: (v: string) => void;
    start: () => void;
}) {
    const { fotos, zetFotos, opmerking, zetOpmerking, invoer, kiesBestanden, idee, zetIdee, start } = props;
    const kanStarten = fotos.length > 0 || idee.trim().length >= 8;

    return (
        <>
            <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Recept uit een kookboek</h1>
            <p style={{ color: KLEUR.gedempt, marginBottom: 28, lineHeight: 1.5 }}>
                Fotografeer de pagina&apos;s. Wij lezen ze uit en zetten ze om naar jouw apparatuur.
                De foto zelf wordt niet bewaard.
            </p>

            <div
                onClick={() => invoer.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void kiesBestanden(e.dataTransfer.files); }}
                style={{
                    border: `2px dashed ${KLEUR.lijn}`, borderRadius: 14,
                    padding: 48, textAlign: 'center', cursor: 'pointer', background: KLEUR.paneel,
                }}
            >
                <div style={{ fontSize: 18, marginBottom: 6 }}>Sleep je foto&apos;s hierheen</div>
                <div style={{ color: KLEUR.gedempt, fontSize: 14 }}>
                    of kies ze van je telefoon · jpg, png, heic · hooguit zes
                </div>
            </div>
            <input
                ref={invoer} type="file" accept="image/*" multiple hidden
                onChange={(e) => void kiesBestanden(e.target.files)}
            />

            {fotos.length > 0 && (
                <>
                    <p style={{ color: KLEUR.gedempt, fontSize: 14, margin: '16px 0 8px' }}>
                        {fotos.length} foto{fotos.length === 1 ? '' : "'s"} klaar om te lezen.
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {fotos.map((f, i) => (
                            <div key={i} style={{ position: 'relative' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f} alt="" style={{ height: 120, borderRadius: 10, display: 'block' }} />
                                <button
                                    type="button"
                                    aria-label="Foto weghalen"
                                    onClick={() => zetFotos((b) => b.filter((_, j) => j !== i))}
                                    style={{
                                        position: 'absolute', top: 6, right: 6, border: 'none',
                                        background: 'rgba(0,0,0,.7)', color: '#fff', borderRadius: 6,
                                        width: 26, height: 26, cursor: 'pointer', lineHeight: 1,
                                    }}
                                >×</button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Geen boek? Dan een idee. Zelfde lade, zelfde regels — hij bedenkt
                het gerecht, maar de tijden blijven leeg tot ze gemeten zijn. */}
            <label style={{
                display: 'block', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                color: KLEUR.gedempt, margin: '26px 0 8px',
            }}>Of beschrijf een gerecht</label>
            <textarea
                value={idee}
                onChange={(e) => zetIdee(e.target.value)}
                placeholder="Passievrucht panna cotta met cranberry's en schuim van vlierbloesem"
                rows={2}
                style={{
                    width: '100%', padding: 14, borderRadius: 10,
                    border: `1px solid ${KLEUR.lijn}`, background: KLEUR.paneel,
                    color: 'inherit', font: 'inherit', resize: 'vertical',
                }}
            />
            <p style={{ fontSize: 13, color: KLEUR.gedempt, margin: '6px 0 0' }}>
                Zonder boek bedenkt hij het recept zelf — op jouw apparatuur, met de onderdelen los.
                De tijden blijven leeg tot je ze een keer gemeten hebt.
            </p>

            <label style={{
                display: 'block', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                color: KLEUR.gedempt, margin: '22px 0 8px',
            }}>Opmerking voor de lezer</label>
            <textarea
                value={opmerking}
                onChange={(e) => zetOpmerking(e.target.value)}
                placeholder="Wij doen dit op de pelletgrill, niet in de oven. Porties voor 60 gasten."
                rows={2}
                style={{
                    width: '100%', padding: 14, borderRadius: 10,
                    border: `1px solid ${KLEUR.lijn}`, background: KLEUR.paneel,
                    color: 'inherit', font: 'inherit', resize: 'vertical',
                }}
            />

            <button
                type="button"
                disabled={!kanStarten}
                onClick={start}
                style={{ ...knop, marginTop: 18, opacity: kanStarten ? 1 : .45 }}
            >
                {fotos.length > 0 ? 'Lees het recept' : 'Bedenk het recept'}
            </button>
        </>
    );
}

/* ── Wachten ────────────────────────────────────────────────────── */

/**
 * Vier benoemde fasen in plaats van een balk.
 *
 * Een minuut duurt lang genoeg om te willen weten wát er gebeurt. De fasen
 * lopen niet mee met de echte voortgang — die kennen we niet — dus staan ze er
 * als opsomming en niet als afvinklijst. Beweren dat we bij stap drie zijn zou
 * een verzonnen getal zijn in een ander jasje.
 */
function Wachten() {
    return (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>We lezen het recept</div>
            <div style={{ color: KLEUR.gedempt, marginBottom: 26 }}>Dit duurt ongeveer een minuut.</div>
            <ul style={{
                listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: 320,
                textAlign: 'left', color: KLEUR.gedempt, fontSize: 15, lineHeight: 2,
            }}>
                <li>Tekst van de foto&apos;s gehaald</li>
                <li>Omzetten naar onze apparatuur</li>
                <li>Onderdelen opzoeken</li>
                <li>Stappen op volgorde zetten</li>
            </ul>
        </div>
    );
}

/* ── De goedkeur-lade ───────────────────────────────────────────── */

function Lade(props: {
    controle: Controle;
    kosten: { centen: number } | null;
    invulling: Invulling;
    zetInvulling: (fn: (i: Invulling) => Invulling) => void;
    openstaand: string[];
    bezigMetOpslaan: boolean;
    resultaat: { gerechtId: string; waarschuwing: string | null } | null;
    bewaar: () => void;
    opnieuw: () => void;
    leesAnder: (naam: string) => void;
    /** Kwam dit uit een idee in plaats van een kookboekpagina? */
    uitIdee: boolean;
}) {
    const {
        controle, kosten, invulling, zetInvulling, openstaand,
        bezigMetOpslaan, resultaat, bewaar, opnieuw, leesAnder, uitIdee,
    } = props;
    const { antwoorden } = invulling;

    if (resultaat) {
        return (
            <>
                <Melding soort="goed">Opgeslagen. {controle.gerechtNaam} staat nu in je gerechtenboek.</Melding>
                {resultaat.waarschuwing && <Melding soort="fout">{resultaat.waarschuwing}</Melding>}
                {controle.anderRecept && (
                    <p style={{ marginTop: 16, marginBottom: 0, color: KLEUR.gedempt }}>
                        Op deze pagina staat ook <strong>{controle.anderRecept}</strong>.
                    </p>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <a href={`/gerechten/${resultaat.gerechtId}`} style={{ ...knop, textDecoration: 'none' }}>
                        Bekijk het gerecht
                    </a>
                    {controle.anderRecept && (
                        <button type="button" onClick={() => leesAnder(controle.anderRecept!)} style={knopLicht}>
                            Lees ook: {controle.anderRecept}
                        </button>
                    )}
                    <button type="button" onClick={opnieuw} style={knopLicht}>Nog een recept</button>
                </div>
            </>
        );
    }

    const stappen = metKeuzesVerwerkt(controle, antwoorden);
    const delen = maakDelen(stappen, invulling, zetInvulling);
    const beslist = controle.keuzes.filter((k) => (antwoorden.keuzes ?? {})[k.vraag]).length;

    /* Alleen de bovenste openstaande vraag krijgt amber. De rest een goudstip,
       zodat je ziet wat je nú beantwoordt zonder een muur van waarschuwingen. */
    const eersteOpen = controle.keuzes.find((k) => !(antwoorden.keuzes ?? {})[k.vraag])?.vraag ?? null;

    return (
        <>
            <header style={{ marginBottom: 22 }}>
                <div style={{
                    fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                    color: KLEUR.gedempt, marginBottom: 6,
                }}>
                    {uitIdee ? 'Bedacht op jouw apparatuur' : 'Gelezen uit kookboekfoto'}
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 6px' }}>{controle.gerechtNaam}</h1>
                <p style={{ color: KLEUR.gedempt, margin: 0 }}>
                    Omgezet naar onze werkwijze · {controle.porties ?? antwoorden.porties ?? '?'} porties ·{' '}
                    {delen.length} {delen.length === 1 ? 'deel' : 'delen'} · {stappen.length} stappen
                    {kosten && ` · AI-kosten van het lezen € ${(kosten.centen / 100).toFixed(2).replace('.', ',')}`}
                </p>
                {controle.anderRecept && (
                    <p style={{ color: KLEUR.gedempt, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                        Op deze pagina staat ook <strong>{controle.anderRecept}</strong> — die kun je
                        na het opslaan met één klik alsnog laten lezen.
                    </p>
                )}
            </header>

            {/* Het boek zegt soms "voor circa 1,5 kg" en geen aantal personen.
                Daar hoort geen stille tien voor in de plaats. */}
            {controle.porties == null && (
                <Blok titel="Voor hoeveel porties is dit?">
                    <input
                        type="number" min={1} placeholder="aantal"
                        value={antwoorden.porties ?? ''}
                        onChange={(e) => zetInvulling((i) => ({
                            ...i, antwoorden: { ...i.antwoorden, porties: Number(e.target.value) || null },
                        }))}
                        aria-label="Aantal porties"
                        style={getal}
                    />
                </Blok>
            )}

            {controle.vervallen.length > 0 && (
                <Blok titel={`Vervallen op onze apparatuur · ${controle.vervallen.length}`}>
                    {controle.vervallen.map((v, i) => (
                        <div key={i} style={{ marginBottom: i === controle.vervallen.length - 1 ? 0 : 14 }}>
                            <div style={{ textDecoration: 'line-through', color: KLEUR.gedempt }}>{v.tekst}</div>
                            <div style={{ fontSize: 14, marginTop: 2 }}>{v.reden}</div>
                        </div>
                    ))}
                </Blok>
            )}

            {controle.keuzes.length > 0 && (
                <Blok titel={`Hier komt hij zelf niet uit · ${beslist} van de ${controle.keuzes.length} beslist`}>
                    {controle.keuzes.map((k) => (
                        <Keuze
                            key={k.vraag}
                            vraag={k.vraag}
                            opties={k.opties}
                            gekozen={(antwoorden.keuzes ?? {})[k.vraag] ?? null}
                            isBovensteOpen={k.vraag === eersteOpen}
                            kies={(optie) => zetInvulling((i) => ({
                                ...i,
                                antwoorden: {
                                    ...i.antwoorden,
                                    keuzes: { ...(i.antwoorden.keuzes ?? {}), [k.vraag]: optie },
                                },
                            }))}
                        />
                    ))}
                </Blok>
            )}

            {controle.ontbrekendeComponenten.length > 0 && (
                <Blok titel={`Onderdelen die je nog niet hebt · ${controle.ontbrekendeComponenten.length}`}>
                    {controle.ontbrekendeComponenten.map((naam) => (
                        <ComponentKeuze
                            key={naam}
                            naam={naam}
                            keuze={
                                (antwoorden.componenten ?? []).includes(naam) ? 'aanmaken'
                                    : (antwoorden.componentenOvergeslagen ?? []).includes(naam) ? 'overslaan'
                                        : null
                            }
                            eenheid={invulling.eenheden[naam] ?? 'g'}
                            zetKeuze={(keuze) => zetInvulling((i) => ({
                                ...i,
                                antwoorden: {
                                    ...i.antwoorden,
                                    componenten: keuze === 'aanmaken'
                                        ? [...new Set([...(i.antwoorden.componenten ?? []), naam])]
                                        : (i.antwoorden.componenten ?? []).filter((n) => n !== naam),
                                    componentenOvergeslagen: keuze === 'overslaan'
                                        ? [...new Set([...(i.antwoorden.componentenOvergeslagen ?? []), naam])]
                                        : (i.antwoorden.componentenOvergeslagen ?? []).filter((n) => n !== naam),
                                },
                            }))}
                            zetEenheid={(e) => zetInvulling((i) => ({ ...i, eenheden: { ...i.eenheden, [naam]: e } }))}
                        />
                    ))}
                    <p style={{ fontSize: 13, color: KLEUR.gedempt, margin: '12px 0 0', lineHeight: 1.5 }}>
                        Aangemaakte onderdelen krijgen hun eigen stappen en mogen dagen eerder gemaakt worden.
                        Hoeveel er per portie in gaat weet niemand uit een kookboek — dat vul je in op de
                        gerechtpagina, en dan telt de kostprijs mee.
                    </p>
                </Blok>
            )}

            <div style={{ marginTop: 22, marginBottom: 10 }}>
                <div style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: KLEUR.gedempt, marginBottom: 10,
                }}>
                    De stappen · {delen.length} {delen.length === 1 ? 'deel' : 'delen'} · {stappen.length} stappen
                </div>
                <ReceptuurLijst delen={delen} />
            </div>

            <div style={{ marginTop: 26, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    disabled={openstaand.length > 0 || bezigMetOpslaan}
                    onClick={bewaar}
                    style={{ ...knop, opacity: openstaand.length > 0 || bezigMetOpslaan ? .45 : 1 }}
                >
                    {bezigMetOpslaan ? 'Bezig…' : 'Goedkeuren en opslaan'}
                </button>
                <button type="button" onClick={opnieuw} style={knopLicht}>Opnieuw beginnen</button>
            </div>

            <p style={{ marginTop: 12, color: KLEUR.gedempt, fontSize: 14 }}>
                {openstaand.length === 0
                    ? `Alles beslist — ${(antwoorden.componenten ?? []).length} onderdeel(en) worden aangemaakt, `
                        + `${controle.vervallen.length} stappen vervallen.`
                    : `Nog ${openstaand.length} ding${openstaand.length === 1 ? '' : 'en'} te beslissen — bovenaan: ${openstaand[0]}`}
            </p>
        </>
    );
}

/* ── Onderdelen van de lade ─────────────────────────────────────── */

function Keuze(props: {
    vraag: string;
    opties: string[];
    gekozen: string | null;
    isBovensteOpen: boolean;
    kies: (optie: string) => void;
}) {
    const { vraag, opties, gekozen, isBovensteOpen, kies } = props;

    /* Beantwoord? Dan krimpt hij tot één regel met het antwoord ernaast. */
    if (gekozen) {
        return (
            <div style={{
                display: 'flex', gap: 16, alignItems: 'baseline', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: `1px solid ${KLEUR.lijnZacht}`, flexWrap: 'wrap',
            }}>
                <span style={{ color: KLEUR.gedempt, fontSize: 14, flex: 1, minWidth: 200 }}>{vraag}</span>
                <span style={{ fontWeight: 600 }}>{gekozen}</span>
            </div>
        );
    }

    return (
        <div style={{
            padding: isBovensteOpen ? '14px 16px' : '14px 0',
            marginLeft: isBovensteOpen ? -16 : 0, marginRight: isBovensteOpen ? -16 : 0,
            borderRadius: isBovensteOpen ? 10 : 0,
            background: isBovensteOpen ? KLEUR.amberZacht : 'transparent',
            borderBottom: isBovensteOpen ? 'none' : `1px solid ${KLEUR.lijnZacht}`,
        }}>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                {!isBovensteOpen && (
                    <span style={{ color: '#c4a35a', fontSize: 18, lineHeight: 1 }} aria-hidden>•</span>
                )}
                <span>{vraag}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {opties.map((optie) => (
                    <button key={optie} type="button" onClick={() => kies(optie)} style={knopKleinUit}>
                        {optie}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ComponentKeuze(props: {
    naam: string;
    keuze: 'aanmaken' | 'overslaan' | null;
    eenheid: string;
    zetKeuze: (k: 'aanmaken' | 'overslaan') => void;
    zetEenheid: (e: string) => void;
}) {
    const { naam, keuze, eenheid, zetKeuze, zetEenheid } = props;
    return (
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${KLEUR.lijnZacht}` }}>
            <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{naam}</strong>
                {keuze === 'aanmaken' && (
                    <span style={{ fontSize: 13, color: KLEUR.gedempt }}>wordt aangemaakt · eenheid {eenheid}</span>
                )}
                {keuze === 'overslaan' && (
                    <span style={{ fontSize: 13, color: KLEUR.gedempt }}>overgeslagen · blijft vrije tekst in de stap</span>
                )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => zetKeuze('aanmaken')} style={keuze === 'aanmaken' ? knopKlein : knopKleinUit}>
                    Aanmaken
                </button>
                <button type="button" onClick={() => zetKeuze('overslaan')} style={keuze === 'overslaan' ? knopKlein : knopKleinUit}>
                    Overslaan
                </button>
                {keuze === 'aanmaken' && (
                    <select
                        value={eenheid}
                        onChange={(e) => zetEenheid(e.target.value)}
                        aria-label={`Eenheid voor ${naam}`}
                        style={{
                            padding: '6px 10px', borderRadius: 6, font: 'inherit', color: 'inherit',
                            background: KLEUR.paneel, border: `1px solid ${KLEUR.lijn}`,
                        }}
                    >
                        {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                )}
            </div>
        </div>
    );
}

/* ── Van controle naar de gedeelde stappenlijst ─────────────────── */

function maakDelen(
    stappen: GecontroleerdeStap[],
    invulling: Invulling,
    zetInvulling: (fn: (i: Invulling) => Invulling) => void,
): DeelRegel[] {
    const namen = [...new Set(stappen.map((s) => s.voorComponent ?? null))];
    /* Delen eerst, het gerecht zelf als laatste — zo lees je het ook. */
    namen.sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0));

    return namen.map((naam) => {
        const rijen = stappen.filter((s) => (s.voorComponent ?? null) === naam);
        const werk = rijen.reduce((a, s) => a + (s.actiefMin ?? 0), 0);
        const wacht = rijen.reduce((a, s) => a + (s.passiefMin ?? 0), 0);
        const zonder = rijen.filter((s) => s.duurOnbekend).length;
        const apparaten = [...new Set(rijen.map((s) => s.materieelNaam).filter((n): n is string => n != null))];

        const tijd = [
            werk > 0 ? `${werk} min werk` : null,
            wacht > 0 ? `${formatDuur(wacht)} wachten` : null,
        ].filter(Boolean);

        return {
            sleutel: naam ?? '__gerecht',
            naam: naam ?? 'Het gerecht zelf',
            magVooruit: naam != null,
            onderschrift: [`${rijen.length} ${rijen.length === 1 ? 'stap' : 'stappen'}`, ...apparaten].join(' · '),
            bekendeTijd: tijd.length > 0
                ? tijd.join(' · ') + (zonder > 0 ? ` · ${zonder} nog te meten` : '')
                : 'wordt gemeten',
            stappen: rijen.map((s) => maakStap(s, invulling, zetInvulling)),
        };
    });
}

function maakStap(
    stap: GecontroleerdeStap,
    invulling: Invulling,
    zetInvulling: (fn: (i: Invulling) => Invulling) => void,
): StapRegel {
    const { antwoorden } = invulling;
    const chips: StapChip[] = [];
    if (stap.materieelNaam) chips.push({ tekst: stap.materieelNaam });
    if (stap.tempC != null) chips.push({ tekst: `${stap.tempC} °C`, mono: true });
    if (stap.kernTempC != null) chips.push({ tekst: `klaar bij kern ${stap.kernTempC} °C` });
    if (stap.herhaalIntervalMin != null) chips.push({ tekst: `elke ${stap.herhaalIntervalMin} min iets doen` });
    if (stap.hangtAfVanVolgnummer != null) {
        chips.push({ tekst: `na stap ${stap.hangtAfVanVolgnummer}`, voorwaarde: true });
    }

    const getal = stap.passiefMin != null
        ? { ...splitsDuur(stap.passiefMin), amber: true }
        : stap.actiefMin != null
            ? { ...splitsDuur(stap.actiefMin), amber: false }
            : null;

    const rechts = stap.passiefMin != null
        ? (stap.herhaalIntervalMin != null ? 'wachten · blijf in de buurt' : 'wachten · je kunt weg')
        : stap.actiefMin != null
            ? 'werk'
            : stap.kernTempC != null ? 'de kern beslist, niet de klok' : 'tijd wordt gemeten';

    return {
        id: String(stap.volgnummer),
        nummer: stap.volgnummer,
        tekst: stap.tekst,
        chips,
        getal,
        rechts,
        extra: <StapVraag stap={stap} invulling={invulling} zetInvulling={zetInvulling} antwoorden={antwoorden} />,
    };
}

/** Wat er aan deze stap nog beslist moet worden, als dat er is. */
function StapVraag(props: {
    stap: GecontroleerdeStap;
    invulling: Invulling;
    zetInvulling: (fn: (i: Invulling) => Invulling) => void;
    antwoorden: Antwoorden;
}) {
    const { stap, zetInvulling, antwoorden } = props;
    if (stap.oordeel !== 'vraag') return null;

    const akkoord = (antwoorden.akkoordOndanks ?? []).includes(stap.volgnummer);
    const soort = soortVraag(stap.bezwaar);
    const herhaalDuur = (antwoorden.herhaalDuren ?? {})[stap.volgnummer];

    if (akkoord) {
        return (
            <div style={{ fontSize: 14, color: '#c4a35a' }}>Jij zegt: klopt toch.</div>
        );
    }

    return (
        <div style={{
            background: KLEUR.amberZacht, borderRadius: 10, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <div style={{ fontSize: 14 }}>{stap.bezwaar}</div>

            {soort === 'herhaling' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: KLEUR.gedempt }}>Hoe lang duurt het per keer?</span>
                    <input
                        type="number" min={1} max={(stap.herhaalIntervalMin ?? 60) - 1} placeholder="min"
                        value={herhaalDuur ?? ''}
                        onChange={(e) => zetInvulling((i) => ({
                            ...i,
                            antwoorden: {
                                ...i.antwoorden,
                                herhaalDuren: { ...(i.antwoorden.herhaalDuren ?? {}), [stap.volgnummer]: Number(e.target.value) },
                            },
                        }))}
                        aria-label={`Duur per keer van stap ${stap.volgnummer}`}
                        style={getal}
                    />
                    <span style={{ fontSize: 13, color: KLEUR.gedempt }}>elke {stap.herhaalIntervalMin} min</span>
                </div>
            )}

            <button
                type="button"
                onClick={() => zetInvulling((i) => ({
                    ...i,
                    antwoorden: {
                        ...i.antwoorden,
                        akkoordOndanks: [...new Set([...(i.antwoorden.akkoordOndanks ?? []), stap.volgnummer])],
                    },
                }))}
                style={{ ...knopKleinUit, alignSelf: 'flex-start' }}
            >
                {soort === 'oordeel' ? 'Klopt toch, laat maar staan' : 'Laat maar staan zoals hij staat'}
            </button>
        </div>
    );
}

/* ── Kleine bouwstenen ──────────────────────────────────────────── */

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
    return (
        <section style={{
            marginTop: 16, padding: 20, borderRadius: 14,
            background: KLEUR.paneel, border: `1px solid ${KLEUR.lijn}`,
            borderTop: `1px solid ${KLEUR.goudlijn}`,
        }}>
            <h2 style={{
                fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                color: KLEUR.gedempt, margin: '0 0 14px', fontWeight: 600,
            }}>{titel}</h2>
            {children}
        </section>
    );
}

function Melding({ soort, children }: { soort: 'fout' | 'goed'; children: React.ReactNode }) {
    return (
        <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 16,
            background: soort === 'fout' ? 'rgba(180,68,47,.14)' : 'rgba(255,191,0,.12)',
            border: `1px solid ${soort === 'fout' ? '#B4442F' : KLEUR.amber}`,
        }}>{children}</div>
    );
}

const knop: React.CSSProperties = {
    padding: '12px 22px', borderRadius: 10, border: 'none',
    background: KLEUR.amber, color: '#17181A', font: 'inherit',
    fontWeight: 600, cursor: 'pointer', display: 'inline-block',
};

const knopLicht: React.CSSProperties = {
    padding: '12px 22px', borderRadius: 10, border: `1px solid ${KLEUR.lijn}`,
    background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
};

const knopKlein: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 8, border: `1px solid ${KLEUR.amber}`,
    background: KLEUR.amber, color: '#17181A', font: 'inherit', fontSize: 14, cursor: 'pointer',
};

const knopKleinUit: React.CSSProperties = {
    ...knopKlein, background: 'transparent', color: 'inherit', border: `1px solid ${KLEUR.lijn}`,
};

const getal: React.CSSProperties = {
    width: 92, padding: '7px 10px', borderRadius: 8,
    border: `1px solid ${KLEUR.lijn}`, background: KLEUR.paneel,
    color: 'inherit', font: 'inherit',
};

/* ── Hulp ───────────────────────────────────────────────────────── */

function splitsDuur(min: number): { waarde: string; eenheid: string } {
    if (min >= 1440 && min % 1440 === 0) {
        const dagen = min / 1440;
        return { waarde: String(dagen), eenheid: dagen === 1 ? 'dag' : 'dagen' };
    }
    if (min >= 90 && min % 60 === 0) return { waarde: String(min / 60), eenheid: 'uur' };
    return { waarde: String(min), eenheid: 'min' };
}

function formatDuur(min: number): string {
    if (min < 90) return `${min} min`;
    if (min >= 1440) {
        const dagen = Math.floor(min / 1440);
        const rest = Math.round((min % 1440) / 60);
        return rest === 0 ? `${dagen} dagen` : `${dagen} d ${rest} u`;
    }
    const uren = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `${uren} uur` : `${uren} u ${rest} min`;
}

/**
 * Verklein een foto voor verzending.
 *
 * Een telefoonfoto van vier megapixel kost onnodig veel tokens en leest niet
 * beter dan één van 1600 pixels breed.
 */
async function verklein(bestand: File, maxZijde = 1600, kwaliteit = 0.85): Promise<string> {
    const bitmap = await createImageBitmap(bestand);
    const schaal = Math.min(1, maxZijde / Math.max(bitmap.width, bitmap.height));
    const breedte = Math.round(bitmap.width * schaal);
    const hoogte = Math.round(bitmap.height * schaal);

    const doek = document.createElement('canvas');
    doek.width = breedte;
    doek.height = hoogte;
    doek.getContext('2d')?.drawImage(bitmap, 0, 0, breedte, hoogte);
    bitmap.close();

    return doek.toDataURL('image/jpeg', kwaliteit);
}
