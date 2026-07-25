/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { entityHref } from '@/lib/related-entities';
import { formatEur } from '@/lib/format';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { trackOnce } from '@/lib/track';
import { fmtNl, fmt as fmtUtil } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { upsertKlant, deleteKlant as deleteKlantAction } from './actions';
import { useFormValidation } from '@/hooks/useFormValidation';
import { useFormAutosave } from '@/hooks/useFormAutosave';
import FieldError from '@/components/FieldError';
import EmptyState from '@/components/EmptyState';
import ErrorCard from '@/components/ErrorCard';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Flame, Mail, MapPin, MessageCircle, MessageSquare, Phone, Plus, Save, Search, Trash2, Users } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import { LoadingState } from '@/components/LoadingState';
import MetallicCard from '@/components/MetallicCard';
import FollowUpPrompt, { type FollowUpAction } from '@/components/FollowUpPrompt';
import type { Klant } from '@/types';

export default function KlantenPage() {
    return <Suspense fallback={<div style={{ padding: 24, color: 'var(--muted)' }}>Laden...</div>}><Klanten /></Suspense>;
}

function Klanten() {
    /* `insert` / `update` / `remove` worden niet meer direct vanuit Client-side
       aangeroepen — mutaties lopen via Server Actions (`./actions.ts`) zodat
       Zod-validatie + re-auth gegarandeerd zijn. `refetch` halen we wel uit
       useSupabase voor live-refresh na een action. */
    const { data: klanten, loading: klantenLoading, error: klantenError, refetch } = useSupabase<Klant>('klanten', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const { errors, validateAll, clearError, fieldProps } = useFormValidation({
        naam: [{ required: 'Vul een naam in' }],
    });
    const searchParams = useSearchParams();
    const initialZoek = searchParams.get('zoek') || '';
    const focusNaam = searchParams.get('focus') || '';

    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    /* Server Action result.fields → per-veld error onder het input. Voorheen
       werden alle field-errors geconcat in één toast — onleesbaar bij >1 fout. */
    const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string[]>>({});
    const [searchQuery, setSearchQuery] = useState(initialZoek);
    const [filterType, setFilterType] = useState<string>('alle');
    const [followUpActions, setFollowUpActions] = useState<FollowUpAction[] | null>(null);
    const [followUpTitle, setFollowUpTitle] = useState('');

    // Fetch linked offertes & events counts per klant
    const [klantStats, setKlantStats] = useState<Record<string, { offertes: number; events: number; omzet: number; offerteList: any[]; eventList: any[]; factuurList: any[] }>>({});
    const [statsLoading, setStatsLoading] = useState<string | null>(null);

    /* loadStats — laadt 3 parallel queries voor klant-historie.
       Foutafhandeling: per-tabel errors loggen + toast i.p.v. silent fail
       (eerder werd Promise.all-error gewoon geslikt). Per-klant loading
       state zodat UI weet dat er iets aan de hand is. */
    async function loadStats(naam: string) {
        if (klantStats[naam] || statsLoading === naam) return;
        setStatsLoading(naam);
        try {
            const [offRes, evRes, facRes] = await Promise.all([
                supabase.from('offertes').select('id,nummer,status,datum,items,aantal_gasten', { count: 'exact' }).eq('client_naam', naam).order('datum', { ascending: false }),
                supabase.from('events').select('id,name,date,guests,ppp,status', { count: 'exact' }).eq('client_naam', naam).order('date', { ascending: false }),
                supabase.from('facturen').select('id,nummer,status,datum,items', { count: 'exact' }).eq('client_naam', naam).order('datum', { ascending: false }),
            ]);

            const errors: string[] = [];
            if (offRes.error) errors.push('offertes (' + offRes.error.message + ')');
            if (evRes.error) errors.push('events (' + evRes.error.message + ')');
            if (facRes.error) errors.push('facturen (' + facRes.error.message + ')');
            if (errors.length > 0) {
                console.error('[klanten] loadStats errors:', errors);
                showToast('Klant-historie deels niet geladen: ' + errors.join(', '), 'error');
            }

            let omzet = 0;
            (offRes.data || []).forEach(function (o: any) {
                (o.items || []).forEach(function (i: any) { omzet += (i.qty || 0) * (i.prijs || 0); });
            });
            (evRes.data || []).forEach(function (e: any) { omzet += (e.guests || 0) * (e.ppp || 0); });

            setKlantStats(function (prev) {
                return Object.assign({}, prev, {
                    [naam]: { offertes: offRes.count || 0, events: evRes.count || 0, omzet: omzet, offerteList: offRes.data || [], eventList: evRes.data || [], factuurList: facRes.data || [] }
                });
            });
        } catch (e: any) {
            console.error('[klanten] loadStats fatal:', e);
            showToast('Kon klant-historie niet laden: ' + (e?.message || 'onbekende fout'), 'error');
        } finally {
            setStatsLoading(null);
        }
    }

    /* Form-autosave alleen actief bij "nieuwe klant" — bestaande klanten
       hoeven niet bewaard te worden, die staan al in de DB. Voorkomt dat
       een typo in een bestaand record stilletjes in localStorage belandt. */
    const { loadDraft, clearDraft } = useFormAutosave(
        'bbq_klanten_new_draft',
        form,
        {
            enabled: editing === 'new',
            onRestore: (saved) => {
                /* Behoud type-veiligheid: cast naar Record<string, any>
                   (form is een vrij object) en merge met defaults. */
                if (saved && typeof saved === 'object') {
                    setForm(saved as Record<string, any>);
                }
            },
        },
    );

    function newKlant() {
        setEditing('new');
        const defaults = { naam: '', bedrijf: '', adres: '', postcode: '', plaats: '', telefoon: '', email: '', type: 'Particulier', notities: '' };
        setForm(defaults);
        /* Probeer vorige onafgemaakte concept terug te halen. Als die
           bestaat overschrijft onRestore de defaults binnen 1 render. */
        loadDraft();
    }

    function editKlant(k: Klant) {
        setEditing(k.id);
        setForm(JSON.parse(JSON.stringify(k)));
        loadStats(k.naam);
    }

    /* Auto-open klant-detail bij ?focus=naam — gebruikt vanuit /facturen
       en andere cross-page links. Match case-insensitive op exact naam. */
    useEffect(function () {
        if (!focusNaam || editing !== null || klantenLoading) return;
        const target = focusNaam.toLowerCase().trim();
        const match = klanten.find(k => (k.naam || '').toLowerCase().trim() === target);
        if (match) editKlant(match);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusNaam, klanten, klantenLoading, editing]);

    function setField(key: string, val: any) {
        setForm(Object.assign({}, form, { [key]: val }));
        /* Server-side veld-error van vorige save wegklikken zodra de gebruiker
           het veld aanpast — anders blijft de melding hangen tot volgende save. */
        if (serverFieldErrors[key]) {
            setServerFieldErrors(function (prev) {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    }

    async function saveKlant() {
        if (!validateAll({ naam: form!.naam })) return;
        setServerFieldErrors({});
        const isNew = editing === 'new';
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        const { id: _existingId, created_at: _ca, ...rest } = form!;
        const payload = isNew ? form! : { id: editing as number, ...rest };
        const result = await upsertKlant(payload);
        if (result.error) {
            console.error('[klanten] upsert failed:', result.error, result.fields);
            if (result.fields && Object.keys(result.fields).length > 0) {
                setServerFieldErrors(result.fields);
                showToast('Controleer de gemarkeerde velden', 'error');
            } else {
                showToast((isNew ? 'Aanmaken' : 'Opslaan') + ' mislukt: ' + result.error, 'error');
            }
            return;
        }
        await refetch();
        showToast(isNew ? 'Klant aangemaakt' : 'Klant bijgewerkt', 'success');
        if (isNew) {
            /* Activation tracking \u2014 `first_klant_created` (ux-master.md sectie 7). */
            trackOnce('first_klant_created', 'first_klant');
            setFollowUpActions([
                { icon: '\ud83d\udcc4', label: 'Offerte opstellen', href: '/offertes' },
                { icon: '\ud83d\udcc5', label: 'Event aanmaken', href: '/events' },
            ]);
            setFollowUpTitle('Klant aangemaakt!');
            /* Concept is verbruikt \u2014 wis localStorage zodat volgende
               "nieuwe klant"-knop met een schoon formulier begint. */
            clearDraft();
        }
        setEditing(null);
        setForm(null);
    }

    function deleteKlant() {
        showConfirm('Weet je zeker dat je deze klant wilt verwijderen?', async function () {
            const result = await deleteKlantAction(editing as number);
            if (result.error) {
                console.error('[klanten] delete failed:', result.error);
                showToast('Verwijderen mislukt: ' + result.error, 'error');
                return;
            }
            await refetch();
            showToast('Klant verwijderd', 'success');
            setEditing(null);
            setForm(null);
        });
    }

    const fmt = (n: number) => formatEur(n);  // gedeelde canon (src/lib/format.ts) — 2 decimalen NL-stijl

    if (editing !== null && form) {
        const stats = klantStats[form.naam];
        return (
            <MetallicCard hover={false}>
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe klant' : 'Klant bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><ArrowLeft size={14} /> Terug</button>
                </div>
                <div className="panel-body">
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 12 }}>Contactgegevens</h4>
                    <div className="form-grid">
                        <div className="field full" data-required><label>Naam / Contactpersoon</label><input name="naam" value={form.naam} onChange={function (e) { setField('naam', e.target.value); clearError('naam'); }} style={(errors.naam || serverFieldErrors.naam) ? { borderColor: 'var(--red)' } : {}} {...fieldProps('naam', form.naam)} /><FieldError message={errors.naam} name="naam" fields={serverFieldErrors} fieldName="naam" /></div>
                        <div className="field"><label>Bedrijfsnaam</label><input value={form.bedrijf || ''} onChange={function (e) { setField('bedrijf', e.target.value); }} /><FieldError name="bedrijf" fields={serverFieldErrors} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                {['Particulier', 'Zakelijk', 'Festival', 'Horeca'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Email</label><input type="email" value={form.email || ''} onChange={function (e) { setField('email', e.target.value); }} style={serverFieldErrors.email ? { borderColor: 'var(--red)' } : {}} /><FieldError name="email" fields={serverFieldErrors} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.telefoon || ''} onChange={function (e) { setField('telefoon', e.target.value); }} /><FieldError name="telefoon" fields={serverFieldErrors} /></div>
                        <div className="field full"><label>Adres</label><input value={form.adres || ''} onChange={function (e) { setField('adres', e.target.value); }} /><FieldError name="adres" fields={serverFieldErrors} /></div>
                        <div className="field"><label>Postcode</label><input value={form.postcode || ''} onChange={function (e) { setField('postcode', e.target.value); }} /><FieldError name="postcode" fields={serverFieldErrors} /></div>
                        <div className="field"><label>Plaats</label><input value={form.plaats || ''} onChange={function (e) { setField('plaats', e.target.value); }} /><FieldError name="plaats" fields={serverFieldErrors} /></div>
                        <div className="field full"><label>Notities</label><textarea rows={3} value={form.notities || ''} onChange={function (e) { setField('notities', e.target.value); }} /><FieldError name="notities" fields={serverFieldErrors} /></div>
                    </div>

                    {/* Snelle communicatie */}
                    {editing !== 'new' && (form.telefoon || form.email) && (
                        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {form.telefoon && (function () {
                                const tel = (form.telefoon || '').replace(/[^0-9+]/g, '');
                                const waTel = tel.startsWith('0') ? '31' + tel.slice(1) : tel.replace('+', '');
                                return (
                                    <a href={'https://wa.me/' + waTel} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.25)', color: '#25d366', textDecoration: 'none', cursor: 'pointer' }}>
                                        <MessageCircle size={14} /> WhatsApp
                                    </a>
                                );
                            })()}
                            {form.telefoon && (
                                <a href={'tel:' + form.telefoon}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)', color: 'var(--blue)', textDecoration: 'none' }}>
                                    <Phone size={12} /> Bellen
                                </a>
                            )}
                            {form.email && (
                                <a href={'mailto:' + form.email}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.25)', color: 'var(--color-accent-gold)', textDecoration: 'none' }}>
                                    <Mail size={12} /> Email
                                </a>
                            )}
                        </div>
                    )}

                    {/* Klant-historie loading state — alleen voor bestaande klanten */}
                    {editing !== 'new' && !stats && statsLoading === form.naam && (
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12 }}>
                            <Flame size={14} className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }} />
                            Klant-historie laden...
                        </div>
                    )}

                    {/* Klant-historie */}
                    {stats && (
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 12 }}>
                                <BarChart3 size={14} className="mr-1.5" />Klant Overzicht
                            </h4>
                            <div className="stat-grid grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="stat-card">
                                    <div className="stat-label">Offertes</div>
                                    <div className="stat-val">{stats.offertes}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Events</div>
                                    <div className="stat-val">{stats.events}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Totale Waarde</div>
                                    <div className="stat-val" style={{ color: 'var(--brand)' }}>{fmt(stats.omzet)}</div>
                                </div>
                            </div>

                            {/* Gedetailleerde historie */}
                            {stats.eventList && stats.eventList.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <h5 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Events</h5>
                                    {stats.eventList.slice(0, 5).map(function (ev: any) {
                                        const statusColor = ev.status === 'confirmed' ? 'var(--emerald)' : ev.status === 'completed' ? 'var(--blue)' : 'var(--amber)';
                                        return (
                                            <Link key={ev.id} href={entityHref('event', ev.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 8px', margin: '0 -8px', borderRadius: 8, borderBottom: '1px solid var(--border)', fontSize: 12, color: 'inherit', textDecoration: 'none', cursor: 'pointer', transition: 'background .12s' }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(255,255,255,.04))'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                <span>{ev.name} <span style={{ color: 'var(--muted)' }}>— {ev.date}</span></span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span>{ev.guests}p</span>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }}></span>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                    {stats.eventList.length > 5 && (
                                        <Link href={`/events?client=${encodeURIComponent(form.naam)}`} style={{ display: 'block', textAlign: 'center', padding: '8px', marginTop: 4, fontSize: 12, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                                            Alle {stats.eventList.length} events bekijken →
                                        </Link>
                                    )}
                                </div>
                            )}

                            {stats.offerteList && stats.offerteList.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <h5 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Offertes</h5>
                                    {stats.offerteList.slice(0, 5).map(function (o: any) {
                                        let totaal = 0;
                                        (o.items || []).forEach(function (i: any) { totaal += (i.qty || 0) * (i.prijs || 0); });
                                        return (
                                            <Link key={o.id} href={entityHref('offerte', o.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 8px', margin: '0 -8px', borderRadius: 8, borderBottom: '1px solid var(--border)', fontSize: 12, color: 'inherit', textDecoration: 'none', cursor: 'pointer', transition: 'background .12s' }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(255,255,255,.04))'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                <span>{o.nummer} <span style={{ color: 'var(--muted)' }}>— {o.datum}</span></span>
                                                <span style={{ fontWeight: 600 }}>{fmt(totaal)}</span>
                                            </Link>
                                        );
                                    })}
                                    {stats.offerteList.length > 5 && (
                                        <Link href={`/offertes?client=${encodeURIComponent(form.naam)}`} style={{ display: 'block', textAlign: 'center', padding: '8px', marginTop: 4, fontSize: 12, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                                            Alle {stats.offerteList.length} offertes bekijken →
                                        </Link>
                                    )}
                                </div>
                            )}

                            {stats.factuurList && stats.factuurList.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <h5 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Facturen</h5>
                                    {stats.factuurList.slice(0, 5).map(function (f: any) {
                                        let totaal = 0;
                                        (f.items || []).forEach(function (i: any) { totaal += (i.qty || 0) * (i.prijs || 0); });
                                        const statusColor = f.status === 'betaald' ? 'var(--emerald)' : f.status === 'vervallen' ? 'var(--red)' : 'var(--amber)';
                                        return (
                                            <Link key={f.id} href={entityHref('factuur', f.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 8px', margin: '0 -8px', borderRadius: 8, borderBottom: '1px solid var(--border)', fontSize: 12, color: 'inherit', textDecoration: 'none', cursor: 'pointer', transition: 'background .12s' }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(255,255,255,.04))'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                <span>{f.nummer} <span style={{ color: 'var(--muted)' }}>— {f.datum}</span></span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontWeight: 600 }}>{fmt(totaal)}</span>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }}></span>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                    {stats.factuurList.length > 5 && (
                                        <Link href={`/facturen?client=${encodeURIComponent(form.naam)}`} style={{ display: 'block', textAlign: 'center', padding: '8px', marginTop: 4, fontSize: 12, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                                            Alle {stats.factuurList.length} facturen bekijken →
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveKlant}><Save size={14} /> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteKlant}><Trash2 size={14} /> Verwijderen</button>}
                    </div>
                </div>
            </MetallicCard>
        );
    }

    if (klantenLoading) {
        return <LoadingState label="Klanten laden" />;
    }

    const filtered = klanten.filter(function (k) {
        if (filterType !== 'alle' && k.type !== filterType) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (k.naam || '').toLowerCase().includes(q) ||
                (k.bedrijf || '').toLowerCase().includes(q) ||
                (k.email || '').toLowerCase().includes(q) ||
                (k.plaats || '').toLowerCase().includes(q);
        }
        return true;
    }).sort(function (a, b) { return (a.naam || '').localeCompare(b.naam || ''); });

    return (
        <div className="mobile-safe-bottom">
            <PageHeader
                title={`Klanten (${filtered.length}${filtered.length !== klanten.length ? ' / ' + klanten.length : ''})`}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                            href="/klantgesprek"
                            className="btn btn-ghost"
                            style={{ textDecoration: 'none' }}
                        >
                            <MessageSquare size={14} /> Intakegesprek
                        </Link>
                        <button className="btn btn-brand" onClick={newKlant}><Plus size={14} /> Nieuwe klant</button>
                    </div>
                }
            />
            <PageGuideNote
                id="klanten"
                accent="#3b82f6"
                icon={<Users size={14} />}
                intro="Je hele klantenbestand op één plek — particulier, zakelijk, festival en horeca naast elkaar."
                actions={[
                    { lead: 'Klik op een klant', text: 'om historie, contactgegevens en gekoppelde events en offertes te zien.' },
                    { lead: 'Filter op type', text: '(Particulier, Zakelijk, Festival, Horeca) of zoek op naam, plaats of e-mail.' },
                    { lead: 'Top-klanten zie je onder Geld', text: '— hier beheer je alleen de gegevens en relatie-historie.' },
                ]}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op naam, bedrijf, email, plaats..."
                    style={{ flex: 1, minWidth: 180, padding: '7px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                />
                {['alle', 'Particulier', 'Zakelijk', 'Festival', 'Horeca'].map(function (s) {
                    return <button key={s} className={'btn btn-sm ' + (filterType === s ? 'btn-brand' : 'btn-ghost')}
                        onClick={function () { setFilterType(s); }}
                        style={{ fontSize: 12 }}>{s === 'alle' ? 'Alle' : s}</button>;
                })}
            </div>
            <PageSection>
            <MetallicCard hover={false}>
                {/* Toon ErrorCard alleen als er een fetch-error is EN er geen
                    klanten zijn (= eerste-laad faalde). Bij stale-data + error
                    op refresh tonen we de bestaande lijst gewoon door — fout
                    zit dan in een transparante refresh-toast i.p.v. dat de
                    page leeg wordt. */}
                {klantenError && klanten.length === 0 && (
                    <ErrorCard
                        title="Klanten konden niet worden geladen"
                        message="De verbinding met de database werkte even niet. Klik op Opnieuw, of mail support@bbqarchitect.nl als het blijft hangen."
                        retry={refetch}
                        details={klantenError}
                    />
                )}
                {!klantenError && klanten.length === 0 && <EmptyState page="/klanten" onAction={newKlant} />}
                {klanten.length > 0 && filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                        <Search size={24} style={{ display: 'block', opacity: 0.4 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Geen klanten gevonden</div>
                        <div style={{ fontSize: 12 }}>Pas je zoekopdracht of filters aan</div>
                    </div>
                )}
                {filtered.map(function (k) {
                    const pillColor = k.type === 'Zakelijk' ? 'pill-blue' : k.type === 'Festival' ? 'pill-purple' : k.type === 'Horeca' ? 'pill-cyan' : 'pill-amber';
                    return (
                        <div key={k.id} className="ev-row klant-row" onClick={function () { editKlant(k); }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #d4b36a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#111', flexShrink: 0 }}>
                                {(k.naam || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ wordBreak: 'break-word' }}>{k.naam}</span>
                                    {k.bedrijf && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>({k.bedrijf})</span>}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    {k.email && <><Mail size={10} className="mr-1.5" />{k.email}</>}
                                    {k.telefoon && <span style={{ marginLeft: 12 }}><Phone size={10} className="mr-1.5" />{k.telefoon}</span>}
                                    {k.plaats && <span style={{ marginLeft: 12 }}><MapPin size={10} className="mr-1.5" />{k.plaats}</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                {k.telefoon && (function () {
                                    const tel = (k.telefoon || '').replace(/[^0-9+]/g, '');
                                    const waTel = tel.startsWith('0') ? '31' + tel.slice(1) : tel.replace('+', '');
                                    return (
                                        <a href={'https://wa.me/' + waTel} target="_blank" rel="noopener noreferrer"
                                            onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}
                                            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,211,102,.1)', color: '#25d366', fontSize: 13, textDecoration: 'none', flexShrink: 0 }}
                                            title="WhatsApp">
                                            <MessageCircle size={14} />
                                        </a>
                                    );
                                })()}
                                <span className={'pill ' + pillColor} style={{ flexShrink: 0 }}>{k.type}</span>
                            </div>
                        </div>
                    );
                })}
            </MetallicCard>
            </PageSection>
            {followUpActions && (
                <FollowUpPrompt
                    title={followUpTitle}
                    actions={followUpActions}
                    onDismiss={function () { setFollowUpActions(null); }}
                    autoHideMs={15000}
                />
            )}
        </div>
    );
}
