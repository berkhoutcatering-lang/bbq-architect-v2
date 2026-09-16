'use client';

/**
 * /scan/[token] — wat er achter de QR op een zak zit.
 *
 * Van boven naar beneden: deze eenheid → de partij → HACCP-historie → de
 * bouwsteen en haar ingrediënten met de laatste ontvangst (bon/leverancier).
 * Eerlijk waar de keten ophoudt: leverancierslots worden nog niet
 * vastgelegd, dus herkomst gaat tot bon-niveau.
 *
 * Twee acties die voorraad raken (Verbruikt, Afschrijven) en één die dat
 * nooit doet (Label opnieuw). Ingelogd; het token is een lookup, geen sleutel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Printer, ThermometerSun, Trash2, Utensils, PackageCheck, AlertTriangle } from 'lucide-react';
import Button from '@/components/Button';
import MetallicCard from '@/components/MetallicCard';
import { useToast } from '@/components/Toast';
import { printLabels, usePrinters, werkstationPrinter } from '@/lib/labelprinter/client';
import { formatInhoud, normaliseerEenheid } from '@/lib/productie/eenheden';
import { datumKort } from '@/lib/labelprinter/templates/index';
import { PUNT_LABEL } from '@/lib/productie/vrijgave';

interface Eenheid { id: string; volgnummer: number; code: string; inhoud: number; eenheid: string; status: string; label_geprint_at: string | null; label_print_count: number; verbruikt_at: string | null; verbruikt_notitie: string | null }
interface Detail {
    partij: { id: string; partijnummer: string; geproduceerde_hoeveelheid: number; eenheid: string; aantal_eenheden: number; productiedatum: string; tht: string | null; bewaaradvies: string | null; bewaarmethode: string | null; status: string; notitie: string | null };
    eenheden: Eenheid[];
    component: { id: number; name: string; allergenen: string[] } | null;
    event: { id: number; name: string; date: string } | null;
    personeel: { naam: string } | null;
    gescand: Eenheid | null;
    haccp: Array<{ id: number; tijd: string; check_type: string; temp: number | null; status: string; chef: string | null; notitie: string | null }>;
    herkomst: Array<{ naam: string; hoeveelheid: number | null; eenheid: string | null; inventory_id: number | null; laatsteOntvangst: { datum: string; winkel: string | null; leverancier: string | null; bon_id: number | null } | null }>;
}

const STATUS: Record<string, { tekst: string; kleur: string }> = {
    op_voorraad: { tekst: 'Op voorraad', kleur: 'var(--green)' }, verbruikt: { tekst: 'Verbruikt', kleur: 'var(--muted)' },
    afgeschreven: { tekst: 'Afgeschreven', kleur: 'var(--red)' }, verkocht: { tekst: 'Verkocht', kleur: 'var(--muted)' },
};

export default function ScanPagina() {
    const params = useParams<{ token: string }>();
    const token = params?.token ?? '';
    const showToast = useToast();
    const { printers } = usePrinters();
    const printer = useMemo(() => werkstationPrinter(printers), [printers]);
    const [d, setD] = useState<Detail | null>(null);
    const [fout, setFout] = useState<string | null>(null);
    const [bezig, setBezig] = useState<string | null>(null);

    const laad = useCallback(async () => {
        setFout(null);
        const res = await fetch(`/api/scan/${token}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setFout(json.error ?? 'Label niet gevonden'); return; }
        setD(json as Detail);
    }, [token]);
    useEffect(() => { if (token) void laad(); }, [token, laad]);

    async function afboeken(reden: 'verbruikt' | 'afgeschreven') {
        if (!d?.gescand) return;
        if (reden === 'afgeschreven' && !confirm(`${d.gescand.code} afschrijven? De inhoud gaat van de voorraad af.`)) return;
        setBezig(reden);
        try {
            const res = await fetch(`/api/productie/eenheid/${d.gescand.id}/verbruik`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reden }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Afboeken mislukt');
            showToast(json.alGedaan ? `${json.code} was al ${json.status}` : `${json.code} ${reden}${json.voorraadNa != null ? ` · voorraad nu ${json.voorraadNa}` : ''}`, 'success');
            await laad();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Afboeken mislukt', 'error');
        } finally { setBezig(null); }
    }

    async function herprint() {
        if (!d?.gescand) return;
        if (!printer) { showToast('Geen printer voor dit apparaat — kies er een bij Instellingen → Printers', 'error'); return; }
        setBezig('print');
        try {
            const r = await printLabels({ soort: 'herprint', printerId: printer.id, eenheidIds: [d.gescand.id] });
            if (r.uitkomst.status === 'success') showToast('Label opnieuw geprint — voorraad ongewijzigd', 'success');
            else showToast(r.tekst ?? 'Printen mislukt', 'error');
            await laad();
        } finally { setBezig(null); }
    }

    if (fout) {
        return (
            <div className="max-w-xl mx-auto p-6">
                <MetallicCard className="p-6 text-center" hover={false}>
                    <AlertTriangle size={28} className="mx-auto mb-2 text-[var(--amber)]" />
                    <p className="text-[14px] text-[var(--text)]">{fout}</p>
                </MetallicCard>
            </div>
        );
    }
    if (!d) return <div className="max-w-xl mx-auto p-6 text-[13px] text-[var(--muted)]">Label opzoeken…</div>;

    const e = d.gescand;
    const st = e ? STATUS[e.status] ?? { tekst: e.status, kleur: 'var(--muted)' } : null;
    const inhoud = e ? formatInhoud(Number(e.inhoud), normaliseerEenheid(e.eenheid) ?? 'kg') : '';

    return (
        <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
            {/* De eenheid */}
            <MetallicCard className="p-5" hover={false} accent={st?.kleur}>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Gescand label</p>
                <h1 className="text-2xl font-semibold text-[var(--text)] mt-1">{d.component?.name ?? 'Product'}</h1>
                <p className="text-[15px] text-[var(--text)] mt-1">{inhoud} · unit {e?.volgnummer}/{d.partij.aantal_eenheden}</p>
                <p className="font-mono text-[13px] text-[var(--brand)] mt-1">{e?.code}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--muted)]">
                    <span>Gemaakt {datumKort(d.partij.productiedatum)}</span>
                    {d.partij.tht && <span>THT {datumKort(d.partij.tht)}</span>}
                    {d.partij.bewaaradvies && <span>Bewaren {d.partij.bewaaradvies}</span>}
                    {d.component?.allergenen.length ? <span>Allergenen: {d.component.allergenen.join(', ')}</span> : null}
                </div>
                <p className="mt-3 text-[14px] font-medium" style={{ color: st?.kleur }}>
                    {st?.tekst}{e?.verbruikt_at ? ` op ${new Date(e.verbruikt_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {e?.status === 'op_voorraad' && (
                        <>
                            <Button size="touch" variant="green" icon={<Utensils size={18} />} loading={bezig === 'verbruikt'} onClick={() => void afboeken('verbruikt')}>Verbruikt</Button>
                            <Button size="touch" variant="ghost" icon={<Trash2 size={18} />} loading={bezig === 'afgeschreven'} onClick={() => void afboeken('afgeschreven')}>Afschrijven</Button>
                        </>
                    )}
                    <Button size="touch" variant="ghost" icon={<Printer size={18} />} loading={bezig === 'print'} onClick={() => void herprint()}>Label opnieuw</Button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">Een label opnieuw printen verandert nooit de voorraad.</p>
            </MetallicCard>

            {/* De partij */}
            <MetallicCard className="p-5" hover={false}>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] flex items-center gap-2"><PackageCheck size={14} /> Batch {d.partij.partijnummer}</p>
                <p className="text-[13px] text-[var(--text)] mt-2">{d.partij.geproduceerde_hoeveelheid} {d.partij.eenheid} gemaakt · {d.partij.aantal_eenheden} eenheden · {d.eenheden.filter((x) => x.status === 'op_voorraad').length} nog op voorraad</p>
                {d.event && <p className="text-[13px] text-[var(--muted)] mt-1">Voor: <Link href={`/events/${d.event.id}/hub`} className="underline">{d.event.name}</Link> ({datumKort(d.event.date)})</p>}
                {d.personeel && <p className="text-[13px] text-[var(--muted)] mt-1">Door: {d.personeel.naam}</p>}
                {d.partij.status !== 'vrijgegeven' && <p className="text-[13px] text-[var(--red)] mt-1">Status: {d.partij.status}</p>}
                <Link href="/voorraad/partijen" className="inline-block mt-3 text-[12px] text-[var(--brand)] underline">Alle partijen</Link>
            </MetallicCard>

            {/* HACCP */}
            <MetallicCard className="p-5" hover={false}>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] flex items-center gap-2"><ThermometerSun size={14} /> HACCP</p>
                {d.haccp.length === 0 ? <p className="text-[13px] text-[var(--muted)] mt-2">Geen metingen aan deze partij gekoppeld.</p> : (
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                        {d.haccp.map((h) => (
                            <li key={h.id} className="py-2 flex items-center gap-3 text-[13px]">
                                <span className={`w-5 h-5 rounded-md flex items-center justify-center ${h.status === 'ok' ? 'text-emerald-400 bg-emerald-400/10' : 'text-[var(--red)] bg-red-400/10'}`}>{h.status === 'ok' ? <Check size={13} /> : <AlertTriangle size={12} />}</span>
                                <span className="text-[var(--muted)] font-mono text-[12px]">{new Date(h.tijd).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="text-[var(--text)]">{PUNT_LABEL[h.check_type] ?? h.check_type}{h.temp != null ? ` ${h.temp} °C` : ''} — {h.status}</span>
                                {h.chef && <span className="ml-auto text-[var(--muted)]">{h.chef}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </MetallicCard>

            {/* Herkomst */}
            <MetallicCard className="p-5" hover={false}>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Herkomst — ingrediënten en laatste ontvangst</p>
                {d.herkomst.length === 0 ? <p className="text-[13px] text-[var(--muted)] mt-2">Geen ingrediënten aan deze bouwsteen gekoppeld (recept nog niet aan voorraad verbonden).</p> : (
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                        {d.herkomst.map((h, i) => (
                            <li key={`${h.naam}-${i}`} className="py-2 text-[13px]">
                                <div className="flex justify-between gap-3">
                                    <span className="text-[var(--text)]">{h.naam}{h.hoeveelheid != null ? <span className="text-[var(--muted)]"> · {h.hoeveelheid} {h.eenheid ?? ''}</span> : null}</span>
                                    {h.inventory_id != null && <Link href={`/voorraad/historie/${h.inventory_id}`} className="text-[12px] text-[var(--brand)] underline">historie</Link>}
                                </div>
                                <div className="text-[12px] text-[var(--muted)]">
                                    {h.laatsteOntvangst
                                        ? <>Laatst ontvangen {datumKort(h.laatsteOntvangst.datum)}{h.laatsteOntvangst.leverancier || h.laatsteOntvangst.winkel ? ` van ${h.laatsteOntvangst.leverancier ?? h.laatsteOntvangst.winkel}` : ''}{h.laatsteOntvangst.bon_id ? <> · <Link href={`/bonnen?id=${h.laatsteOntvangst.bon_id}`} className="underline">bon</Link></> : null}</>
                                        : 'Geen ontvangst geregistreerd'}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <p className="mt-3 text-[11px] text-[var(--muted)]">Herkomst gaat tot de bon: leverancierslotnummers worden (nog) niet per ontvangst vastgelegd.</p>
            </MetallicCard>
        </div>
    );
}
