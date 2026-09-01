'use client';

/**
 * De stappenlijst van een gerecht — zichtbaar én invulbaar.
 *
 * Golf 2 gaf de planning het onderscheid tussen handtijd en wachttijd, maar de
 * enige bron van die getallen was de ontleder, en die haalt alleen uit een
 * recept wat erin staat. De gerookte bavette heeft een bereidingswijze van drie
 * regels zonder één tijd, dus kwam er niets. Terecht — maar daarmee stond het
 * hele onderscheid stil, en de opgeslagen stappen werden bovendien door geen
 * enkel scherm getoond.
 *
 * Hier vul je ze zelf in. Wat je leeg laat blijft leeg: het kookbord zegt dan
 * "duur onbekend" in plaats van een kwartier te verzinnen.
 *
 * De totalen onderaan komen uit dezelfde functies als het kookbord
 * (`totalenPerPlaats`), zodat de twee schermen niet uit elkaar kunnen lopen.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Loader2, Eye, Home, Truck, MapPin } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { bewaarStappenlijst } from '../actions';
import { totalenPerPlaats, PLAATSEN, type Plaats, type ReceptStap } from '@/lib/prep/stapPlanning';
import { formatMin } from '@/lib/prep/werkvolgorde';

/** Dezelfde lijst die de ontleder mag gebruiken — zie /api/recept/ontleden. */
const ACTIES = [
    'snijden', 'mise-en-place', 'marineren', 'pekelen', 'smoken', 'sous-vide',
    'bakken', 'koken', 'blenden', 'emulgeren', 'koelen', 'invriezen',
    'portioneren', 'afwerken', 'uitgifte',
] as const;

const PLAATS_LABEL: Record<Plaats, string> = {
    thuis: 'Thuis',
    bus: 'In de bus',
    locatie: 'Op locatie',
};

export interface StapRij {
    /** Null bij een stap die je zojuist hebt toegevoegd. */
    id: string | null;
    tekst: string;
    actie: string | null;
    prep_group: string | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    plaats: Plaats;
    toezicht_nodig: boolean;
    bron: string | null;
}

interface Props {
    gerechtId: string;
    beginStappen: StapRij[];
}

/** Lege invoer is geen nul maar geen antwoord. */
function parseMinuten(raw: string): number | null {
    const t = raw.trim();
    if (t === '') return null;
    if (!/^\d{1,5}$/.test(t)) return null;
    return Number(t);
}

function toonMinuten(v: number | null): string {
    return v == null ? '' : String(v);
}

