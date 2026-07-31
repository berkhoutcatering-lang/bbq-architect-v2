'use client';

/**
 * Keuken-telling — de looproute.
 *
 * Het gebaar dat dit scherm nabootst: je staat met je telefoon voor een open
 * vriezer, pakt een product, en typt in wat je in je handen hebt. Daarom:
 *
 *   - Zone eerst. Je loopt niet op alfabet door je keuken, je loopt langs
 *     kasten. Vriezer → koeling → droog is de route; per zone tel je uit.
 *   - Zoeken begint bij de leverancier-catalogus, nooit bij een leeg naamveld.
 *     Een zelf getypte naam koppelt nergens aan: geen prijs, geen bestelregel.
 *   - Tellen in pakken. Niemand rekent "4 pakken van een kilo" in zijn hoofd om
 *     naar 4; dat doet de app, en laat de som zien zodat je het kunt nalezen.
 *   - Eén foto als bewijs. Over drie maanden weet je niet meer wélke pastrami
 *     je bedoelde; de foto van het pak wel.
 *
 * Alles is duimbreed: knoppen ≥ 48px, één kolom, geen hover-afhankelijkheid.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, Camera, Check, Loader2, Package, Plus, Minus,
    Search, Snowflake, Refrigerator, Archive, X, Pencil, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { resizeImage, fmt } from '@/lib/utils';
import {
    ZONES, type Zone, prijsPerEenheid, pakVoorstel, eenheidVoorstel,
    telTotaal, telSom, type CatalogusPrijsBron,
} from '@/lib/voorraadTelling';
import { telProduct } from '../actions';

const GOLD = '#c4a35a';
const EENHEDEN = ['kg', 'g', 'liter', 'ml', 'stuks'] as const;

/* globals.css definieert wel @keyframes spin, maar nergens een .spin-regel die
   ernaar verwijst — de spinner-class die elders in de app gebruikt wordt draait
   dus stilletjes niet. Hier daarom inline, met dezelfde keyframes. */
const DRAAIT: React.CSSProperties = { animation: 'spin 1s linear infinite' };

const ZONE_ICON: Record<Zone, typeof Snowflake> = {
    vries: Snowflake,
    vers: Refrigerator,
    houdbaar: Archive,
};
const ZONE_KLEUR: Record<Zone, string> = {
    vries: '#60a5fa',
    vers: '#34d399',
    houdbaar: GOLD,
};

export interface GeteldItem {
    id: number;
    naam: string;
    categorie: string | null;
    current_stock: number;
    unit: string;
    par_level: number;
    purchase_price: number | null;
    supplier: string | null;
    zone: Zone | null;
    foto: string | null;
    last_count_at: string | null;
    /** Pakmaat van de vaste leverancier, zodat een hertelling niet op "1 × 1" begint. */
    pak: { inhoud: number; eenheid: string } | null;
}

interface CatalogHit extends CatalogusPrijsBron {
    naam: string;
    categorie: string | null;
    leverancier: string | null;
    supplier_product_id?: number | null;
}

/* De telkaart: alles wat je over één product invult voordat je 'm wegzet. */
interface Kaart {
    inventory_id: number | null;
    naam: string;
    categorie: string;
    eenheid: string;
    aantalPakken: string;
    inhoudPerPak: string;
    par: string;
    prijs: { euro: number; bron: string } | null;
    leverancier_naam: string;
    supplier_product_id: number | null;
    fotoNieuw: string | null;      // data-URL, nog niet geüpload
    fotoBestaand: string | null;   // signed URL van een eerdere telling
    vorigeStand: number | null;    // null = nieuw product
}

