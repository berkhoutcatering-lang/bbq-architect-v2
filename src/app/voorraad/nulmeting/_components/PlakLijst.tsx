'use client';

/**
 * PlakLijst — je kladblaadje in één keer de app in.
 *
 * Ontstaan uit veldwerk: product voor product opzoeken en aantikken werkt niet
 * als je met twintig regels voor een open vriezer staat. Je hebt de lijst al —
 * op papier, in je notities-app, in een appje aan jezelf. Plak hem.
 *
 * Twee schermen:
 *   1. Plakken   — één tekstvak, verder niets.
 *   2. Nalopen   — wat de app ervan begrepen heeft, regel voor regel, met de
 *                  som erbij zodat je het kunt controleren. Alles aanpasbaar.
 *
 * De regel is dezelfde als overal: liever vragen dan gokken. Een regel die niet
 * te lezen was springt eruit; een regel die op twee manieren te lezen is krijgt
 * een tip met een knop ernaast, geen rode vlag — anders staat de halve lijst in
 * het rood en klik je er doorheen.
 */

import { useState, useMemo } from 'react';
import { ArrowLeft, ClipboardPaste, Check, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import {
    parseerLijst, regelSom, regelTotaal, wisselEenheid,
    type GeparseerdeRegel,
} from '@/lib/voorraadRegelParser';
import { ZONES, type Zone } from '@/lib/voorraadTelling';
import { telLijst } from '../actions';

const GOLD = '#c4a35a';
const EENHEDEN = ['kg', 'g', 'liter', 'ml', 'stuks'] as const;
const DRAAIT: React.CSSProperties = { animation: 'spin 1s linear infinite' };

export default function PlakLijst({ zone, onKlaar, onSluit }: {
    zone: Zone;
    onKlaar: () => void;
    onSluit: () => void;
}) {
    const showToast = useToast();
    const [tekst, setTekst] = useState('');
    const [regels, setRegels] = useState<GeparseerdeRegel[] | null>(null);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const zoneNaam = ZONES.find((z) => z.key === zone)?.label ?? '';

    const teControleren = useMemo(
        () => (regels ?? []).filter((r) => !r.zeker).length,
        [regels],
    );

    function lees() {
        const g = parseerLijst(tekst);
        if (g.length === 0) {
            setFout('Ik kon hier geen producten in vinden. Zet elk product op een eigen regel.');
            return;
        }
        setFout(null);
        setRegels(g);
    }

    function pasAan(i: number, wijziging: Partial<GeparseerdeRegel>) {
        setRegels((vorig) => vorig?.map((r, n) => (n === i ? { ...r, ...wijziging } : r)) ?? vorig);
    }

    function naarStuks(i: number) {
        setRegels((vorig) => vorig?.map((r, n) => (n === i ? wisselEenheid(r, 'stuks') : r)) ?? vorig);
    }

    function wisEenheid(i: number, nieuw: string) {
        setRegels((vorig) => vorig?.map((r, n) => (n === i ? wisselEenheid(r, nieuw) : r)) ?? vorig);
    }

    function verwijder(i: number) {
        setRegels((vorig) => vorig?.filter((_, n) => n !== i) ?? vorig);
    }

    async function opslaan() {
        if (!regels || regels.length === 0) return;
        const bruikbaar = regels.filter((r) => regelTotaal(r) > 0 && r.naam.trim());
        if (bruikbaar.length === 0) {
            setFout('Er staat nog niets bruikbaars in — vul bij elke regel een aantal in.');
            return;
        }

        setBezig(true);
        setFout(null);
        const res = await telLijst({
            zone,
            regels: bruikbaar.map((r) => ({
                naam: r.naam.trim(),
                aantal_pakken: r.aantal,
                inhoud_per_pak: r.inhoud ?? 1,
                eenheid: r.eenheid,
                par_level: 0,
            })),
        });
        setBezig(false);

        if (res.error) {
            setFout(res.error === 'validation' ? 'Er klopt iets niet in de ingevulde waarden.' : res.error);
            return;
        }
        if (!res.data) return;

        const { opgeslagen, mislukt, resultaten } = res.data;
        if (mislukt > 0) {
            const eerste = resultaten.find((r) => !r.gelukt);
            showToast(`${opgeslagen} vastgelegd, ${mislukt} mislukt — bv. ${eerste?.naam}: ${eerste?.fout}`, 'warning');
        } else {
            showToast(`${opgeslagen} producten vastgelegd in de ${zoneNaam.toLowerCase()}`, 'success');
        }
        onKlaar();
    }

    /* ── Scherm 1: plakken ─────────────────────────────────────────────── */
    if (regels === null) {
        return (
            <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 40px', maxWidth: 620, margin: '0 auto' }}>
                <button onClick={onSluit} style={{ ...terugKnop, marginBottom: 16 }}>
                    <ArrowLeft size={15} /> Terug
                </button>

                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 26, margin: '0 0 6px' }}>
                    Lijst plakken · {zoneNaam}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                    Heb je je voorraad al op papier of in je notities staan? Plak hem hieronder,
                    één product per regel. Schrijf gewoon zoals je het opschrijft — de app rekent
                    de pakken om en laat je daarna alles nalopen.
                </p>

                <textarea
                    value={tekst}
                    onChange={(e) => setTekst(e.target.value)}
                    rows={12}
                    placeholder={'11x pulled beef 500g\n40kg pulled pork\n34x kruidenboter\n900 gram coppa ham'}
                    style={{
                        width: '100%', borderRadius: 12, padding: 14, fontSize: 15, lineHeight: 1.7,
                        background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
                        color: 'var(--text)', outline: 'none', resize: 'vertical',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                />

                {fout && <Melding>{fout}</Melding>}

                <button
                    onClick={lees}
                    disabled={!tekst.trim()}
                    style={{ ...primaireKnop, marginTop: 14, background: tekst.trim() ? GOLD : 'var(--border)', color: tekst.trim() ? '#14140f' : 'var(--muted)' }}
                >
                    <ClipboardPaste size={17} /> Lees de lijst
                </button>
            </div>
        );
    }

    /* ── Scherm 2: nalopen ─────────────────────────────────────────────── */
    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge) 40px', maxWidth: 720, margin: '0 auto' }}>
            <button onClick={() => setRegels(null)} style={{ ...terugKnop, marginBottom: 16 }}>
                <ArrowLeft size={15} /> Lijst aanpassen
            </button>

            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 26, margin: '0 0 4px' }}>
                {regels.length} product{regels.length === 1 ? '' : 'en'} gelezen
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
                {teControleren > 0
                    ? <>Loop ze even na. <strong style={{ color: 'var(--amber)' }}>{teControleren}</strong> {teControleren === 1 ? 'regel kon ik' : 'regels kon ik'} niet helemaal plaatsen — die {teControleren === 1 ? 'staat' : 'staan'} bovenaan.</>
                    : <>Alles gelezen. Controleer de sommen en leg ze vast in de {zoneNaam.toLowerCase()}.</>}
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
                {[...regels.keys()]
                    .sort((a, b) => Number(regels[a].zeker) - Number(regels[b].zeker))
                    .map((i) => {
                        const r = regels[i];
                        return (
                            <RegelKaart
                                key={`${r.ruw}-${i}`}
                                regel={r}
                                onNaam={(naam) => pasAan(i, { naam })}
                                onAantal={(aantal) => pasAan(i, { aantal, zeker: true, opmerking: undefined })}
                                onInhoud={(inhoud) => pasAan(i, { inhoud, zeker: true, opmerking: undefined })}
                                onEenheid={(e) => wisEenheid(i, e)}
                                onStuks={() => naarStuks(i)}
                                onWeg={() => verwijder(i)}
                            />
                        );
                    })}
            </div>

            {fout && <Melding>{fout}</Melding>}

            <button
                onClick={opslaan}
                disabled={bezig}
                style={{ ...primaireKnop, marginTop: 18, background: GOLD, color: '#14140f' }}
            >
                {bezig ? <Loader2 size={17} style={DRAAIT} /> : <Check size={17} />}
                {bezig ? 'Bezig…' : `Leg ${regels.length} product${regels.length === 1 ? '' : 'en'} vast`}
            </button>

            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, marginTop: 12, textAlign: 'center' }}>
                Nog geen kostprijs bij deze producten — die vult zich zodra je ze aan een
                leverancier koppelt of er een factuur voor scant.
            </p>
        </div>
    );
}