export default function StappenlijstEditor({ gerechtId, beginStappen }: Props) {
    const showToast = useToast();
    const [rijen, setRijen] = useState<StapRij[]>(beginStappen);
    const [vuil, setVuil] = useState(false);
    const [bezig, setBezig] = useState(false);

    /* Wat de gebruiker net typt, als tekst. Een half getypte "1" mag niet
       meteen als 1 minuut in de staat belanden en daarna weer verdwijnen. */
    const [tekstVelden, setTekstVelden] = useState<Record<string, string>>({});

    const totalen = useMemo(
        () => totalenPerPlaats(rijen as unknown as ReceptStap[]),
        [rijen],
    );
    const gebruikePlaatsen = PLAATSEN.filter((p) => totalen[p].stappen > 0);

    function pas(index: number, patch: Partial<StapRij>) {
        setRijen((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
        setVuil(true);
    }

    function verplaats(index: number, richting: -1 | 1) {
        const doel = index + richting;
        if (doel < 0 || doel >= rijen.length) return;
        setRijen((prev) => {
            const kopie = [...prev];
            [kopie[index], kopie[doel]] = [kopie[doel], kopie[index]];
            return kopie;
        });
        setVuil(true);
    }

    function verwijder(index: number) {
        setRijen((prev) => prev.filter((_, i) => i !== index));
        setVuil(true);
    }

    function voegToe() {
        setRijen((prev) => [...prev, {
            id: null,
            tekst: '',
            actie: null,
            prep_group: null,
            duur_actief_min: null,
            duur_passief_min: null,
            plaats: 'thuis',
            toezicht_nodig: false,
            bron: 'handmatig',
        }]);
        setVuil(true);
    }

    async function bewaar() {
        const leeg = rijen.findIndex((r) => r.tekst.trim().length === 0);
        if (leeg >= 0) {
            showToast(`Stap ${leeg + 1} heeft nog geen omschrijving.`, 'error');
            return;
        }
        setBezig(true);
        try {
            const res = await bewaarStappenlijst({
                gerecht_id: gerechtId,
                stappen: rijen.map((r) => ({
                    id: r.id,
                    tekst: r.tekst.trim(),
                    actie: r.actie,
                    prep_group: r.prep_group,
                    duur_actief_min: r.duur_actief_min,
                    duur_passief_min: r.duur_passief_min,
                    plaats: r.plaats,
                    toezicht_nodig: r.toezicht_nodig,
                })),
            });
            if ('error' in res) {
                showToast(res.error, 'error');
                return;
            }
            setVuil(false);
            setTekstVelden({});
            showToast(
                `Stappenlijst bewaard — ${res.data.aantal} ${res.data.aantal === 1 ? 'stap' : 'stappen'}, `
                + `${formatMin(res.data.actief_min)} handwerk.`,
                'success',
            );
            /* De ids van nieuwe rijen kent de server; opnieuw laden is de
               eerlijkste manier om ze binnen te halen zonder ze te raden. */
            if (res.data.toegevoegd > 0 || res.data.verwijderd > 0) {
                window.location.reload();
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Bewaren mislukt.', 'error');
        } finally {
            setBezig(false);
        }
    }

    const veldStijl: React.CSSProperties = {
        height: 34, padding: '0 8px', borderRadius: 7,
        border: '1px solid var(--border)', background: 'var(--bg-subtle, #14141a)',
        color: 'var(--text)', fontSize: 13,
    };
    const labelStijl: React.CSSProperties = {
        display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
        textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3,
    };

    return (
        <section style={{ marginTop: 32 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Stappen</h2>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Handtijd kost een persoon, wachttijd kost alleen een apparaat.
                </span>
                <span style={{ flex: 1 }} />
                <button
                    type="button"
                    onClick={voegToe}
                    style={{ ...veldStijl, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                    <Plus size={14} /> Stap toevoegen
                </button>
                <button
                    type="button"
                    onClick={bewaar}
                    disabled={!vuil || bezig}
                    style={{
                        ...veldStijl,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        cursor: vuil && !bezig ? 'pointer' : 'default',
                        background: vuil ? 'var(--brand, #FFBF00)' : 'var(--bg-subtle, #14141a)',
                        color: vuil ? '#1a1a1a' : 'var(--muted)',
                        borderColor: vuil ? 'var(--brand, #FFBF00)' : 'var(--border)',
                        fontWeight: 700,
                    }}
                >
                    {bezig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {bezig ? 'Bewaren…' : 'Bewaren'}
                </button>
            </header>

            {rijen.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '14px 0 0' }}>
                    Nog geen stappen. Gebruik <strong>In stappen zetten</strong> hierboven om ze uit de
                    bereidingswijze te laten halen, of voeg ze met de hand toe.
                </p>
            ) : (
                <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rijen.map((rij, i) => {
                        const sleutel = rij.id ?? `nieuw-${i}`;
                        return (
                            <li
                                key={sleutel}
                                style={{
                                    padding: '12px 14px', borderRadius: 10,
                                    background: 'var(--card)', border: '1px solid var(--border)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <span style={{
                                        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'var(--bg-subtle, #14141a)', border: '1px solid var(--border)',
                                        fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                                    }}>{i + 1}</span>
                                    <input
                                        type="text"
                                        value={rij.tekst}
                                        aria-label={`Omschrijving stap ${i + 1}`}
                                        placeholder="Wat doe je hier?"
                                        onChange={(e) => pas(i, { tekst: e.target.value })}
                                        style={{ ...veldStijl, flex: 1, minWidth: 0, fontWeight: 600 }}
                                    />
                                    <button
                                        type="button" onClick={() => verplaats(i, -1)} disabled={i === 0}
                                        aria-label={`Stap ${i + 1} omhoog`}
                                        style={{ ...veldStijl, width: 34, padding: 0, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}
                                    ><ArrowUp size={14} /></button>
                                    <button
                                        type="button" onClick={() => verplaats(i, 1)} disabled={i === rijen.length - 1}
                                        aria-label={`Stap ${i + 1} omlaag`}
                                        style={{ ...veldStijl, width: 34, padding: 0, cursor: i === rijen.length - 1 ? 'default' : 'pointer', opacity: i === rijen.length - 1 ? 0.4 : 1 }}
                                    ><ArrowDown size={14} /></button>
                                    <button
                                        type="button" onClick={() => verwijder(i)}
                                        aria-label={`Stap ${i + 1} verwijderen`}
                                        style={{ ...veldStijl, width: 34, padding: 0, cursor: 'pointer', color: '#f8a3a3' }}
                                    ><Trash2 size={14} /></button>
                                </div>

                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ width: 150 }}>
                                        <label style={labelStijl} htmlFor={`actie-${sleutel}`}>Soort handeling</label>
                                        <select
                                            id={`actie-${sleutel}`}
                                            value={rij.actie ?? ''}
                                            onChange={(e) => pas(i, { actie: e.target.value || null })}
                                            style={{ ...veldStijl, width: '100%' }}
                                        >
                                            <option value="">— kies —</option>
                                            {ACTIES.map((a) => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ width: 110 }}>
                                        <label style={labelStijl} htmlFor={`actief-${sleutel}`}>Handtijd (min)</label>
                                        <input
                                            id={`actief-${sleutel}`}
                                            type="text" inputMode="numeric" placeholder="leeg = onbekend"
                                            value={tekstVelden[`a${sleutel}`] ?? toonMinuten(rij.duur_actief_min)}
                                            onChange={(e) => {
                                                setTekstVelden((p) => ({ ...p, [`a${sleutel}`]: e.target.value }));
                                                pas(i, { duur_actief_min: parseMinuten(e.target.value) });
                                            }}
                                            style={{ ...veldStijl, width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ width: 110 }}>
                                        <label style={labelStijl} htmlFor={`passief-${sleutel}`}>Wachttijd (min)</label>
                                        <input
                                            id={`passief-${sleutel}`}
                                            type="text" inputMode="numeric" placeholder="leeg = onbekend"
                                            value={tekstVelden[`p${sleutel}`] ?? toonMinuten(rij.duur_passief_min)}
                                            onChange={(e) => {
                                                setTekstVelden((p) => ({ ...p, [`p${sleutel}`]: e.target.value }));
                                                pas(i, { duur_passief_min: parseMinuten(e.target.value) });
                                            }}
                                            style={{ ...veldStijl, width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ width: 130 }}>
                                        <label style={labelStijl} htmlFor={`plaats-${sleutel}`}>Waar</label>
                                        <select
                                            id={`plaats-${sleutel}`}
                                            value={rij.plaats}
                                            onChange={(e) => pas(i, { plaats: e.target.value as Plaats })}
                                            style={{ ...veldStijl, width: '100%' }}
                                        >
                                            {PLAATSEN.map((p) => <option key={p} value={p}>{PLAATS_LABEL[p]}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                                        <label style={labelStijl} htmlFor={`groep-${sleutel}`}>
                                            Groepeersleutel
                                        </label>
                                        <input
                                            id={`groep-${sleutel}`}
                                            type="text" placeholder="bv. sjalot-brunoise"
                                            value={rij.prep_group ?? ''}
                                            onChange={(e) => pas(i, { prep_group: e.target.value || null })}
                                            style={{ ...veldStijl, width: '100%' }}
                                        />
                                    </div>

                                    <label style={{
                                        ...veldStijl, display: 'inline-flex', alignItems: 'center', gap: 7,
                                        cursor: 'pointer', paddingRight: 12,
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={rij.toezicht_nodig}
                                            onChange={(e) => pas(i, { toezicht_nodig: e.target.checked })}
                                        />
                                        <Eye size={13} />
                                        <span>Blijf erbij</span>
                                    </label>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}

            {gebruikePlaatsen.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                    {gebruikePlaatsen.map((p) => {
                        const t = totalen[p];
                        const Icoon = p === 'locatie' ? MapPin : p === 'bus' ? Truck : Home;
                        return (
                            <div key={p} style={{
                                flex: '1 1 200px', padding: '10px 14px', borderRadius: 10,
                                background: 'var(--card)', border: '1px solid var(--border)',
                            }}>
                                <span style={{ ...labelStijl, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Icoon size={12} /> {PLAATS_LABEL[p]}
                                </span>
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                                    {formatMin(t.actiefMin)} handwerk
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    {t.passiefMin > 0 ? `${formatMin(t.passiefMin)} wachten · ` : ''}
                                    {t.stappen} {t.stappen === 1 ? 'stap' : 'stappen'}
                                    {t.onbekend > 0 ? ` · ${t.onbekend} zonder tijd` : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12, maxWidth: 760, lineHeight: 1.55 }}>
                Wat je leeg laat blijft leeg — het kookbord zegt dan &ldquo;duur onbekend&rdquo; in plaats van een
                getal te verzinnen. De groepeersleutel bundelt dezelfde bewerking over recepten heen: geef
                het snijden van sjalot in drie gerechten dezelfde sleutel en het wordt één taak op de dag
                dat je ze maakt.
            </p>
        </section>
    );
}
