'use client';

/**
 * Gastronorm tellen — één keer je bakken langslopen.
 *
 * Waarom een eigen scherm en niet de gewone materieel-invoer: de maten van een
 * GN-bak liggen wereldwijd vast (EN 631-1) en staan al in de kennisbank. Jij
 * hoeft dus alleen te zeggen hoevéél je er hebt en waar ze liggen. Dat is een
 * teller naast een lijstje, geen formulier per bak.
 *
 * Gebruikt het bestaande mr-drawer-patroon uit src/styles/menu-hub.css: rechter
 * lade, geen gecentreerde modal.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { saveGnTelling } from '../actions';

/* menu-hub.css is de bron van de `mr-*`-klassen, maar wordt normaal alleen in
   de gerechten-sectie geladen (zie src/app/gerechten/layout.tsx). Hier expliciet
   importeren, anders rendert de lade ongestyled op /materieel. */
import '@/styles/menu-hub.css';

interface GnMaat {
    code: string;
    naam: string;
    lengte_mm: number;
    breedte_mm: number;
    diepte_mm: number;
    inhoud_liter: number | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /* Krijgt het resultaat mee zodat de pagina een toast kan tonen. Een melding
       in de lade zelf overleeft het verversen van de lijst niet — dan zou je
       opslaan zonder enige bevestiging, en stil succes is net zo verwarrend
       als een stille fout. */
    onSaved?: (resultaat: { bewaard: number; verwijderd: number }) => void;
}

const LOCATIES = ['Keuken', 'Bus', 'Opslag'];

/** '1/1-65' → '1/1'. Groepeert de lijst per formaat zodat je de dieptes van
 *  hetzelfde formaat onder elkaar ziet — dan valt op wat je mist. */
function formaatVan(code: string): string {
    return code.split('-')[0];
}