export default function NulmetingClient({ initial }: { initial: GeteldItem[] }) {
    const showToast = useToast();
    const [items, setItems] = useState<GeteldItem[]>(initial);
    const [zone, setZone] = useState<Zone | null>(null);
    const [kaart, setKaart] = useState<Kaart | null>(null);

    const perZone = useMemo(() => {
        const map: Record<Zone, GeteldItem[]> = { vries: [], vers: [], houdbaar: [] };
        for (const i of items) if (i.zone) map[i.zone]?.push(i);
        return map;
    }, [items]);

    const zonderZone = useMemo(() => items.filter((i) => !i.zone), [items]);

    /* Na opslaan: het item in de lokale lijst bijwerken of toevoegen, zodat de
       telling doorloopt zonder de pagina te herladen (netwerk in een keuken is
       traag; een refresh kost de cateraar zijn plek in de rij). */
    const verwerkOpslag = useCallback((k: Kaart, res: { id: number; totaal: number; foto_url: string | null }) => {
        setItems((prev) => {
            const nieuw: GeteldItem = {
                id: res.id,
                naam: k.naam,
                categorie: k.categorie || 'Overig',
                current_stock: res.totaal,
                unit: k.eenheid,
                par_level: Number(k.par.replace(',', '.')) || 0,
                purchase_price: k.prijs?.euro ?? null,
                supplier: k.leverancier_naam || null,
                zone: zone,
                foto: res.foto_url ?? k.fotoBestaand,
                last_count_at: new Date().toISOString(),
                /* Wat je zojuist als pakmaat gebruikte is meteen het voorstel voor
                   de volgende telling van dit product. */
                pak: { inhoud: getal(k.inhoudPerPak), eenheid: k.eenheid },
            };
            const idx = prev.findIndex((p) => p.id === res.id);
            if (idx >= 0) {
                const kopie = prev.slice();
                kopie[idx] = nieuw;
                return kopie;
            }
            return [...prev, nieuw];
        });
    }, [zone]);

    if (kaart) {
        return (
            <TelKaart
                kaart={kaart}
                zone={zone as Zone}
                onWijzig={setKaart}
                onKlaar={(res) => { verwerkOpslag(kaart, res); setKaart(null); }}
                onSluit={() => setKaart(null)}
                showToast={showToast}
            />
        );
    }

    if (zone) {
        return (
            <ZoneScherm
                zone={zone}
                geteld={perZone[zone]}
                alleItems={items}
                onTerug={() => setZone(null)}
                onKies={setKaart}
            />
        );
    }

    return (
        <ZoneKeuze
            perZone={perZone}
            zonderZone={zonderZone}
            totaal={items.length}
            onKies={setZone}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SCHERM 1 — Waar begin je?
   ═══════════════════════════════════════════════════════════════════ */

function ZoneKeuze({ perZone, zonderZone, totaal, onKies }: {
    perZone: Record<Zone, GeteldItem[]>;
    zonderZone: GeteldItem[];
    totaal: number;
    onKies: (z: Zone) => void;
}) {
    const waarde = useMemo(
        () => Object.values(perZone).flat().reduce((s, i) => s + i.current_stock * (i.purchase_price ?? 0), 0),
        [perZone],
    );

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 40px', maxWidth: 720, margin: '0 auto' }}>
            <Link href="/voorraad" style={{ ...terugKnopStyle, marginBottom: 18 }}>
                <ArrowLeft size={15} /> Voorraad
            </Link>

            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 30, margin: '0 0 6px' }}>
                Keuken tellen
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
                Loop je keuken kast voor kast langs. Kies waar je staat, zoek het product,
                en vul in hoeveel pakken je ziet. Klaar is klaar — je kunt altijd verder
                waar je gebleven was.
            </p>

            {totaal > 0 && (
                <div style={{ ...kaartStyle, padding: 14, marginBottom: 18, display: 'flex', gap: 20 }}>
                    <Stat label="Geteld" waarde={String(totaal)} />
                    <Stat label="Voorraadwaarde" waarde={fmt(waarde)} kleur={GOLD} />
                </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
                {ZONES.map((z) => {
                    const Icon = ZONE_ICON[z.key];
                    const aantal = perZone[z.key].length;
                    return (
                        <button
                            key={z.key}
                            onClick={() => onKies(z.key)}
                            style={{
                                ...kaartStyle,
                                display: 'flex', alignItems: 'center', gap: 14,
                                padding: 18, textAlign: 'left', cursor: 'pointer',
                                minHeight: 84, touchAction: 'manipulation',
                                borderColor: aantal > 0 ? `${ZONE_KLEUR[z.key]}55` : 'var(--border)',
                            }}
                        >
                            <span style={{
                                width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                                display: 'grid', placeItems: 'center',
                                background: `${ZONE_KLEUR[z.key]}1a`, color: ZONE_KLEUR[z.key],
                            }}>
                                <Icon size={22} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{z.label}</span>
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{z.uitleg}</span>
                            </span>
                            <span style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{
                                    display: 'block', fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300,
                                    color: aantal > 0 ? ZONE_KLEUR[z.key] : 'var(--muted-light)', fontVariantNumeric: 'tabular-nums',
                                }}>{aantal}</span>
                                <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)' }}>geteld</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {zonderZone.length > 0 && (
                <div style={{ ...kaartStyle, padding: 16, marginTop: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {zonderZone.length} item{zonderZone.length === 1 ? '' : 's'} zonder plek
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                        Deze stonden al in je voorraad van vóór de telling. Kom je ze tegen tijdens
                        het lopen, dan zoek je ze op en krijgen ze meteen hun kast:{' '}
                        <span style={{ color: 'var(--text)' }}>
                            {zonderZone.slice(0, 6).map((i) => i.naam).join(', ')}
                            {zonderZone.length > 6 ? ` en ${zonderZone.length - 6} meer` : ''}
                        </span>.
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, waarde, kleur }: { label: string; waarde: string; kleur?: string }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
            <div style={{
                fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300,
                color: kleur ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
            }}>{waarde}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SCHERM 2 — In de zone: zoeken en tellen
   ═══════════════════════════════════════════════════════════════════ */

function ZoneScherm({ zone, geteld, alleItems, onTerug, onKies }: {
    zone: Zone;
    geteld: GeteldItem[];
    alleItems: GeteldItem[];
    onTerug: () => void;
    onKies: (k: Kaart) => void;
}) {
    const [q, setQ] = useState('');
    const [treffers, setTreffers] = useState<CatalogHit[]>([]);
    const [zoekt, setZoekt] = useState(false);
    const zoekVeld = useRef<HTMLInputElement | null>(null);
    const meta = ZONES.find((z) => z.key === zone)!;
    const Icon = ZONE_ICON[zone];

    /* Catalogus-zoek met een korte pauze: in de keuken typ je met één hand,
       elke toetsaanslag een request is zonde van de verbinding. */
    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setTreffers([]); setZoekt(false); return; }
        setZoekt(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(term)}&supplierProducts=1`);
                const json = await res.json();
                setTreffers(Array.isArray(json.results) ? json.results : []);
            } catch {
                setTreffers([]);
            } finally {
                setZoekt(false);
            }
        }, 280);
        return () => clearTimeout(t);
    }, [q]);

    /* Eigen voorraad matcht lokaal en direct — dat is de sneller voelende helft
       van de lijst, en hij staat bovenaan omdat een hertelling vaker voorkomt
       dan een nieuw product. */
    const eigen = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (term.length < 2) return [];
        return alleItems.filter((i) => i.naam.toLowerCase().includes(term)).slice(0, 8);
    }, [q, alleItems]);

    function uitVoorraad(i: GeteldItem): Kaart {
        /* Pakmaat van de leverancier overnemen als de eenheid klopt. Zo staat er
           bij een hertelling "2 × 5 kg" en niet "2 × 1 kg" — dat laatste legt
           stilzwijgend een verkeerde voorraad vast, want een telling is absoluut. */
        const pak = i.pak && i.pak.eenheid === i.unit ? i.pak : null;
        return {
            inventory_id: i.id,
            naam: i.naam,
            categorie: i.categorie || 'Overig',
            eenheid: i.unit,
            aantalPakken: '1',
            inhoudPerPak: pak ? String(pak.inhoud) : '1',
            par: String(i.par_level || 0),
            prijs: i.purchase_price ? { euro: i.purchase_price, bron: 'eerder vastgelegd' } : null,
            leverancier_naam: i.supplier || '',
            supplier_product_id: null,
            fotoNieuw: null,
            fotoBestaand: i.foto,
            vorigeStand: i.current_stock,
        };
    }

    function uitCatalogus(h: CatalogHit): Kaart {
        const eenheid = eenheidVoorstel(h);
        const pak = pakVoorstel(h);
        return {
            inventory_id: null,
            naam: h.naam,
            categorie: h.categorie || 'Overig',
            eenheid,
            aantalPakken: '1',
            inhoudPerPak: pak ? String(pak.inhoud) : '1',
            par: '',
            prijs: prijsPerEenheid(h, eenheid),
            leverancier_naam: h.leverancier || '',
            supplier_product_id: h.supplier_product_id ?? null,
            fotoNieuw: null,
            fotoBestaand: null,
            vorigeStand: null,
        };
    }

    function vrijeInvoer(): Kaart {
        return {
            inventory_id: null,
            naam: q.trim(),
            categorie: 'Overig',
            eenheid: 'kg',
            aantalPakken: '1',
            inhoudPerPak: '1',
            par: '',
            prijs: null,
            leverancier_naam: '',
            supplier_product_id: null,
            fotoNieuw: null,
            fotoBestaand: null,
            vorigeStand: null,
        };
    }

    const heeftTerm = q.trim().length >= 2;

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 40px', maxWidth: 720, margin: '0 auto' }}>
            <button onClick={onTerug} style={{ ...terugKnopStyle, marginBottom: 16 }}>
                <ArrowLeft size={15} /> Alle kasten
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{
                    width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center',
                    background: `${ZONE_KLEUR[zone]}1a`, color: ZONE_KLEUR[zone], flexShrink: 0,
                }}>
                    <Icon size={20} />
                </span>
                <div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 26, margin: 0 }}>{meta.label}</h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {geteld.length} geteld in deze kast
                    </div>
                </div>
            </div>

            {/* Zoeken — begint altijd bij de catalogus, nooit bij een leeg naamveld */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input
                    ref={zoekVeld}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek een product — bv. suiker"
                    autoComplete="off"
                    style={{
                        width: '100%', height: 54, borderRadius: 12, padding: '0 44px 0 42px',
                        background: 'var(--color-bg-elevated)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 16, outline: 'none',
                    }}
                />
                {q && (
                    <button
                        onClick={() => { setQ(''); zoekVeld.current?.focus(); }}
                        aria-label="Zoekterm wissen"
                        style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            width: 38, height: 38, borderRadius: 9, display: 'grid', placeItems: 'center',
                            background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                        }}
                    >
                        <X size={17} />
                    </button>
                )}
            </div>

            {/* Resultaten */}
            {heeftTerm && (
                <div style={{ marginBottom: 22 }}>
                    {eigen.length > 0 && (
                        <>
                            <Kopje>Staat al in je voorraad</Kopje>
                            {eigen.map((i) => (
                                <RijKnop
                                    key={`inv-${i.id}`}
                                    titel={i.naam}
                                    onder={`nu ${nummer(i.current_stock)} ${i.unit}${i.zone && i.zone !== zone ? ` · ligt in ${ZONES.find((z) => z.key === i.zone)?.label}` : ''}`}
                                    rechts={i.purchase_price ? `${fmt(i.purchase_price)} / ${i.unit}` : null}
                                    foto={i.foto}
                                    onClick={() => onKies(uitVoorraad(i))}
                                />
                            ))}
                        </>
                    )}

                    <Kopje>
                        Uit de leverancier-catalogus
                        {zoekt && <Loader2 size={12} style={{ ...DRAAIT, marginLeft: 8, verticalAlign: 'middle' }} />}
                    </Kopje>

                    {!zoekt && treffers.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 2px 12px', lineHeight: 1.6 }}>
                            Niets gevonden in de catalogus. Staat het product er echt niet in, voeg het dan
                            hieronder zelf toe — je kunt later altijd een leverancier koppelen.
                        </div>
                    )}

                    {treffers.slice(0, 25).map((h, idx) => {
                        const eenheid = eenheidVoorstel(h);
                        const prijs = prijsPerEenheid(h, eenheid);
                        const pak = pakVoorstel(h);
                        return (
                            <RijKnop
                                key={`cat-${idx}-${h.naam}`}
                                titel={h.naam}
                                onder={[h.leverancier, pak ? `pak ${nummer(pak.inhoud)} ${pak.eenheid}` : null].filter(Boolean).join(' · ') || '—'}
                                rechts={prijs ? `${fmt(prijs.euro)} / ${eenheid}` : 'prijs onbekend'}
                                rechtsGedimd={!prijs}
                                onClick={() => onKies(uitCatalogus(h))}
                            />
                        );
                    })}

                    <button
                        onClick={() => onKies(vrijeInvoer())}
                        style={{
                            ...kaartStyle, width: '100%', marginTop: 10, padding: '14px 16px',
                            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                            minHeight: 52, textAlign: 'left', touchAction: 'manipulation',
                            borderStyle: 'dashed',
                        }}
                    >
                        <Pencil size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                            Zelf toevoegen als <span style={{ color: 'var(--text)', fontWeight: 600 }}>{q.trim()}</span>
                        </span>
                    </button>
                </div>
            )}

            {/* Wat je in deze kast al hebt gehad */}
            {!heeftTerm && (
                <>
                    {geteld.length === 0 ? (
                        <div style={{ ...kaartStyle, padding: 22, textAlign: 'center' }}>
                            <Package size={26} style={{ color: 'var(--muted-light)', marginBottom: 10 }} />
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nog niets geteld hier</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                                Pak het eerste product uit de {meta.label.toLowerCase()} en zoek het hierboven op.
                            </div>
                        </div>
                    ) : (
                        <>
                            <Kopje>Geteld in deze kast</Kopje>
                            {geteld.map((i) => (
                                <RijKnop
                                    key={i.id}
                                    titel={i.naam}
                                    onder={`${nummer(i.current_stock)} ${i.unit}${i.par_level > 0 ? ` · minimaal ${nummer(i.par_level)}` : ''}`}
                                    rechts={i.purchase_price ? fmt(i.current_stock * i.purchase_price) : null}
                                    foto={i.foto}
                                    geteldVink
                                    onClick={() => onKies(uitVoorraad(i))}
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SCHERM 3 — De telkaart
   ═══════════════════════════════════════════════════════════════════ */

function TelKaart({ kaart, zone, onWijzig, onKlaar, onSluit, showToast }: {
    kaart: Kaart;
    zone: Zone;
    /* Bewust de setState-vorm en niet (k: Kaart) => void: de plus-knop wordt in
       een telling snel achter elkaar getikt, en dan lezen die tikken binnen één
       React-batch allemaal dezelfde oude waarde. Vier keer tikken gaf 2. */
    onWijzig: React.Dispatch<React.SetStateAction<Kaart | null>>;
    onKlaar: (res: { id: number; totaal: number; foto_url: string | null }) => void;
    onSluit: () => void;
    showToast: ReturnType<typeof useToast>;
}) {
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const fotoInput = useRef<HTMLInputElement | null>(null);

    const aantal = getal(kaart.aantalPakken);
    const inhoud = getal(kaart.inhoudPerPak);
    const totaal = telTotaal(aantal, inhoud);
    const som = telSom(aantal, inhoud, kaart.eenheid);
    const zet = (p: Partial<Kaart>) => onWijzig((vorig) => (vorig ? { ...vorig, ...p } : vorig));

    /* Eén pak erbij of eraf, gerekend vanaf de stand van dát moment. */
    const stap = (d: number) => onWijzig((vorig) => {
        if (!vorig) return vorig;
        const nieuw = Math.max(0, Math.round((getal(vorig.aantalPakken) + d) * 100) / 100);
        return { ...vorig, aantalPakken: String(nieuw) };
    });

    /* De eenheid mag wisselen (leverancier levert per gram, jij telt in kilo).
       De prijs die bij de oude eenheid hoorde is dan niet meer waar — die
       gooien we weg in plaats van hem stilzwijgend mee te verhuizen. */
    function wisselEenheid(nieuw: string) {
        zet({ eenheid: nieuw, prijs: kaart.prijs && nieuw === kaart.eenheid ? kaart.prijs : null });
    }

    async function maakFoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const reader = new FileReader();
            const dataUrl: string = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
            /* Klein houden: dit gaat als tekst mee in de server-action en die
               heeft een limiet van 1 MB. 1000px bij 65% is ruim genoeg om een
               pak te herkennen. */
            const klein = await resizeImage(dataUrl, 1000, 1000, 0.65);
            zet({ fotoNieuw: klein });
        } catch {
            showToast('Foto kon niet worden gelezen', 'error');
        }
    }

    async function opslaan() {
        setFout(null);
        if (!kaart.naam.trim()) { setFout('Geef het product een naam.'); return; }
        if (totaal <= 0) { setFout('Vul in hoeveel je hebt — aantal pakken × inhoud moet boven 0 uitkomen.'); return; }

        setBezig(true);
        const res = await telProduct({
            inventory_id: kaart.inventory_id,
            naam: kaart.naam.trim(),
            categorie: kaart.categorie,
            aantal_pakken: aantal,
            inhoud_per_pak: inhoud,
            eenheid: kaart.eenheid,
            zone,
            par_level: getal(kaart.par),
            prijs_per_eenheid: kaart.prijs?.euro ?? null,
            leverancier_naam: kaart.leverancier_naam,
            supplier_product_id: kaart.supplier_product_id,
            foto_data_url: kaart.fotoNieuw,
        });
        setBezig(false);

        if (res.error) {
            setFout(res.error === 'validation' ? 'Er klopt iets niet in de ingevulde waarden.' : res.error);
            return;
        }
        if (!res.data) return;
        showToast(`${res.data.naam} · ${nummer(res.data.totaal)} ${res.data.eenheid} vastgelegd`, 'success');
        onKlaar({ id: res.data.id, totaal: res.data.totaal, foto_url: res.data.foto_url });
    }

    const foto = kaart.fotoNieuw ?? kaart.fotoBestaand;

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 40px', maxWidth: 620, margin: '0 auto' }}>
            <button onClick={onSluit} style={{ ...terugKnopStyle, marginBottom: 16 }}>
                <ArrowLeft size={15} /> Terug
            </button>

            {/* Naam */}
            <input
                value={kaart.naam}
                onChange={(e) => zet({ naam: e.target.value })}
                placeholder="Productnaam"
                style={{
                    width: '100%', border: 'none', background: 'transparent', color: 'var(--text)',
                    fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 25, padding: 0,
                    marginBottom: 4, outline: 'none',
                }}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
                {[kaart.leverancier_naam || 'geen leverancier', ZONES.find((z) => z.key === zone)?.label].join(' · ')}
                {kaart.vorigeStand != null && (
                    <> · stond op {nummer(kaart.vorigeStand)} {kaart.eenheid}</>
                )}
            </div>

            {/* Foto als bewijs */}
            <input ref={fotoInput} type="file" accept="image/*" capture="environment" onChange={maakFoto} style={{ display: 'none' }} />
            <button
                onClick={() => fotoInput.current?.click()}
                style={{
                    ...kaartStyle, width: '100%', padding: foto ? 0 : '18px 16px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    minHeight: 64, overflow: 'hidden', textAlign: 'left', touchAction: 'manipulation',
                }}
            >
                {foto ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto} alt="" style={{ width: 84, height: 84, objectFit: 'cover', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--muted)', padding: '0 14px' }}>
                            {kaart.fotoNieuw ? 'Nieuwe foto — wordt opgeslagen bij het vastleggen' : 'Foto van een eerdere telling'}
                            <span style={{ display: 'block', color: GOLD, marginTop: 3 }}>Tik om opnieuw te fotograferen</span>
                        </span>
                    </>
                ) : (
                    <>
                        <Camera size={19} style={{ color: GOLD, flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>
                            Foto van het pak
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                Zodat je later weet wélke je bedoelde
                            </span>
                        </span>
                    </>
                )}
            </button>

            {/* De rekenhulp */}
            <div style={{ ...kaartStyle, padding: 18, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Hoeveel heb je liggen?</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                    Tel de pakken, en zet erbij wat er in één pak zit.
                </div>

                <Veldje label="Aantal pakken">
                    <Stepper
                        waarde={kaart.aantalPakken}
                        onTyp={(w) => zet({ aantalPakken: w })}
                        onStap={stap}
                    />
                </Veldje>

                <div style={{ height: 14 }} />

                <Veldje label="Inhoud per pak">
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={kaart.inhoudPerPak}
                            onChange={(e) => zet({ inhoudPerPak: e.target.value })}
                            style={{ ...veldStyle, flex: 1, textAlign: 'right', fontSize: 18 }}
                        />
                        <select
                            value={kaart.eenheid}
                            onChange={(e) => wisselEenheid(e.target.value)}
                            style={{ ...veldStyle, width: 108, fontSize: 15 }}
                        >
                            {[...new Set([kaart.eenheid, ...EENHEDEN])].map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    </div>
                </Veldje>

                {/* De som — navertelbaar, geen magie */}
                <div style={{
                    marginTop: 16, padding: '14px 16px', borderRadius: 10,
                    background: totaal > 0 ? `${GOLD}14` : 'transparent',
                    border: `1px solid ${totaal > 0 ? `${GOLD}44` : 'var(--border)'}`,
                    textAlign: 'center',
                }}>
                    {som ? (
                        <>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{som}</div>
                            <div style={{
                                fontFamily: 'Outfit, sans-serif', fontSize: 27, fontWeight: 300, color: GOLD,
                                fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                            }}>
                                {nummer(totaal)} {kaart.eenheid}
                            </div>
                            {/* Een telling overschrijft de stand. Bij een hertelling moet je
                                dus zien wat je vervangt vóórdat je opslaat — anders merk je
                                een verkeerde pakmaat pas als de bestellijst gek doet. */}
                            {kaart.vorigeStand != null && Math.abs(kaart.vorigeStand - totaal) > 0.001 && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                                    stond op {nummer(kaart.vorigeStand)} {kaart.eenheid} → wordt {nummer(totaal)} {kaart.eenheid}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vul aantal en inhoud in</div>
                    )}
                </div>
            </div>

            {/* Par-level — voedt de bestellijst */}
            <div style={{ ...kaartStyle, padding: 18, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Hoeveel wil je minimaal hebben?</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    Zak je hieronder, dan zet de app dit product op je bestellijst — samen met wat je
                    cateringen nog vragen. Leeg laten mag; dan blijft het alleen meetellen voor je events.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={kaart.par}
                        onChange={(e) => zet({ par: e.target.value })}
                        placeholder="0"
                        style={{ ...veldStyle, flex: 1, textAlign: 'right', fontSize: 18 }}
                    />
                    <span style={{ fontSize: 14, color: 'var(--muted)', width: 100 }}>{kaart.eenheid}</span>
                </div>
                {totaal > 0 && kaart.par.trim() === '' && (
                    <button
                        onClick={() => zet({ par: String(totaal) })}
                        style={{
                            marginTop: 10, background: 'transparent', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '9px 12px', minHeight: 40, color: GOLD,
                            fontSize: 12, cursor: 'pointer', touchAction: 'manipulation',
                        }}
                    >
                        Neem over wat er nu ligt ({nummer(totaal)} {kaart.eenheid})
                    </button>
                )}
            </div>

            {/* Prijs — eerlijk over wat we wel en niet weten */}
            <div style={{ ...kaartStyle, padding: '14px 16px', marginBottom: 20 }}>
                {kaart.prijs ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                        Inkoopprijs{' '}
                        <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(kaart.prijs.euro)} per {kaart.eenheid}</span>{' '}
                        <span style={{ opacity: .8 }}>({kaart.prijs.bron})</span>
                        {totaal > 0 && <> · deze telling is <span style={{ color: 'var(--text)' }}>{fmt(kaart.prijs.euro * totaal)}</span> waard</>}
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                        Nog geen kostprijs bekend voor dit product. De telling klopt straks wél — de
                        waarde vult zich zodra er een factuur of prijslijst aan hangt.
                    </div>
                )}
            </div>

            {fout && (
                <div style={{
                    padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13,
                    background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: 'var(--red)',
                }}>
                    {fout}
                </div>
            )}

            <button
                onClick={opslaan}
                disabled={bezig || totaal <= 0}
                style={{
                    width: '100%', minHeight: 54, borderRadius: 12, border: 'none',
                    background: totaal > 0 ? GOLD : 'var(--border)',
                    color: totaal > 0 ? '#14140f' : 'var(--muted)',
                    fontSize: 15, fontWeight: 700, cursor: bezig || totaal <= 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    touchAction: 'manipulation',
                }}
            >
                {bezig ? <Loader2 size={17} style={DRAAIT} /> : <Check size={17} />}
                {bezig ? 'Bezig…' : 'Vastleggen en verder'}
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   KLEINE BOUWSTENEN
   ═══════════════════════════════════════════════════════════════════ */

function Stepper({ waarde, onTyp, onStap }: {
    waarde: string;
    onTyp: (w: string) => void;
    /* Stapjes lopen via de ouder, die ze op de vórige stand toepast — zie
       de toelichting bij onWijzig in TelKaart. */
    onStap: (delta: number) => void;
}) {
    const knop: React.CSSProperties = {
        width: 52, height: 52, borderRadius: 11, flexShrink: 0,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--border)',
        color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center',
        touchAction: 'manipulation',
    };
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => onStap(-1)} aria-label="Eén minder" style={knop}>
                <Minus size={18} />
            </button>
            <input
                type="text"
                inputMode="decimal"
                value={waarde}
                onChange={(e) => onTyp(e.target.value)}
                style={{ ...veldStyle, flex: 1, textAlign: 'center', fontSize: 22, height: 52 }}
            />
            <button onClick={() => onStap(1)} aria-label="Eén meer" style={knop}>
                <Plus size={18} />
            </button>
        </div>
    );
}

function Veldje({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block' }}>
            <span style={{
                display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 7,
                textTransform: 'uppercase', letterSpacing: '.06em',
            }}>{label}</span>
            {children}
        </label>
    );
}

function Kopje({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em',
            margin: '16px 2px 8px', fontWeight: 600,
        }}>{children}</div>
    );
}

function RijKnop({ titel, onder, rechts, rechtsGedimd, foto, geteldVink, onClick }: {
    titel: string;
    onder: string;
    rechts?: string | null;
    rechtsGedimd?: boolean;
    foto?: string | null;
    geteldVink?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                ...kaartStyle, width: '100%', marginBottom: 8, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                minHeight: 62, textAlign: 'left', touchAction: 'manipulation',
            }}
        >
            {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            ) : geteldVink ? (
                <span style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'rgba(34,197,94,.12)', color: 'var(--green)',
                }}><Check size={17} /></span>
            ) : null}

            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                    display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{titel}</span>
                <span style={{
                    display: 'block', fontSize: 11, color: 'var(--muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{onder}</span>
            </span>

            {rechts && (
                <span style={{
                    fontSize: 11, flexShrink: 0, textAlign: 'right',
                    color: rechtsGedimd ? 'var(--muted-light)' : GOLD,
                    fontVariantNumeric: 'tabular-nums',
                }}>{rechts}</span>
            )}
            <ChevronRight size={15} style={{ color: 'var(--muted-light)', flexShrink: 0 }} />
        </button>
    );
}

/* ─── Stijl + formattering ────────────────────────────────────────── */

const kaartStyle: React.CSSProperties = {
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text)',
};

const veldStyle: React.CSSProperties = {
    height: 48,
    borderRadius: 10,
    padding: '0 12px',
    background: 'var(--color-bg-deep)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 15,
    outline: 'none',
    fontVariantNumeric: 'tabular-nums',
};

const terugKnopStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 9,
    padding: '9px 13px', minHeight: 42, color: 'var(--muted)',
    fontSize: 13, cursor: 'pointer', textDecoration: 'none', touchAction: 'manipulation',
};

/** Komma-notatie, zonder nutteloze nullen: 4 blijft 4, 1.5 wordt 1,5. */
function nummer(n: number): string {
    return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Tekstveld → getal. Accepteert zowel komma als punt. */
function getal(s: string): number {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}
