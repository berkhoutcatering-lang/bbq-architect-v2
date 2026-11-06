'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Send, X, TriangleAlert, Loader2 } from 'lucide-react';
import Button from '@/components/Button';
import Panel from '@/components/chassis/Panel';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { entityHref } from '@/lib/related-entities';
import { negeerMail, verstuurConcept } from '../actions';

export interface BinnenMail {
    id: string;
    from_name: string | null;
    from_email: string;
    antwoord_aan: string | null;
    subject: string | null;
    received_at: string;
    body_text: string | null;
    klant_id: number | null;
    concept_onderwerp: string | null;
    concept_tekst: string | null;
    concept_vragen: string | null;
    concept_status: 'geen' | 'bezig' | 'klaar' | 'verstuurd' | 'genegeerd' | 'mislukt';
    concept_fout: string | null;
}

const VELDEN = 'id,from_name,from_email,antwoord_aan,subject,received_at,body_text,klant_id,concept_onderwerp,concept_tekst,concept_vragen,concept_status,concept_fout';
const TE_DOEN: BinnenMail['concept_status'][] = ['bezig', 'klaar', 'mislukt'];

const STATUS_TEKST: Record<BinnenMail['concept_status'], string> = {
    geen: 'Geen antwoord nodig',
    bezig: 'Concept wordt geschreven',
    klaar: 'Concept klaar',
    verstuurd: 'Verstuurd',
    genegeerd: 'Genegeerd',
    mislukt: 'Geen concept gelukt',
};

function datum(iso: string): string {
    return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Mail en concept naast elkaar: lezen, aanpassen, zelf versturen. */
export default function BinnenTab({ onTeller }: { onTeller?: (aantal: number) => void }) {
    const toast = useToast();
    const [mails, setMails] = useState<BinnenMail[]>([]);
    const [laden, setLaden] = useState(true);
    const [alles, setAlles] = useState(false);
    const [gekozen, setGekozen] = useState<BinnenMail | null>(null);
    const [onderwerp, setOnderwerp] = useState('');
    const [tekst, setTekst] = useState('');
    const [bezig, setBezig] = useState(false);

    const haalOp = useCallback(async () => {
        const { data, error } = await supabase.from('org_email_inbox').select(VELDEN)
            .eq('bron', 'klantmail').order('received_at', { ascending: false }).limit(100);
        if (error) toast('Mail niet geladen: ' + error.message, 'error');
        const lijst = (data ?? []) as unknown as BinnenMail[];
        setMails(lijst);
        onTeller?.(lijst.filter((m) => TE_DOEN.includes(m.concept_status)).length);
        setLaden(false);
    }, [onTeller, toast]);

    useEffect(() => { void haalOp(); }, [haalOp]);

    function kies(m: BinnenMail) {
        setGekozen(m);
        setOnderwerp(m.concept_onderwerp ?? (m.subject ? `Re: ${m.subject}` : ''));
        setTekst(m.concept_tekst ?? '');
    }

    async function verstuur() {
        if (!gekozen) return;
        setBezig(true);
        const r = await verstuurConcept({ id: gekozen.id, aan: gekozen.antwoord_aan ?? gekozen.from_email, onderwerp, tekst });
        setBezig(false);
        if (r.error) { toast(r.error, 'error'); return; }
        toast('Antwoord verstuurd', 'success');
        setGekozen(null);
        void haalOp();
    }

    async function negeer() {
        if (!gekozen) return;
        setBezig(true);
        const r = await negeerMail(gekozen.id);
        setBezig(false);
        if (r.error) { toast(r.error, 'error'); return; }
        setGekozen(null);
        void haalOp();
    }

    const zichtbaar = alles ? mails : mails.filter((m) => TE_DOEN.includes(m.concept_status));

    if (gekozen) {
        const open = TE_DOEN.includes(gekozen.concept_status);
        return (
            <div>
                <div style={{ marginBottom: 12 }}>
                    <Button variant="ghost" size="sm" onClick={() => setGekozen(null)}>Terug naar de lijst</Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    <Panel title="De mail">
                        <p style={{ fontWeight: 600, margin: 0 }}>{gekozen.subject || '(geen onderwerp)'}</p>
                        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 12px' }}>
                            {gekozen.from_name ? `${gekozen.from_name} · ` : ''}{gekozen.from_email} · {datum(gekozen.received_at)}
                        </p>
                        {gekozen.klant_id != null && (
                            <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                                <Link href={entityHref('klant', gekozen.klant_id, gekozen.from_name ?? undefined)} style={{ color: 'var(--brand)' }}>Open klant</Link>
                            </p>
                        )}
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>{gekozen.body_text}</div>
                    </Panel>
                    <Panel title="Jouw antwoord">
                        {gekozen.concept_vragen && (
                            <p style={{ display: 'flex', gap: 8, fontSize: 13, margin: '0 0 12px', color: 'var(--brand)' }}>
                                <TriangleAlert size={16} style={{ flexShrink: 0 }} /> <span>{gekozen.concept_vragen}</span>
                            </p>
                        )}
                        {gekozen.concept_status === 'bezig' && (
                            <p style={{ color: 'var(--muted)', fontSize: 13 }}><Loader2 size={14} className="animate-spin" /> Concept wordt geschreven</p>
                        )}
                        {gekozen.concept_fout && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Let op: {gekozen.concept_fout}</p>}
                        <div className="field">
                            <label>Onderwerp</label>
                            <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} disabled={!open} />
                        </div>
                        <div className="field">
                            <label>Tekst</label>
                            <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={14} disabled={!open} />
                        </div>
                        {open ? (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Button variant="brand" icon={<Send size={15} />} loading={bezig} onClick={verstuur}>Verstuur antwoord</Button>
                                <Button variant="ghost" icon={<X size={15} />} disabled={bezig} onClick={negeer}>Negeer mail</Button>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{STATUS_TEKST[gekozen.concept_status]}</p>
                        )}
                    </Panel>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Button variant={alles ? 'ghost' : 'brand'} size="sm" onClick={() => setAlles(false)}>Te doen</Button>
                <Button variant={alles ? 'brand' : 'ghost'} size="sm" onClick={() => setAlles(true)}>Alles</Button>
            </div>
            {laden ? (
                <p style={{ color: 'var(--muted)' }}>Mail laden</p>
            ) : zichtbaar.length === 0 ? (
                <Panel>
                    <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                        <Inbox size={28} style={{ color: 'var(--muted)' }} />
                        <p style={{ fontWeight: 600, margin: '8px 0 4px' }}>Nog geen mail te doen</p>
                        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Zodra er een mail binnenkomt, staat hier het concept klaar.</p>
                    </div>
                </Panel>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {zichtbaar.map((m) => (
                        <button key={m.id} type="button" className="panel" onClick={() => kies(m)}
                            style={{ textAlign: 'left', cursor: 'pointer', width: '100%', minHeight: 44 }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.from_name || m.from_email}</strong>
                                <span style={{ color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}>{datum(m.received_at)}</span>
                            </span>
                            <span style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{m.subject || '(geen onderwerp)'}</span>
                            <span style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{STATUS_TEKST[m.concept_status]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
