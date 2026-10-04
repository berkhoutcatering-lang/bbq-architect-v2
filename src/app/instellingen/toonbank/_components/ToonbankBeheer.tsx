'use client';

/**
 * Instellingen → Toonbank (BA-7a): de tablets van de winkelkassa en wie erop
 * mag inloggen. Plan v5 §M2, contract toonbank/v1 §1.1, §2 en §3.3.
 *
 *  - Tablet toevoegen → een koppelcode van 6 cijfers, 5 minuten geldig, die je
 *    op de tablet intikt. De code staat alleen hier en nu op het scherm.
 *  - Intrekken: de sleutel van de tablet werkt meteen niet meer.
 *  - Per medewerker een rol (medewerker of eigenaar) en een inlogcode. De
 *    inlogcode is dezelfde als op de keuken-tablet (KDS): één code per persoon.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, KeyRound, Plus, RefreshCw, ShieldCheck, Tablet } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import {
    achterstand, resterendeTijd, STATUS_TEKST, tabletStatus, toonKoppelcode, zwakkeInlogcode,
    type NieuweKoppelcode, type TabletRij,
} from '@/lib/toonbank/beheer';
import { nieuweKoppelcode, tabletIntrekken, tabletToevoegen, zetInlogcode, zetToonbankRol } from '../actions';

export interface MedewerkerRij {
    id: string;
    naam: string;
    functie: string | null;
    actief: boolean;
    toonbank_rol: 'medewerker' | 'eigenaar' | null;
    heeft_inlogcode: boolean;
    geblokkeerd_tot: string | null;
}

function tijd(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ToonbankBeheer({ tablets, medewerkers, isAdmin }: { tablets: TabletRij[]; medewerkers: MedewerkerRij[]; isAdmin: boolean }) {
    const router = useRouter();
    const showToast = useToast();
    const [naam, setNaam] = useState('');
    const [locatie, setLocatie] = useState<'winkel' | 'event'>('winkel');
    const [bezig, setBezig] = useState<string | null>(null);
    const [code, setCode] = useState<NieuweKoppelcode | null>(null);
    const [nu, setNu] = useState(() => new Date());

    /* Aftellen zolang er een code op het scherm staat. */
    useEffect(() => {
        if (!code) return;
        const t = setInterval(() => setNu(new Date()), 1000);
        return () => clearInterval(t);
    }, [code]);

    async function voegToe() {
        setBezig('toevoegen');
        try {
            const r = await tabletToevoegen({ naam: naam.trim() || 'Toonbank winkel', locatie });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            setCode(r.data);
            setNu(new Date());
            setNaam('');
            router.refresh();
        } finally { setBezig(null); }
    }

    async function opnieuw(t: TabletRij) {
        setBezig(`code:${t.id}`);
        try {
            const r = await nieuweKoppelcode({ apparaatId: t.id });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            setCode(r.data);
            setNu(new Date());
            router.refresh();
        } finally { setBezig(null); }
    }

    async function trekIn(t: TabletRij) {
        const reden = prompt(`${t.naam} (${t.code}) intrekken? De tablet kan dan niets meer met BBQ Architect. Waarom? (bijvoorbeeld "verloren")`);
        if (reden === null) return;
        setBezig(`in:${t.id}`);
        try {
            const r = await tabletIntrekken({ apparaatId: t.id, reden: reden.trim() || null });
            if ('error' in r) { showToast(r.error, 'error'); return; }
            showToast(`${t.naam} is ingetrokken`, 'success');
            if (code?.apparaat_id === t.id) setCode(null);
            router.refresh();
        } finally { setBezig(null); }
    }

    const resterend = code ? resterendeTijd(code.geldig_tot, nu) : null;

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href="/instellingen/integraties" className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors" aria-label="Terug naar integraties">
                        <ArrowLeft size={18} className="text-[var(--muted)]" />
                    </Link>
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">Toonbank</h2>
                        <p className="text-[12px] text-[var(--muted)]">De tablets van de winkelkassa, en wie erop mag inloggen</p>
                    </div>
                </div>
                <button onClick={() => router.refresh()} className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg transition-colors">
                    <RefreshCw size={13} /> Vernieuwen
                </button>
            </div>

            {!isAdmin && (
                <MetallicCard className="p-4 mb-6" hover={false}>
                    <p className="text-[13px] text-[var(--text)]">Alleen een beheerder (Admin) kan tablets koppelen en inlogcodes zetten. Je kunt hier wel meekijken.</p>
                </MetallicCard>
            )}

            {/* Een nieuwe koppelcode: groot, met aftellen. */}
            {code && (
                <MetallicCard className="p-5 mb-6" hover={false} accent="var(--brand)">
                    <p className="text-[12px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1">Koppelcode voor {code.naam} ({code.code})</p>
                    {resterend ? (
                        <>
                            <p className="text-[40px] font-semibold tracking-[0.15em] text-[var(--text)] tabular-nums" aria-live="polite">{toonKoppelcode(code.koppelcode)}</p>
                            <p className="text-[13px] text-[var(--muted)]">Tik deze code in op de tablet bij “Koppelen”. Nog {resterend} geldig; na 5 foute pogingen vervalt hij. Daarna zie je hem hier niet meer terug.</p>
                        </>
                    ) : (
                        <p className="text-[14px] text-[var(--text)]">Deze code is verlopen. Vraag een nieuwe aan bij de tablet hieronder.</p>
                    )}
                    <div className="mt-3"><Button size="sm" variant="ghost" onClick={() => setCode(null)}>Sluiten</Button></div>
                </MetallicCard>
            )}

            {/* Tablet toevoegen. */}
            {isAdmin && (
                <MetallicCard className="p-4 mb-6" hover={false}>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="field" style={{ minWidth: 220 }}>
                            <label htmlFor="tb-naam">Naam van de tablet</label>
                            <input id="tb-naam" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Toonbank winkel" maxLength={60} />
                        </div>
                        <div className="field">
                            <label>Waar</label>
                            <div className="flex gap-2">
                                {(['winkel', 'event'] as const).map((l) => (
                                    <button key={l} type="button" onClick={() => setLocatie(l)} aria-pressed={locatie === l}
                                        className={`px-3 py-1.5 rounded-lg border text-[13px] ${locatie === l ? 'border-[var(--brand)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                                        {l === 'winkel' ? 'Winkel' : 'Evenement'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Button icon={<Plus size={16} />} loading={bezig === 'toevoegen'} onClick={() => void voegToe()}>Tablet toevoegen</Button>
                    </div>
                </MetallicCard>
            )}

            {/* De tablets. */}
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-3">Tablets</h3>
            {tablets.length === 0 && (
                <MetallicCard className="p-6 mb-6 text-center" hover={false}>
                    <Tablet size={28} className="mx-auto mb-2 text-[var(--muted)]" />
                    <p className="text-[14px] text-[var(--text)]">Nog geen tablet gekoppeld</p>
                    <p className="text-[12px] text-[var(--muted)]">Voeg er een toe; je krijgt dan een code om op de tablet in te tikken.</p>
                </MetallicCard>
            )}
            <div className="space-y-3 mb-8">
                {tablets.map((t) => {
                    const status = tabletStatus(t, nu);
                    const achter = achterstand(t);
                    return (
                        <MetallicCard key={t.id} className="p-4" hover={false}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[14px] font-medium text-[var(--text)]">{t.code} · {t.naam} <span className="text-[12px] font-normal text-[var(--muted)]">· {t.locatie === 'event' ? 'evenement' : 'winkel'}</span></p>
                                    <p className={`text-[12px] ${status === 'gekoppeld' ? 'text-emerald-400' : status === 'ingetrokken' ? 'text-[var(--red)]' : 'text-[var(--muted)]'}`}>
                                        {STATUS_TEKST[status]}
                                        {status === 'ingetrokken' && t.ingetrokken_reden ? ` (${t.ingetrokken_reden})` : ''}
                                        {t.sleutel_prefix && status !== 'ingetrokken' ? ` · sleutel ${t.sleutel_prefix}` : ''}
                                    </p>
                                    <p className="text-[12px] text-[var(--muted)]">
                                        Laatst gezien {tijd(t.laatst_gezien_at)}
                                        {t.app_versie ? ` · app ${t.app_versie}` : ''}{t.contract_versie ? ` · contract ${t.contract_versie}` : ''}
                                        {achter > 0 ? ` · ${achter} ${achter === 1 ? 'melding' : 'meldingen'} nog niet binnen` : ''}
                                    </p>
                                </div>
                                {isAdmin && status !== 'ingetrokken' && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="ghost" icon={<KeyRound size={14} />} loading={bezig === `code:${t.id}`} onClick={() => void opnieuw(t)}>
                                            {status === 'gekoppeld' ? 'Opnieuw koppelen' : 'Nieuwe code'}
                                        </Button>
                                        <Button size="sm" variant="ghost" icon={<Ban size={14} />} loading={bezig === `in:${t.id}`} onClick={() => void trekIn(t)}>Intrekken</Button>
                                    </div>
                                )}
                            </div>
                        </MetallicCard>
                    );
                })}
            </div>

            {/* Wie mag inloggen. */}
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-1">Wie mag op de Toonbank</h3>
            <p className="text-[12px] text-[var(--muted)] mb-3">Een <b>eigenaar</b> mag ook verkopen boven “vrij” goedkeuren. De inlogcode (4 tot 6 cijfers) is dezelfde als op de keuken-tablet; je stelt hem alleen hier in, nooit op de tablet.</p>
            <MetallicCard className="mb-8" hover={false}>
                <ul className="divide-y divide-[var(--border)]">
                    {medewerkers.length === 0 && <li className="p-4 text-[13px] text-[var(--muted)]">Nog geen personeel. Voeg mensen toe onder Team.</li>}
                    {medewerkers.map((m) => <MedewerkerRegel key={m.id} m={m} isAdmin={isAdmin} na={() => router.refresh()} />)}
                </ul>
            </MetallicCard>
        </>
    );
}

function MedewerkerRegel({ m, isAdmin, na }: { m: MedewerkerRij; isAdmin: boolean; na: () => void }) {
    const showToast = useToast();
    const [code, setCode] = useState('');
    const [bezig, setBezig] = useState<'rol' | 'code' | null>(null);
    const geblokkeerd = m.geblokkeerd_tot && new Date(m.geblokkeerd_tot).getTime() > Date.now();

    async function rol(r: 'medewerker' | 'eigenaar' | null) {
        setBezig('rol');
        try {
            const res = await zetToonbankRol({ personeelId: m.id, rol: r });
            if ('error' in res) { showToast(res.error, 'error'); return; }
            showToast(r ? `${m.naam} is nu ${r} op de Toonbank` : `${m.naam} kan niet meer op de Toonbank`, 'success');
            na();
        } finally { setBezig(null); }
    }

    async function bewaarCode() {
        if (!/^\d{4,6}$/.test(code)) { showToast('Een inlogcode is 4 tot 6 cijfers.', 'error'); return; }
        if (zwakkeInlogcode(code)) { showToast('Kies een code die niet zo makkelijk te raden is (geen 1111 of 1234).', 'error'); return; }
        setBezig('code');
        try {
            const res = await zetInlogcode({ personeelId: m.id, inlogcode: code });
            if ('error' in res) { showToast(res.error, 'error'); return; }
            setCode('');
            showToast(`Inlogcode van ${m.naam} ingesteld`, 'success');
            na();
        } finally { setBezig(null); }
    }

    return (
        <li className="p-4 flex flex-wrap items-center justify-between gap-3" style={{ opacity: m.actief ? 1 : 0.55 }}>
            <div className="min-w-0">
                <p className="text-[14px] text-[var(--text)]">{m.naam}{m.functie ? <span className="text-[12px] text-[var(--muted)]"> · {m.functie}</span> : null}{!m.actief && <span className="text-[12px] text-[var(--muted)]"> · inactief</span>}</p>
                <p className="text-[12px] text-[var(--muted)] flex items-center gap-1">
                    {m.heeft_inlogcode ? <><ShieldCheck size={12} /> inlogcode ingesteld</> : 'nog geen inlogcode'}
                    {geblokkeerd ? ` · geblokkeerd tot ${tijd(m.geblokkeerd_tot)}` : ''}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1" role="group" aria-label={`Rol van ${m.naam} op de Toonbank`}>
                    {([null, 'medewerker', 'eigenaar'] as const).map((r) => (
                        <button key={r ?? 'geen'} type="button" disabled={!isAdmin || bezig === 'rol'} onClick={() => void rol(r)} aria-pressed={m.toonbank_rol === r}
                            className={`px-2.5 py-1 rounded-lg border text-[12px] ${m.toonbank_rol === r ? 'border-[var(--brand)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                            {r === null ? 'geen toegang' : r}
                        </button>
                    ))}
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <input aria-label={`Nieuwe inlogcode voor ${m.naam}`} inputMode="numeric" autoComplete="off" maxLength={6} value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="nieuwe code"
                            className="w-28 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[13px]" type="password" />
                        <Button size="sm" variant="ghost" loading={bezig === 'code'} disabled={code.length < 4} onClick={() => void bewaarCode()}>Zet code</Button>
                    </div>
                )}
            </div>
        </li>
    );
}