/* ─── Eén regel ───────────────────────────────────────────────────────── */

function RegelKaart({ regel, onNaam, onAantal, onInhoud, onEenheid, onStuks, onWeg }: {
    regel: GeparseerdeRegel;
    onNaam: (v: string) => void;
    onAantal: (v: number) => void;
    onInhoud: (v: number | null) => void;
    onEenheid: (v: string) => void;
    onStuks: () => void;
    onWeg: () => void;
}) {
    const aandacht = !regel.zeker;
    return (
        <div style={{
            background: 'var(--color-bg-elevated)',
            border: `1px solid ${aandacht ? 'rgba(245,158,11,.45)' : 'var(--border)'}`,
            borderRadius: 12, padding: 14,
        }}>
            <input
                value={regel.naam}
                onChange={(e) => onNaam(e.target.value)}
                style={{
                    width: '100%', border: 'none', background: 'transparent', color: 'var(--text)',
                    fontSize: 15, fontWeight: 600, padding: 0, outline: 'none', marginBottom: 4,
                }}
            />
            <div style={{ fontSize: 10, color: 'var(--muted-light)', marginBottom: 10, fontFamily: 'ui-monospace, monospace' }}>
                {regel.ruw}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    type="text" inputMode="decimal"
                    value={String(regel.aantal).replace('.', ',')}
                    onChange={(e) => onAantal(naarGetal(e.target.value))}
                    aria-label="Aantal"
                    style={{ ...veld, width: 68, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>×</span>
                <input
                    type="text" inputMode="decimal"
                    value={regel.inhoud === null ? '' : String(regel.inhoud).replace('.', ',')}
                    onChange={(e) => onInhoud(e.target.value.trim() === '' ? null : naarGetal(e.target.value))}
                    placeholder="—"
                    aria-label="Inhoud per stuk"
                    style={{ ...veld, width: 82, textAlign: 'center' }}
                />
                <select
                    value={regel.eenheid}
                    onChange={(e) => onEenheid(e.target.value)}
                    aria-label="Eenheid"
                    style={{ ...veld, width: 92 }}
                >
                    {[...new Set([regel.eenheid, ...EENHEDEN])].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button onClick={onWeg} aria-label="Regel verwijderen" style={{
                    marginLeft: 'auto', width: 44, height: 44, borderRadius: 10,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center',
                    touchAction: 'manipulation',
                }}>
                    <Trash2 size={15} />
                </button>
            </div>

            <div style={{ fontSize: 12, color: GOLD, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                {regelTotaal(regel) > 0 ? regelSom(regel) : 'nog geen hoeveelheid'}
            </div>

            {aandacht && regel.opmerking && (
                <div style={{
                    display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 10,
                    padding: '9px 11px', borderRadius: 8, background: 'rgba(245,158,11,.1)',
                    fontSize: 11.5, color: 'var(--amber)', lineHeight: 1.5,
                }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{regel.opmerking}</span>
                </div>
            )}

            {!aandacht && regel.tip && regel.inhoud !== null && (
                <button onClick={onStuks} style={{
                    marginTop: 9, background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 11px', minHeight: 40, color: 'var(--muted)',
                    fontSize: 11.5, cursor: 'pointer', touchAction: 'manipulation', textAlign: 'left',
                }}>
                    {regel.tip}
                </button>
            )}
        </div>
    );
}

/* ─── Kleine dingen ───────────────────────────────────────────────────── */

function Melding({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            padding: '12px 14px', borderRadius: 10, marginTop: 14, fontSize: 13,
            background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: 'var(--red)',
        }}>{children}</div>
    );
}

function naarGetal(s: string): number {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

const veld: React.CSSProperties = {
    height: 44, borderRadius: 9, padding: '0 10px',
    background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 14, outline: 'none', fontVariantNumeric: 'tabular-nums',
};

const terugKnop: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 9,
    padding: '9px 13px', minHeight: 42, color: 'var(--muted)',
    fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
};

const primaireKnop: React.CSSProperties = {
    width: '100%', minHeight: 54, borderRadius: 12, border: 'none',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    touchAction: 'manipulation',
};
