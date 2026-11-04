'use client';

/**
 * Een product toevoegen aan de winkel: een bestaand product op een afdeling
 * zetten, of een nieuw product aanmaken, per stuk of op gewicht.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Scale, Search } from 'lucide-react';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import type { Afdeling } from '@/lib/winkel/afdelingen';
import { nieuwProduct, zetProductOpAfdeling } from '@/app/winkel/actions';

interface NieuwInvoer {
    naam: string;
    type: string;
    verkoop_per: 'stuk' | 'kg';
    prijs_cents: number;
    btw_pct: 0 | 9 | 21;
    ean: string | null;
    leverancier_id: number | null;
    binnen_per_sticker: boolean;
    bewaren: string | null;
    beschermende_atmosfeer: boolean;
    houdbaar_dagen: number | null;
}

/** "12,95" of "12.95" → 1295; leeg of onzin → null. */
function centen(tekst: string): number | null {
    const t = tekst.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export default function ToevoegenLade({ afdelingen, begin, producten, leveranciers, onClose }: {
    afdelingen: Afdeling[];
    begin: string | null;
    producten: { id: string; naam: string; type: string; actief: boolean; afdeling_id: string | null }[];
    leveranciers: { id: number; naam: string }[];
    onClose: () => void;
}) {
    const [afdelingId, setAfdelingId] = useState(begin ?? afdelingen[0]?.id ?? '');
    const afdeling = afdelingen.find((a) => a.id === afdelingId) ?? null;

    if (!afdeling) {
        return (
            <Drawer title="Product toevoegen" width={520} onClose={onClose}>
                <div className="kf-empty"><p>Er zijn nog geen afdelingen. Maak ze eerst aan bij Afdelingen indelen.</p></div>
            </Drawer>
        );
    }
    /* Vlees en kaas hebben andere beginwaarden: bij een andere afdeling begint het formulier opnieuw. */
    return <Formulier key={afdeling.id} afdeling={afdeling} afdelingen={afdelingen} kies={setAfdelingId} producten={producten} leveranciers={leveranciers} onClose={onClose} />;
}

function Formulier({ afdeling, afdelingen, kies, producten, leveranciers, onClose }: {
    afdeling: Afdeling;
    afdelingen: Afdeling[];
    kies: (id: string) => void;
    producten: { id: string; naam: string; type: string; actief: boolean; afdeling_id: string | null }[];
    leveranciers: { id: number; naam: string }[];
    onClose: () => void;
}) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const doe = (werk: () => Promise<{ error: string } | { data: unknown }>, gelukt: string) => start(async () => {
        const r = await werk();
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(gelukt, 'success');
        onClose();
        router.refresh();
    });
    const onBestaand = (p: { id: string; naam: string }) => doe(() => zetProductOpAfdeling({ productId: p.id, afdelingId: afdeling.id }), `${p.naam} staat nu bij ${afdeling.naam}.`);
    const onNieuw = (v: NieuwInvoer) => doe(() => nieuwProduct({ ...v, afdelingId: afdeling.id }), `${v.naam} staat erbij${v.verkoop_per === 'kg' ? ' en kan gestickerd worden' : ''}.`);
    const elders = producten
        .filter((p) => p.afdeling_id !== afdeling.id)
        .map((p) => ({ ...p, afdeling: afdelingen.find((a) => a.id === p.afdeling_id)?.naam ?? null }));

    const [modus, setModus] = useState<'zoek' | 'nieuw'>('zoek');
    const [zoek, setZoek] = useState('');
    const vlees = /vlees|slager/i.test(afdeling.naam);
    const kaas = /kaas|kazen/i.test(afdeling.naam);
    const [v, setV] = useState({
        naam: '', type: vlees ? 'vleeswaar' : kaas ? 'kaas' : 'overig', verkoop_per: (vlees || kaas ? 'kg' : 'stuk') as 'stuk' | 'kg',
        prijs: '', btw_pct: 9 as 0 | 9 | 21, ean: '', leverancier_id: '' as string, binnen_per_sticker: vlees,
        bewaren: vlees || kaas ? 'Gekoeld bewaren (max. 7 °C)' : '', beschermende_atmosfeer: vlees, houdbaar_dagen: kaas ? '14' : '',
    });
    const z = zoek.trim().toLowerCase();
    const lijst = elders.filter((p) => !z || p.naam.toLowerCase().includes(z) || p.type.includes(z))
        .sort((a, b) => Number(b.actief) - Number(a.actief) || a.naam.localeCompare(b.naam, 'nl')).slice(0, 60);
    const prijs = centen(v.prijs);
    const kg = v.verkoop_per === 'kg';
    const klaar = v.naam.trim().length > 0 && prijs != null && (kg || !v.ean || /^\d{8,14}$/.test(v.ean.trim()));

    const bewaar = () => {
        if (!klaar || prijs == null) return;
        onNieuw({
            naam: v.naam.trim(), type: v.type, verkoop_per: v.verkoop_per, prijs_cents: prijs, btw_pct: v.btw_pct,
            ean: !kg && v.ean.trim() ? v.ean.trim() : null, leverancier_id: v.leverancier_id ? Number(v.leverancier_id) : null,
            binnen_per_sticker: kg && v.binnen_per_sticker, bewaren: kg && v.bewaren.trim() ? v.bewaren.trim() : null,
            beschermende_atmosfeer: kg && v.beschermende_atmosfeer, houdbaar_dagen: kg && v.houdbaar_dagen ? Number(v.houdbaar_dagen) : null,
        });
    };

    return (
        <Drawer title="Product toevoegen" width={520} onClose={onClose}
            footer={modus === 'nieuw' ? <button type="button" className="btn btn-brand" disabled={bezig || !klaar} onClick={bewaar}>Toevoegen</button> : undefined}>
            <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                <span className="kf-eyebrow">Afdeling</span>
                <select className="kf-input" value={afdeling.id} onChange={(e) => kies(e.target.value)}>
                    {afdelingen.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}
                </select>
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <button type="button" className={modus === 'zoek' ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setModus('zoek')}><Search size={14} /> Bestaand product</button>
                <button type="button" className={modus === 'nieuw' ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setModus('nieuw')}><Plus size={14} /> Nieuw product</button>
            </div>

            {modus === 'zoek' ? (
                <>
                    <input className="kf-input" autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam of soort" style={{ width: '100%', marginBottom: 12 }} />
                    <div style={{ display: 'grid', gap: 6 }}>
                        {lijst.map((p) => (
                            <button key={p.id} type="button" className="btn btn-ghost" disabled={bezig} onClick={() => onBestaand(p)} style={{ justifyContent: 'space-between', textAlign: 'left', gap: 10 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}{!p.actief && <span style={{ color: 'var(--muted)' }}> · uit</span>}</span>
                                <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{p.afdeling ? `nu bij ${p.afdeling}` : p.type}</span>
                            </button>
                        ))}
                        {lijst.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Niets gevonden. Maak het als nieuw product aan.</div>}
                    </div>
                </>
            ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Naam (zoals op de sticker en de kassa)</span>
                        <input className="kf-input" autoFocus value={v.naam} maxLength={120} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder={vlees ? 'Nagelhout (gesneden)' : ''} />
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className={!kg ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setV({ ...v, verkoop_per: 'stuk' })}><Package size={14} /> Per stuk</button>
                        <button type="button" className={kg ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setV({ ...v, verkoop_per: 'kg' })}><Scale size={14} /> Op gewicht</button>
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">{kg ? 'Prijs per kilo (incl. btw)' : 'Prijs per stuk (incl. btw)'}</span>
                        <input className="kf-input" inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} placeholder={kg ? '59,90' : '4,95'} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Btw</span>
                        <select className="kf-input" value={v.btw_pct} onChange={(e) => setV({ ...v, btw_pct: Number(e.target.value) as 0 | 9 | 21 })}>
                            <option value={9}>9 % (eten)</option><option value={21}>21 % (alcohol, non-food)</option><option value={0}>0 %</option>
                        </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Leverancier</span>
                        <select className="kf-input" value={v.leverancier_id} onChange={(e) => setV({ ...v, leverancier_id: e.target.value })}>
                            <option value="">—</option>
                            {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                        </select>
                    </label>
                    {!kg && (
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">Streepjescode (EAN), als het er een heeft</span>
                            <input className="kf-input" inputMode="numeric" value={v.ean} onChange={(e) => setV({ ...v, ean: e.target.value })} />
                        </label>
                    )}
                    {kg && (
                        <>
                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                                <input type="checkbox" checked={v.binnen_per_sticker} onChange={(e) => setV({ ...v, binnen_per_sticker: e.target.checked })} style={{ marginTop: 3 }} />
                                <span>Komt voorverpakt binnen (bakjes van de slager): elke sticker is een bakje erbij, de THT komt van de levering.</span>
                            </label>
                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                                <input type="checkbox" checked={v.beschermende_atmosfeer} onChange={(e) => setV({ ...v, beschermende_atmosfeer: e.target.checked })} style={{ marginTop: 3 }} />
                                <span>"Verpakt onder beschermende atmosfeer" op de sticker</span>
                            </label>
                            <label style={{ display: 'grid', gap: 6 }}>
                                <span className="kf-eyebrow">Bewaren (op de sticker)</span>
                                <input className="kf-input" value={v.bewaren} maxLength={80} onChange={(e) => setV({ ...v, bewaren: e.target.value })} />
                            </label>
                            {!v.binnen_per_sticker && (
                                <label style={{ display: 'grid', gap: 6 }}>
                                    <span className="kf-eyebrow">Houdbaar na snijden (dagen)</span>
                                    <input className="kf-input" inputMode="numeric" value={v.houdbaar_dagen} onChange={(e) => setV({ ...v, houdbaar_dagen: e.target.value.replace(/\D/g, '') })} />
                                </label>
                            )}
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Het krijgt automatisch een stickernummer. Wegen en stickeren doe je op de Toonbank.</div>
                        </>
                    )}
                </div>
            )}
        </Drawer>
    );
}