export default function GnBakkenDrawer({ open, onClose, onSaved }: Props) {
    const [maten, setMaten] = useState<GnMaat[]>([]);
    const [aantallen, setAantallen] = useState<Record<string, number>>({});
    const [locaties, setLocaties] = useState<Record<string, string>>({});
    const [laden, setLaden] = useState(false);
    const [bewaren, setBewaren] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const [klaar, setKlaar] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let afgebroken = false;

        (async () => {
            setLaden(true);
            setFout(null);
            try {
                const sb = supabase;
                if (!sb) throw new Error('Geen verbinding met de database');

                const { data: gn, error: gnErr } = await sb
                    .from('gn_maten')
                    .select('code, naam, lengte_mm, breedte_mm, diepte_mm, inhoud_liter')
                    .order('lengte_mm', { ascending: false })
                    .order('diepte_mm', { ascending: true });
                if (gnErr) throw new Error(gnErr.message);

                // Wat je al geteld hebt, zodat je verder telt in plaats van
                // opnieuw begint.
                const { data: mijn } = await sb
                    .from('materieel')
                    .select('gn_code, aantal, locatie')
                    .not('gn_code', 'is', null);

                if (afgebroken) return;
                setMaten((gn ?? []) as GnMaat[]);
                const a: Record<string, number> = {};
                const l: Record<string, string> = {};
                for (const r of mijn ?? []) {
                    if (!r.gn_code) continue;
                    a[r.gn_code] = r.aantal ?? 0;
                    if (r.locatie) l[r.gn_code] = r.locatie;
                }
                setAantallen(a);
                setLocaties(l);
            } catch (e) {
                if (!afgebroken) setFout(e instanceof Error ? e.message : 'Kon de maten niet laden');
            } finally {
                if (!afgebroken) setLaden(false);
            }
        })();

        return () => {
            afgebroken = true;
        };
    }, [open]);

    const groepen = useMemo(() => {
        const g = new Map<string, GnMaat[]>();
        for (const m of maten) {
            const f = formaatVan(m.code);
            if (!g.has(f)) g.set(f, []);
            g.get(f)!.push(m);
        }
        return [...g.entries()];
    }, [maten]);

    const totaal = useMemo(
        () => Object.values(aantallen).reduce((s, n) => s + (n || 0), 0),
        [aantallen]
    );
    const soorten = useMemo(
        () => Object.values(aantallen).filter((n) => n > 0).length,
        [aantallen]
    );

    async function bewaar() {
        setBewaren(true);
        setFout(null);
        setKlaar(null);
        try {
            const items = maten
                .map((m) => ({
                    gn_code: m.code,
                    aantal: aantallen[m.code] ?? 0,
                    locatie: locaties[m.code] ?? null,
                }))
                // Alleen sturen wat je hebt óf wat je op nul zet nadat je het
                // eerder had — de rest is ruis.
                .filter((i) => i.aantal > 0 || aantallen[i.gn_code] === 0);

            const res = await saveGnTelling({ items });
            if (res.error) throw new Error(res.error);
            const resultaat = { bewaard: res.data?.bewaard ?? 0, verwijderd: res.data?.verwijderd ?? 0 };
            setKlaar(
                `${resultaat.bewaard} formaten bewaard` +
                    (resultaat.verwijderd ? `, ${resultaat.verwijderd} verwijderd` : '')
            );
            onSaved?.(resultaat);
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Opslaan mislukt');
        } finally {
            setBewaren(false);
        }
    }

    if (!open) return null;

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} />
            <div className="mr-drawer" style={{ maxWidth: 620 }}>
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info">
                        <div style={{ fontSize: 17, fontWeight: 600 }}>Gastronorm tellen</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                            De maten staan al vast — vul alleen in hoeveel je er hebt en waar ze liggen.
                        </div>
                    </div>
                    <button className="mr-drawer-close" onClick={onClose} aria-label="Sluiten">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 20px' }}>
                    {laden && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand)' }} />
                        </div>
                    )}

                    {!laden &&
                        groepen.map(([formaat, rijen]) => (
                            <div key={formaat} style={{ marginTop: 18 }}>
                                <div
                                    style={{
                                        fontSize: 11,
                                        letterSpacing: '.12em',
                                        textTransform: 'uppercase',
                                        color: 'var(--muted)',
                                        paddingBottom: 6,
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    GN {formaat}
                                </div>

                                {rijen.map((m) => {
                                    const n = aantallen[m.code] ?? 0;
                                    return (
                                        <div
                                            key={m.code}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '9px 0',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13.5 }}>{m.diepte_mm} mm diep</div>
                                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                    {m.lengte_mm} × {m.breedte_mm} mm
                                                    {m.inhoud_liter ? ` · ${String(m.inhoud_liter).replace('.', ',')} liter` : ''}
                                                </div>
                                            </div>

                                            <input
                                                type="number"
                                                min={0}
                                                max={999}
                                                value={n === 0 ? '' : n}
                                                placeholder="0"
                                                onChange={(e) =>
                                                    setAantallen((p) => ({
                                                        ...p,
                                                        [m.code]: Math.max(0, Number(e.target.value) || 0),
                                                    }))
                                                }
                                                style={{
                                                    width: 62,
                                                    padding: '7px 8px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-card)',
                                                    color: 'var(--text)',
                                                    fontSize: 14,
                                                    textAlign: 'center',
                                                }}
                                            />

                                            <select
                                                value={locaties[m.code] ?? ''}
                                                onChange={(e) =>
                                                    setLocaties((p) => ({ ...p, [m.code]: e.target.value }))
                                                }
                                                disabled={n === 0}
                                                style={{
                                                    width: 108,
                                                    padding: '7px 8px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-card)',
                                                    color: n === 0 ? 'var(--muted)' : 'var(--text)',
                                                    fontSize: 12.5,
                                                }}
                                            >
                                                <option value="">Waar?</option>
                                                {LOCATIES.map((l) => (
                                                    <option key={l} value={l}>
                                                        {l}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                </div>

                <div className="mr-drawer-footer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--muted)' }}>
                        {fout ? (
                            <span style={{ color: 'var(--status-danger-text, #ff6b6b)' }}>{fout}</span>
                        ) : klaar ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Check size={14} /> {klaar}
                            </span>
                        ) : totaal > 0 ? (
                            `${totaal} bakken in ${soorten} formaten`
                        ) : (
                            'Nog niets geteld'
                        )}
                    </div>
                    <button
                        onClick={bewaar}
                        disabled={bewaren || laden}
                        style={{
                            padding: '10px 18px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--brand)',
                            color: '#000',
                            fontSize: 13.5,
                            fontWeight: 600,
                            cursor: bewaren || laden ? 'default' : 'pointer',
                            opacity: bewaren || laden ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {bewaren ? 'Bewaren…' : 'Telling bewaren'}
                    </button>
                </div>
            </div>
        </>
    );
}
