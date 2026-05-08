/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import PageHeader from '@/components/PageHeader';
import { sendEmail, wrapHtml } from '@/lib/emailHelper';
import { Flame, Send, ArrowLeft, Plus, Pencil, Trash2, Search, Mail, FileText, X, Inbox } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import type { Email, EmailTemplate, Klant } from '@/types';

type Tab = 'verzonden' | 'nieuw' | 'templates';
type FilterType = 'alle' | 'vrij' | 'offerte' | 'factuur' | 'herinnering';

const TYPE_LABELS: Record<string, string> = {
    vrij: 'Vrij bericht',
    offerte: 'Offerte',
    factuur: 'Factuur',
    herinnering: 'Herinnering',
};
const TYPE_COLORS: Record<string, string> = {
    vrij: 'var(--blue)',
    offerte: 'var(--color-accent-gold)',
    factuur: 'var(--green)',
    herinnering: 'var(--amber)',
};

export default function Mailbox() {
    const { data: emails, loading: loadingEmails, insert: insertEmail } = useSupabase<Email>('emails', []);
    const { data: templates, loading: loadingTemplates, insert: insertTemplate, update: updateTemplate, remove: removeTemplate } = useSupabase<EmailTemplate>('email_templates', []);
    const { data: klanten } = useSupabase<Klant>('klanten', []);
    const { data: settingsArr } = useSupabase<any>('settings', []);
    const showToast = useToast();
    const showConfirm = useConfirm();

    const settings = settingsArr[0] || {};
    const bedrijfsnaam: string = settings.bedrijfsnaam || 'BBQ Architect';

    const [tab, setTab] = useState<Tab>('verzonden');
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<FilterType>('alle');
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

    // ── Compose state ──
    const [composeKlantId, setComposeKlantId] = useState('');
    const [composeEmail, setComposeEmail] = useState('');
    const [composeNaam, setComposeNaam] = useState('');
    const [composeOnderwerp, setComposeOnderwerp] = useState('');
    const [composeBericht, setComposeBericht] = useState('');
    const [composeTemplateId, setComposeTemplateId] = useState('');
    const [sending, setSending] = useState(false);

    // ── Template edit state ──
    const [editingTemplate, setEditingTemplate] = useState<number | 'new' | null>(null);
    const [tplForm, setTplForm] = useState({ naam: '', onderwerp: '', body: '', categorie: 'algemeen' });

    const isLoading = loadingEmails || loadingTemplates;

    // ── Filtered emails ──
    const filteredEmails = useMemo(function () {
        let list = emails;
        if (filterType !== 'alle') {
            list = list.filter(function (e) { return e.type === filterType; });
        }
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(function (e) {
                return (e.aan_naam || '').toLowerCase().includes(q) ||
                    (e.aan_email || '').toLowerCase().includes(q) ||
                    (e.onderwerp || '').toLowerCase().includes(q);
            });
        }
        return list;
    }, [emails, filterType, search]);

    // ── Replace template variables ──
    function replaceVars(text: string, klantNaam: string): string {
        return text
            .replace(/\{\{klant_naam\}\}/g, klantNaam || 'klant')
            .replace(/\{\{bedrijfsnaam\}\}/g, bedrijfsnaam);
    }

    // ── Select klant for compose ──
    function selectKlant(klantId: string) {
        setComposeKlantId(klantId);
        const klant = klanten.find(function (k) { return String(k.id) === klantId; });
        if (klant) {
            setComposeEmail(klant.email || '');
            setComposeNaam(klant.naam || '');
            // Re-apply template vars if template selected
            if (composeTemplateId) {
                const tpl = templates.find(function (t) { return String(t.id) === composeTemplateId; });
                if (tpl) {
                    setComposeOnderwerp(replaceVars(tpl.onderwerp, klant.naam));
                    setComposeBericht(replaceVars(tpl.body, klant.naam));
                }
            }
        } else {
            setComposeEmail('');
            setComposeNaam('');
        }
    }

    // ── Select template for compose ──
    function selectTemplate(templateId: string) {
        setComposeTemplateId(templateId);
        if (!templateId) return;
        const tpl = templates.find(function (t) { return String(t.id) === templateId; });
        if (tpl) {
            const naam = composeNaam || 'klant';
            setComposeOnderwerp(replaceVars(tpl.onderwerp, naam));
            setComposeBericht(replaceVars(tpl.body, naam));
        }
    }

    // ── Send email ──
    async function handleSend() {
        if (!composeEmail || !composeOnderwerp || !composeBericht) {
            showToast('Vul alle velden in', 'error');
            return;
        }
        setSending(true);
        try {
            const html = wrapHtml(
                '<p>' + composeBericht.replace(/\n/g, '<br>') + '</p>',
                bedrijfsnaam
            );
            const result = await sendEmail({
                to: composeEmail,
                subject: composeOnderwerp,
                html: html,
                text: composeBericht,
            });

            await insertEmail({
                klant_id: composeKlantId ? parseInt(composeKlantId) : null,
                aan_email: composeEmail,
                aan_naam: composeNaam || null,
                onderwerp: composeOnderwerp,
                inhoud: composeBericht,
                type: 'vrij',
                status: result.success ? 'verzonden' : 'mislukt',
            } as any);

            if (result.success) {
                showToast(result.fallback ? 'E-mail geopend in je mailclient' : 'E-mail verzonden!', 'success');
                resetCompose();
                setTab('verzonden');
            } else {
                showToast('Fout: ' + (result.error || 'onbekend'), 'error');
            }
        } catch (err: any) {
            showToast('Fout bij verzenden: ' + (err.message || ''), 'error');
        }
        setSending(false);
    }

    function resetCompose() {
        setComposeKlantId('');
        setComposeEmail('');
        setComposeNaam('');
        setComposeOnderwerp('');
        setComposeBericht('');
        setComposeTemplateId('');
    }

    // ── Template CRUD ──
    function startEditTemplate(tpl?: EmailTemplate) {
        if (tpl) {
            setEditingTemplate(tpl.id);
            setTplForm({ naam: tpl.naam, onderwerp: tpl.onderwerp, body: tpl.body, categorie: tpl.categorie });
        } else {
            setEditingTemplate('new');
            setTplForm({ naam: '', onderwerp: '', body: '', categorie: 'algemeen' });
        }
    }

    async function saveTemplate() {
        if (!tplForm.naam || !tplForm.onderwerp || !tplForm.body) {
            showToast('Vul alle velden in', 'error');
            return;
        }
        try {
            if (editingTemplate === 'new') {
                await insertTemplate(tplForm as any);
                showToast('Template aangemaakt', 'success');
            } else {
                await updateTemplate(editingTemplate as number, tplForm as any);
                showToast('Template opgeslagen', 'success');
            }
            setEditingTemplate(null);
        } catch { showToast('Fout bij opslaan', 'error'); }
    }

    function deleteTemplate(id: number) {
        showConfirm('Weet je zeker dat je deze template wilt verwijderen?', async function () {
            await removeTemplate(id);
            showToast('Template verwijderd', 'success');
        });
    }

    // ── Format date ──
    function fmtDate(d: string): string {
        if (!d) return '';
        const dt = new Date(d);
        return dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    }

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Flame size={24} className="text-[var(--color-accent-gold)] animate-pulse" />
            </div>
        );
    }

    return (
        <>
            <PageHeader
                title="Mailbox"
                description="Verstuur e-mails naar klanten, bekijk je verzendhistorie en beheer e-mail templates"
                actions={tab !== 'nieuw' ? (
                    <button className="btn btn-brand" onClick={function () { resetCompose(); setTab('nieuw'); }}>
                        <Send size={14} /> Nieuwe e-mail
                    </button>
                ) : undefined}
            />

            <PageGuideNote
                id="mailbox"
                accent="#0ea5e9"
                icon={Inbox}
                intro="Klant-mails versturen vanuit BBQ Architect zelf — met templates die je niet elke keer opnieuw hoeft te schrijven."
                actions={[
                    { lead: 'Klik Nieuwe e-mail', text: 'om een mail te schrijven — kies een template of begin blanco.' },
                    { lead: 'Verzendhistorie', text: 'laat zien wat er naar wie is gegaan en wanneer — handig als een klant zegt iets niet ontvangen te hebben.' },
                    { lead: 'Templates beheer je apart', text: '— pas ze aan met variabelen zoals {{naam}} en {{datum}} en gebruik ze overal.' },
                ]}
            />

            <div className="tab-bar" style={{ marginBottom: 16 }}>
                <button className={'tab-btn' + (tab === 'verzonden' ? ' active' : '')} onClick={function () { setTab('verzonden'); setSelectedEmail(null); }}>
                    <Mail size={14} /> Verzonden
                    {emails.length > 0 && <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.6 }}>({emails.length})</span>}
                </button>
                <button className={'tab-btn' + (tab === 'nieuw' ? ' active' : '')} onClick={function () { setTab('nieuw'); }}>
                    <Send size={14} /> Nieuwe e-mail
                </button>
                <button className={'tab-btn' + (tab === 'templates' ? ' active' : '')} onClick={function () { setTab('templates'); setEditingTemplate(null); }}>
                    <FileText size={14} /> Templates
                    {templates.length > 0 && <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.6 }}>({templates.length})</span>}
                </button>
            </div>

            {/* ═══════════ TAB: VERZONDEN ═══════════ */}
            {tab === 'verzonden' && (
                <>
                    {/* Search + Filter */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                            <input
                                style={{ width: '100%', paddingLeft: 34, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px 8px 34px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                                placeholder="Zoek op naam, e-mail of onderwerp..."
                                value={search}
                                onChange={function (e) { setSearch(e.target.value); }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {(['alle', 'vrij', 'offerte', 'factuur', 'herinnering'] as FilterType[]).map(function (ft) {
                                return (
                                    <button key={ft} className={'btn btn-sm ' + (filterType === ft ? 'btn-brand' : 'btn-ghost')}
                                        onClick={function () { setFilterType(ft); }}>
                                        {ft === 'alle' ? 'Alle' : TYPE_LABELS[ft] || ft}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {filteredEmails.length === 0 && (
                        <EmptyState page="/mailbox" onAction={function () { resetCompose(); setTab('nieuw'); }} />
                    )}

                    {/* Email detail */}
                    {selectedEmail && (
                        <MetallicCard hover={false} className="p-5 mb-4">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                <div>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{selectedEmail.onderwerp}</h3>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        Aan: {selectedEmail.aan_naam ? selectedEmail.aan_naam + ' — ' : ''}{selectedEmail.aan_email}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(selectedEmail.created_at)}</div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={function () { setSelectedEmail(null); }} aria-label="Sluiten">
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
                                {selectedEmail.inhoud}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                    background: (TYPE_COLORS[selectedEmail.type] || 'var(--blue)') + '22',
                                    color: TYPE_COLORS[selectedEmail.type] || 'var(--blue)',
                                    textTransform: 'uppercase',
                                }}>{TYPE_LABELS[selectedEmail.type] || selectedEmail.type}</span>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                    background: selectedEmail.status === 'verzonden' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'color-mix(in srgb, var(--red) 12%, transparent)',
                                    color: selectedEmail.status === 'verzonden' ? 'var(--green)' : 'var(--red)',
                                    textTransform: 'uppercase',
                                }}>{selectedEmail.status}</span>
                            </div>
                        </MetallicCard>
                    )}

                    {/* Email list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredEmails.map(function (email) {
                            const isSelected = selectedEmail?.id === email.id;
                            return (
                                <MetallicCard key={email.id} className={'p-4' + (isSelected ? ' border-[var(--color-accent-gold)]' : '')}
                                    onClick={function () { setSelectedEmail(isSelected ? null : email); }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                    background: TYPE_COLORS[email.type] || 'var(--blue)',
                                                }} />
                                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {email.onderwerp}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, paddingLeft: 16 }}>
                                                {email.aan_naam || email.aan_email}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(email.created_at)}</div>
                                            <span style={{
                                                fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, marginTop: 4, display: 'inline-block',
                                                background: email.status === 'verzonden' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'color-mix(in srgb, var(--red) 12%, transparent)',
                                                color: email.status === 'verzonden' ? 'var(--green)' : 'var(--red)',
                                                textTransform: 'uppercase',
                                            }}>{email.status}</span>
                                        </div>
                                    </div>
                                </MetallicCard>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ═══════════ TAB: NIEUWE E-MAIL ═══════════ */}
            {tab === 'nieuw' && (
                <MetallicCard hover={false} className="p-6">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                        <button className="btn btn-ghost btn-sm" onClick={function () { setTab('verzonden'); }} aria-label="Terug">
                            <ArrowLeft size={14} />
                        </button>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Nieuwe e-mail</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Klant selector */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Aan (klant)</label>
                            <select
                                value={composeKlantId}
                                onChange={function (e) { selectKlant(e.target.value); }}
                                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            >
                                <option value="">— Selecteer een klant —</option>
                                {klanten.filter(function (k) { return k.email; }).map(function (k) {
                                    return <option key={k.id} value={String(k.id)}>{k.naam} — {k.email}</option>;
                                })}
                            </select>
                        </div>

                        {/* Of handmatig e-mail */}
                        {!composeKlantId && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>E-mailadres</label>
                                    <input
                                        value={composeEmail}
                                        onChange={function (e) { setComposeEmail(e.target.value); }}
                                        placeholder="email@voorbeeld.nl"
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Naam</label>
                                    <input
                                        value={composeNaam}
                                        onChange={function (e) { setComposeNaam(e.target.value); }}
                                        placeholder="Naam ontvanger"
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Template selector */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Template (optioneel)</label>
                            <select
                                value={composeTemplateId}
                                onChange={function (e) { selectTemplate(e.target.value); }}
                                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            >
                                <option value="">— Geen template —</option>
                                {templates.map(function (t) {
                                    return <option key={t.id} value={String(t.id)}>{t.naam}</option>;
                                })}
                            </select>
                        </div>

                        {/* Onderwerp */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Onderwerp</label>
                            <input
                                value={composeOnderwerp}
                                onChange={function (e) { setComposeOnderwerp(e.target.value); }}
                                placeholder="Onderwerp van de e-mail"
                                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            />
                        </div>

                        {/* Bericht */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Bericht</label>
                            <textarea
                                rows={8}
                                value={composeBericht}
                                onChange={function (e) { setComposeBericht(e.target.value); }}
                                placeholder="Typ je bericht hier..."
                                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif', resize: 'vertical' }}
                            />
                        </div>

                        {/* Preview info */}
                        {composeEmail && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Mail size={12} /> Wordt verzonden naar: <strong style={{ color: 'var(--text)' }}>{composeEmail}</strong>
                            </div>
                        )}

                        {/* Send button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn btn-ghost" onClick={function () { resetCompose(); setTab('verzonden'); }}>
                                Annuleren
                            </button>
                            <button className="btn btn-brand" onClick={handleSend} disabled={sending || !composeEmail || !composeOnderwerp || !composeBericht}>
                                {sending ? <Flame size={14} className="animate-pulse" /> : <Send size={14} />}
                                {sending ? 'Verzenden...' : 'Versturen'}
                            </button>
                        </div>
                    </div>
                </MetallicCard>
            )}

            {/* ═══════════ TAB: TEMPLATES ═══════════ */}
            {tab === 'templates' && (
                <>
                    {editingTemplate !== null ? (
                        <MetallicCard hover={false} className="p-6">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                                <button className="btn btn-ghost btn-sm" onClick={function () { setEditingTemplate(null); }} aria-label="Terug">
                                    <ArrowLeft size={14} />
                                </button>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                                    {editingTemplate === 'new' ? 'Nieuwe template' : 'Template bewerken'}
                                </h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Naam</label>
                                        <input value={tplForm.naam} onChange={function (e) { setTplForm({ ...tplForm, naam: e.target.value }); }} placeholder="Template naam"
                                            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Categorie</label>
                                        <select value={tplForm.categorie} onChange={function (e) { setTplForm({ ...tplForm, categorie: e.target.value }); }}
                                            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}>
                                            <option value="algemeen">Algemeen</option>
                                            <option value="offerte">Offerte</option>
                                            <option value="na-event">Na event</option>
                                            <option value="factuur">Factuur</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Onderwerp</label>
                                    <input value={tplForm.onderwerp} onChange={function (e) { setTplForm({ ...tplForm, onderwerp: e.target.value }); }}
                                        placeholder="Onderwerp (gebruik {{klant_naam}} en {{bedrijfsnaam}})"
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Inhoud</label>
                                    <textarea rows={10} value={tplForm.body} onChange={function (e) { setTplForm({ ...tplForm, body: e.target.value }); }}
                                        placeholder="Typ de template inhoud... Gebruik {{klant_naam}} en {{bedrijfsnaam}} als variabelen."
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif', resize: 'vertical' }} />
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', background: 'color-mix(in srgb, var(--color-accent-gold) 6%, transparent)', borderRadius: 8, padding: '8px 12px', border: '1px solid color-mix(in srgb, var(--color-accent-gold) 10%, transparent)' }}>
                                    <strong>Variabelen:</strong> {'{{klant_naam}}'} = naam ontvanger, {'{{bedrijfsnaam}}'} = jouw bedrijfsnaam
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <button className="btn btn-ghost" onClick={function () { setEditingTemplate(null); }}>Annuleren</button>
                                    <button className="btn btn-brand" onClick={saveTemplate}>Opslaan</button>
                                </div>
                            </div>
                        </MetallicCard>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                                <button className="btn btn-brand btn-sm" onClick={function () { startEditTemplate(); }}>
                                    <Plus size={14} /> Nieuwe template
                                </button>
                            </div>

                            {templates.length === 0 && (
                                <EmptyState page="/mailbox" onAction={function () { startEditTemplate(); }}
                                    icon="FileText" title="Geen templates" description="Maak je eerste e-mail template aan om sneller te mailen."
                                    actionLabel="Template aanmaken" />
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {templates.map(function (tpl) {
                                    return (
                                        <MetallicCard key={tpl.id} hover={false} className="p-4">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{tpl.naam}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{tpl.onderwerp}</div>
                                                    <span style={{
                                                        display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700,
                                                        padding: '4px 8px', borderRadius: 6,
                                                        background: 'color-mix(in srgb, var(--color-accent-gold) 10%, transparent)', color: 'var(--color-accent-gold)',
                                                        textTransform: 'uppercase',
                                                    }}>{tpl.categorie}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={function () { startEditTemplate(tpl); }} aria-label="Bewerken">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button className="btn btn-ghost btn-sm" onClick={function () { deleteTemplate(tpl.id); }} aria-label="Verwijderen"
                                                        style={{ color: 'var(--red)' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                                                {tpl.body.slice(0, 150)}{tpl.body.length > 150 ? '...' : ''}
                                            </div>
                                        </MetallicCard>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </>
    );
}
