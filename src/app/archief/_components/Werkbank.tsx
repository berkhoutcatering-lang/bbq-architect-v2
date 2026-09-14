'use client';
/**
 * Werkbank — bovenaan het kistje staat alleen wat nog moet.
 *
 * Drie tegels, elk met de actie erbij:
 *   1. Zonder leverancierskaart → "Koppel alle N" (met bevestiging welke
 *      kaarten er komen — mens blijft de baas over de lijst)
 *   2. Nog te classificeren → laat de AI van de boekhouder direct draaien
 *   3. Twijfel van de boekhouder → naar de twijfel-stapel
 *
 * Is alles klaar, dan verdwijnt de werkbank: geen sier-stat, alleen actie-stat.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Sparkles, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import type { Werkbank as WerkbankData } from '@/lib/dal/bonnen';
import { useToast } from '@/components/Toast';
import { linkAllLosseLeveranciersAction } from '../actions';
import { fmtEur, fmtDateShort } from './format';

export function Werkbank({ data }: { data: WerkbankData }) {
    const router = useRouter();
    const toast = useToast();
    const [pending, startTransition] = useTransition();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [classifying, setClassifying] = useState(false);
    const popRef = useRef<HTMLDivElement>(null);

    // Klik buiten de bevestiging sluit 'm
    useEffect(() => {
        if (!confirmOpen) return;
        const onDown = (e: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) setConfirmOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [confirmOpen]);

    const nLos = data.losse.length;
    const nPending = data.pending.length;
    const nTwijfel = data.twijfel.count;
    if (nLos === 0 && nPending === 0 && nTwijfel === 0) return null;

    function koppelAlles() {
        startTransition(async () => {
            const res = await linkAllLosseLeveranciersAction();
            setConfirmOpen(false);
            if (!res.ok) { toast(res.error ?? 'Koppelen mislukt', 'error'); return; }
            const delen = [`${res.bonnen} ${res.bonnen === 1 ? 'factuur' : 'facturen'} gekoppeld`];
            if (res.nieuw > 0) delen.push(`${res.nieuw} nieuwe ${res.nieuw === 1 ? 'leverancierskaart' : 'leverancierskaarten'}`);
            if (res.hergebruikt > 0) delen.push(`${res.hergebruikt} bestaande hergebruikt`);
            toast(delen.join(' · '), 'success');
            router.refresh();
        });
    }

    async function classificeer() {
        setClassifying(true);
        try {
            const ids = data.pending.map((p) => p.id);
            for (let i = 0; i < ids.length; i += 20) {
                const r = await fetch('/api/boekhouder/classify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ bon_ids: ids.slice(i, i + 20) }),
                });
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    toast(j.error || 'Classificeren mislukt', 'error');
                    return;
                }
            }
            toast(`${ids.length} ${ids.length === 1 ? 'bon' : 'bonnen'} geclassificeerd — check de twijfel-stapel`, 'success');
            router.refresh();
        } finally {
            setClassifying(false);
        }
    }

    const pendingNamen = Array.from(new Set(data.pending.map((p) => p.naam).filter(Boolean))) as string[];

    return (
        <section className="bk-werkbank" aria-label="Nog te doen">
            {nLos > 0 && (
                <div className="bk-wb bk-wb--todo">
                    <div className="bk-wb__lbl">Zonder leverancierskaart</div>
                    <div className="bk-wb__row">
                        <div className="bk-wb__num">
                            {nLos}
                            <small>{nLos === 1 ? 'factuur' : 'facturen'} · {data.losseNamen.length} {data.losseNamen.length === 1 ? 'leverancier' : 'leveranciers'}</small>
                        </div>
                        <div className="bk-pop" ref={popRef}>
                            <button
                                type="button"
                                className="bk-btn bk-btn--amber bk-btn--sm"
                                onClick={() => setConfirmOpen((v) => !v)}
                                aria-expanded={confirmOpen}
                                disabled={pending}
                            >
                                {pending ? <Loader2 size={13} className="bh-spin" /> : <Link2 size={13} />}
                                Koppel alle {nLos}
                            </button>
                            {confirmOpen && (
                                <div className="bk-pop__panel" role="dialog" aria-label="Bevestig koppelen">
                                    <h4>Dit gebeurt er</h4>
                                    <p>
                                        Voor elke naam hieronder komt een leverancierskaart (bestaat er al één met die naam, dan wordt die gebruikt)
                                        en de factuur wordt eraan gehangen.
                                    </p>
                                    <ul>
                                        {data.losse.slice(0, 12).map((l) => (
                                            <li key={l.id}>
                                                <span>{l.naam}</span>
                                                <em>{fmtDateShort(l.datum)} · {fmtEur(l.totaal_bedrag)}</em>
                                            </li>
                                        ))}
                                        {data.losse.length > 12 && <li><span style={{ color: 'var(--muted)' }}>… en nog {data.losse.length - 12}</span></li>}
                                    </ul>
                                    <div className="bk-pop__foot">
                                        <button type="button" className="bk-btn bk-btn--ghost bk-btn--sm" onClick={() => setConfirmOpen(false)}>Annuleer</button>
                                        <button type="button" className="bk-btn bk-btn--amber bk-btn--sm" onClick={koppelAlles} disabled={pending}>
                                            {pending ? <Loader2 size={13} className="bh-spin" /> : <Link2 size={13} />}
                                            Koppel {nLos} {nLos === 1 ? 'factuur' : 'facturen'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="bk-namen">
                        {data.losseNamen.slice(0, 6).map((n) => <span key={n}>{n}</span>)}
                        {data.losseNamen.length > 6 && <span>+{data.losseNamen.length - 6}</span>}
                    </div>
                </div>
            )}

            {nPending > 0 && (
                <div className="bk-wb">
                    <div className="bk-wb__lbl">Nog te classificeren</div>
                    <div className="bk-wb__row">
                        <div className="bk-wb__num">
                            {nPending}
                            <small>{pendingNamen.slice(0, 3).join(', ')}{pendingNamen.length > 3 ? ` +${pendingNamen.length - 3}` : ''}</small>
                        </div>
                        <button type="button" className="bk-btn bk-btn--sm" onClick={classificeer} disabled={classifying}>
                            {classifying ? <Loader2 size={13} className="bh-spin" /> : <Sparkles size={13} />}
                            {classifying ? 'AI kijkt…' : 'Classificeer'}
                        </button>
                    </div>
                </div>
            )}

            {nTwijfel > 0 && (
                <div className="bk-wb">
                    <div className="bk-wb__lbl">Twijfel van de boekhouder</div>
                    <div className="bk-wb__row">
                        <div className="bk-wb__num">
                            {nTwijfel}
                            <small>samen {fmtEur(data.twijfel.totaal_bedrag)}</small>
                        </div>
                        <Link href="/geld/boekhouder?tab=twijfel" className="bk-btn bk-btn--sm">
                            <AlertTriangle size={13} /> Bekijk <ChevronRight size={13} />
                        </Link>
                    </div>
                </div>
            )}
        </section>
    );
}
