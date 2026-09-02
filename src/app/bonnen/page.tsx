/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * /bonnen — Bucket E P0-1 unified bon-scanner entry-point.
 *
 * Eén route die de 3 oude flows vervangt:
 *   - /inkoop bon-scan       → leeft hier, vereenvoudigd
 *   - BonAddSheet            → blijft als modal in /geld/boekhouder, post naar
 *                              dezelfde /api/bonnen/extract
 *   - ScanFab field-mode     → blijft mobile FAB, redirect hierheen na shot
 *
 * Op deze pagina:
 *   1. MultiFormatDropZone (drag-drop, paste, camera, picker)
 *   2. Extract-results sectie: per geüploade bon een preview-card met items
 *   3. Acties: → /archief openen, of meteen weer een nieuwe scan
 */

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageGuideNote from '@/components/PageGuideNote';
import { useToast } from '@/components/Toast';
import MultiFormatDropZone, {
    type ExtractResult,
} from '@/app/bonnen/_components/MultiFormatDropZone';
import { fmt } from '@/lib/utils';
import { ArrowRight, Check, Archive, ExternalLink, Loader2, Link2, AlertTriangle, Sparkles, Zap } from 'lucide-react';
import { compressBonImage, blobToDataUrl } from '@/lib/compressBonImage';
import { setBonLeverancierAction } from '@/app/archief/actions';

interface CompletedExtract {
    id: string;
    file_name: string;
    result: ExtractResult;
    /** Originele File-object voor upload naar Storage bij commit.
        Bewaard in memory tot commit lukt; daarna gecleared (memory hygiene). */
    originalFile: File;
    /** Staat deze bon al in het kistje? Wordt direct na het uitlezen gezet —
        de scan-pagina bewaart automatisch, zodat een bon nooit meer verdwijnt
        omdat je wegklikt of ververst. */
    committed?: boolean;
    committing?: boolean;
    commitError?: string | null;
    archiefBonId?: number;
    /* Leverancier-keuze door Sam:
       - chosenLeverancierId: koppel aan een bestaande (uit dropdown/candidate-klik)
       - chosenNewLeverancierNaam: nieuwe leverancier-record aanmaken
       - leverancierResolved: true wanneer er een keuze gemaakt is (of auto_matched
         was). De keuze blokkeert het bewaren NIET meer — de bon staat al in het
         kistje en de keuze wordt er los op bijgewerkt. */
    chosenLeverancierId?: number | null;
    chosenNewLeverancierNaam?: string | null;
    leverancierResolved?: boolean;
    /* Bon-scanner v2: escalatie-state. */
    escalating?: boolean;
    escalateError?: string | null;
}

export default function BonnenPage() {
    return (
        <Suspense fallback={null}>
            <BonnenPageInner />
        </Suspense>
    );
}

function BonnenPageInner() {
    const showToast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [completed, setCompleted] = useState<CompletedExtract[]>([]);

    /* ?prefill=ID — opent flow als "attach aan bestaande bon" (uit BonPreview
       "Scan opnieuw"-link). Eén attach-target per page-load, niet per scan. */
    const prefillRaw = searchParams.get('prefill');
    const attachToBonId = prefillRaw ? Number.parseInt(prefillRaw, 10) || null : null;

    /* FileReader-promise wrapper. Gebruikt door commit-flow om de originele
       scan-file als data-URL naar de server te sturen voor Storage-upload. */
    function fileToDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
            reader.readAsDataURL(file);
        });
    }

    /* Sam kiest een bestaande leverancier voor de scan-resultaten.
       De bon staat op dat moment al in het kistje, dus de keuze wordt meteen
       op die rij bijgewerkt — niet pas bij een latere knop. */
    function chooseLeverancier(entryId: string, leverancierId: number, _naam: string) {
        let bonId: number | undefined;
        setCompleted(prev =>
            prev.map(c => {
                if (c.id !== entryId) return c;
                bonId = c.archiefBonId;
                return {
                    ...c,
                    chosenLeverancierId: leverancierId,
                    chosenNewLeverancierNaam: null,
                    leverancierResolved: true,
                };
            }),
        );
        if (bonId) void persistLeverancier(bonId, { leverancierId });
    }

    /* Sam wil een NIEUWE leverancier aanmaken voor deze scan.
       Naam wordt server-side INSERT-ed bij commit. */
    function chooseNewLeverancier(entryId: string, naam: string) {
        const cleaned = naam.trim();
        if (!cleaned) return;
        let bonId: number | undefined;
        setCompleted(prev =>
            prev.map(c => {
                if (c.id !== entryId) return c;
                bonId = c.archiefBonId;
                return {
                    ...c,
                    chosenLeverancierId: null,
                    chosenNewLeverancierNaam: cleaned,
                    leverancierResolved: true,
                };
            }),
        );
        if (bonId) void persistLeverancier(bonId, { nieuweNaam: cleaned });
    }

    /* Werkt de leverancier bij op een bon die al in het kistje staat. Faalt dit,
       dan zeggen we dat — de bon zelf is niet in gevaar, alleen de koppeling. */
    async function persistLeverancier(
        bonId: number,
        keuze: { leverancierId?: number; nieuweNaam?: string },
    ) {
        const res = await setBonLeverancierAction({ bonId, ...keuze });
        if (!res.ok) {
            showToast({
                message: `Leverancier koppelen mislukt: ${res.error}`,
                type: 'error',
            });
        }
    }

    /* Bewaart een scan-result in het bonnenkistje (POST /api/bonnen/commit).

       Waarom dit automatisch gebeurt, direct na het uitlezen: hiervoor leefde
       een uitgelezen bon alleen in dit tabblad tot je per kaart op "Bevestig"
       klikte. Verversen, wegklikken of een tab die dichtklapt = bon weg. Op
       23 augustus zijn zo 5 van de 6 ingelezen facturen verdampt.

       Twee dingen die hier bewust NIET meer gebeuren:
         - navigeren na een geslaagde opslag. Dat brak de "bewaar alles"-lus:
           na de eerste bon werd de pagina ontmanteld en de rest nooit bewaard.
         - wachten op de leverancier-keuze. De bon gaat als 'pending' het
           kistje in; de keuze wordt er daarna los op bijgewerkt. */
    async function persistEntry(
        entry: CompletedExtract,
        opts: {
            /* Bestaande bon bijwerken ipv nieuwe rij (her-opslaan na escalatie). */
            attachTo?: number | null;
            /* File meesturen? Bij her-opslaan staat 'ie al in Storage. */
            withFile?: boolean;
            /* Bedragen van de bestaande rij overschrijven. */
            overwriteTotals?: boolean;
            /* Naar het kistje springen na afloop (alleen de ?prefill-flow). */
            navigate?: boolean;
        } = {},
    ): Promise<number | null> {
        setCompleted(prev =>
            prev.map(c =>
                c.id === entry.id ? { ...c, committing: true, commitError: null } : c,
            ),
        );

        try {
            /* Originele file als base64 zodat de backend 'm naar Storage kan
               uploaden. Bij her-opslaan overslaan — scheelt een megabyte. */
            const fileDataUrl =
                opts.withFile === false ? undefined : await fileToDataUrl(entry.originalFile);

            /* Leverancier-resolve: gebruik Sam's keuze als die er is, anders
               val terug op extract-output (alleen geldig bij auto_matched). */
            const finalLeverancierId =
                entry.chosenLeverancierId ?? entry.result.bon_preview.leverancier_id;

            const res = await fetch('/api/bonnen/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bon_preview: {
                        ...entry.result.bon_preview,
                        leverancier_id: finalLeverancierId,
                    },
                    items: entry.result.items_with_suggestions,
                    image_hash: entry.result.image_hash,
                    mime_type: entry.result.mime_type,
                    source_type: entry.result.source_type,
                    ocr_engine: entry.result.ocr_engine,
                    confidence: entry.result.confidence,
                    ai_cost_eur_cents: entry.result.ai_cost_eur_cents,
                    file_data_url: fileDataUrl,
                    file_name: entry.file_name,
                    /* ?prefill=ID koppelt aan een bestaande bon; anders koppelt
                       een her-opslag aan de rij die we net zelf aanmaakten. */
                    attach_to_bon_id: opts.attachTo ?? attachToBonId ?? undefined,
                    overwrite_totals: opts.overwriteTotals ?? undefined,
                    /* Nieuwe leverancier expliciet door Sam aangevraagd. */
                    new_leverancier_naam: entry.chosenNewLeverancierNaam ?? undefined,
                    /* v2: persist reconciliation + pass-history voor audit */
                    reconciliation_status: entry.result.reconciliation?.status,
                    ai_passes: entry.result.ai_passes,
                }),
            });
            const data = await res.json();

            /* Stond 'ie er al? Dan is de bon niet kwijt — koppel de kaart aan
               de bestaande rij zodat "open in kistje" gewoon werkt. */
            if (res.status === 409 && data.bon_id) {
                setCompleted(prev =>
                    prev.map(c =>
                        c.id === entry.id
                            ? {
                                  ...c,
                                  committing: false,
                                  committed: true,
                                  archiefBonId: data.bon_id,
                              }
                            : c,
                    ),
                );
                return data.bon_id as number;
            }

            if (!res.ok || !data.ok) {
                throw new Error(data.detail || data.message || data.error || `HTTP ${res.status}`);
            }

            setCompleted(prev =>
                prev.map(c =>
                    c.id === entry.id
                        ? {
                              ...c,
                              committing: false,
                              committed: true,
                              commitError: null,
                              archiefBonId: data.bon_id,
                          }
                        : c,
                ),
            );

            if (opts.navigate) {
                router.push(data.redirect || `/archief?bon=${data.bon_id}`);
            }
            return data.bon_id as number;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Onbekende fout';
            setCompleted(prev =>
                prev.map(c =>
                    c.id === entry.id ? { ...c, committing: false, commitError: msg } : c,
                ),
            );
            return null;
        }
    }

    /* Handmatig opnieuw proberen vanaf een kaart die niet bewaard kreeg. */
    async function retrySave(entryId: string) {
        const entry = completed.find(c => c.id === entryId);
        if (!entry || entry.committing) return;
        if (entry.committed && entry.archiefBonId) return;

        const bonId = await persistEntry(entry, { navigate: !!attachToBonId });
        showToast(
            bonId
                ? { message: 'Bon staat in je kistje.', type: 'success', title: 'Bewaard' }
                : { message: 'Opslaan mislukt — probeer het nog een keer.', type: 'error' },
        );
    }

    /* Escaleer een bestaande extractie naar Opus 4.7 voor maximale accuracy.
       Wordt gebruikt als de reconciliation rood vlagt (Σ items ≠ totaal_bedrag)
       of als Sam handmatig "probeer met krachtigere AI" klikt. Cost ~€0.10. */
    async function escalateExtract(entryId: string) {
        const entry = completed.find(c => c.id === entryId);
        if (!entry || entry.escalating) return;
        if (entry.result.can_escalate === false) {
            showToast({ message: 'Al de krachtigste AI geprobeerd.', type: 'warning' });
            return;
        }

        setCompleted(prev => prev.map(c =>
            c.id === entryId ? { ...c, escalating: true, escalateError: null } : c,
        ));

        try {
            const isImage = entry.originalFile.type.startsWith('image/');
            let dataUrl: string;
            if (isImage) {
                const blob = await compressBonImage(entry.originalFile);
                dataUrl = await blobToDataUrl(blob);
            } else {
                dataUrl = await fileToDataUrl(entry.originalFile);
            }

            const res = await fetch('/api/bonnen/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_type: entry.result.source_type,
                    file_data_url: dataUrl,
                    filename: entry.file_name,
                    force_model: 'claude-opus-4-7',
                }),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || errJson.error || `HTTP ${res.status}`);
            }

            const newResult = (await res.json()) as ExtractResult;
            setCompleted(prev => prev.map(c =>
                c.id === entryId
                    ? { ...c, result: newResult, escalating: false, leverancierResolved: newResult.leverancier_state === 'auto_matched' }
                    : c,
            ));

            /* Staat de bon al in het kistje? Dan de betere uitlezing daar
               overheen zetten — anders houdt het kistje de zwakkere lezing. */
            let bewaard = true;
            if (entry.archiefBonId) {
                const bonId = await persistEntry(
                    { ...entry, result: newResult },
                    {
                        attachTo: entry.archiefBonId,
                        withFile: false,
                        overwriteTotals: true,
                    },
                );
                bewaard = bonId !== null;
            }

            showToast({
                message: bewaard
                    ? `Opnieuw gescand met Opus 4.7 (${newResult.items_with_suggestions.length} regels) en bijgewerkt in je kistje.`
                    : `Opnieuw gescand (${newResult.items_with_suggestions.length} regels), maar bijwerken in het kistje mislukte.`,
                type: bewaard ? 'success' : 'warning',
                title: 'Klaar',
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Escalatie mislukte';
            setCompleted(prev => prev.map(c =>
                c.id === entryId ? { ...c, escalating: false, escalateError: msg } : c,
            ));
            showToast({ message: `Opnieuw scannen mislukt: ${msg}`, type: 'error' });
        }
    }

    async function handleExtracted(result: ExtractResult, originalFile: File) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        /* Auto-resolve voor zekere matches: bij score >= 80 is leverancier_id
           al gezet door extract route → leverancierResolved=true zodat Sam
           niets hoeft te doen. Bij needs_approval/new_suggested/no_leverancier
           kiest Sam daarna; dat blokkeert het bewaren niet meer. */
        const autoResolved = result.leverancier_state === 'auto_matched';
        const entry: CompletedExtract = {
            id,
            file_name: originalFile.name,
            result,
            originalFile,
            chosenLeverancierId: autoResolved ? result.bon_preview.leverancier_id : null,
            chosenNewLeverancierNaam: null,
            leverancierResolved: autoResolved,
        };
        setCompleted(prev => [entry, ...prev]);

        const lev = result.bon_preview.leverancier_naam || 'onbekende leverancier';
        const totaal = result.bon_preview.totaal_bedrag;
        const itemCount = result.items_with_suggestions.length;
        const regels = `${itemCount} regel${itemCount === 1 ? '' : 's'}`;

        /* De ?prefill-flow koppelt aan één bestaande bon en overschrijft die —
           dat blijft een bewuste klik van Sam, geen automatische opslag. */
        if (attachToBonId) {
            showToast({
                message: `${lev} — ${regels} · ${fmt(totaal)}`,
                type: 'success',
                title: 'Bon uitgelezen',
            });
            return;
        }

        /* Meteen bewaren. Vanaf hier is de bon van Sam, ook als hij wegklikt. */
        const bonId = await persistEntry(entry, { navigate: false });
        showToast(
            bonId
                ? {
                      message: `${lev} — ${regels} · ${fmt(totaal)} · staat in je kistje`,
                      type: 'success',
                      title: 'Uitgelezen en bewaard',
                  }
                : {
                      message: `${lev} · ${fmt(totaal)} is wél uitgelezen maar NIET bewaard. Klik "Bewaar in kistje" op de kaart.`,
                      type: 'error',
                      title: 'Opslaan mislukt',
                  },
        );
    }

    function handleDuplicate(dup: any, originalFile: File) {
        showToast({
            message: `${originalFile.name} stond al in je archief${dup.duplicate_winkel ? ` (${dup.duplicate_winkel}` + (dup.duplicate_datum ? `, ${dup.duplicate_datum})` : ')') : ''}.`,
            type: 'warning',
            title: 'Deze bon staat al',
            action: {
                label: 'Open bon',
                onClick: () => {
                    window.location.href = `/archief?bon=${dup.duplicate_bon_id}`;
                },
            },
        });
    }

    /* Wat staat er écht in de database, en wat (nog) niet. */
    const nietBewaard = completed.filter(c => !c.archiefBonId && !c.committing);
    const bewaardCount = completed.filter(c => !!c.archiefBonId).length;

    /* Laatste vangnet: is er iets uitgelezen maar niet bewaard, dan mag de
       browser niet stilletjes dichtklappen. Het opslaan gaat nu automatisch,
       dus dit slaat alleen aan als een opslag echt gefaald is. */
    React.useEffect(() => {
        if (nietBewaard.length === 0) return;
        const waarschuw = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', waarschuw);
        return () => window.removeEventListener('beforeunload', waarschuw);
    }, [nietBewaard.length]);

    function handleError(message: string) {
        /* Format-fouten van de extract-route (415 unsupported_mime) komen hier.
           Mensentaal: geen "415 status" of "unsupported_mime", gewoon de uitleg. */
        showToast({
            message: message.toLowerCase().includes('format')
                ? message
                : `Bon uitlezen mislukt: ${message}`,
            type: 'error',
            title: 'Format niet ondersteund',
        });
    }

    return (
        <div className="container" style={{ paddingBottom: 80 }}>
            <PageHeader
                title={attachToBonId ? 'Opnieuw inscannen' : 'Bonnen scannen'}
                description={
                    attachToBonId
                        ? `De volgende scan wordt gekoppeld aan bon #${attachToBonId} in je archief. Bon-data (datum, leverancier, bedrag) wordt overschreven met de nieuwe AI-extractie.`
                        : "Drop foto's, PDFs, screenshots of UBL-XML. Wij lezen ze uit en zetten ze klaar voor je archief."
                }
                actions={
                    <Link
                        href={attachToBonId ? `/archief?bon=${attachToBonId}` : '/archief'}
                        className="btn btn-ghost"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Archive size={16} /> {attachToBonId ? 'Terug naar bon' : 'Open archief'}
                    </Link>
                }
            />

            {attachToBonId && (
                <div
                    role="status"
                    style={{
                        marginBottom: 20,
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'rgba(196,163,90,.06)',
                        border: '1px solid rgba(196,163,90,.25)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                    }}
                >
                    <Link2 size={16} style={{ color: 'var(--brand-gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, minWidth: 0 }}>
                        <strong style={{ color: 'var(--brand-gold)' }}>Attach-modus actief</strong>
                        {' — '}
                        nieuwe scan wordt gekoppeld aan{' '}
                        <Link
                            href={`/archief?bon=${attachToBonId}`}
                            style={{
                                color: 'var(--brand-gold)',
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted',
                            }}
                        >
                            bon #{attachToBonId}
                        </Link>
                        .
                    </span>
                    <Link
                        href="/bonnen"
                        replace
                        style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 6,
                            color: 'var(--muted)',
                        }}
                    >
                        Annuleren
                    </Link>
                </div>
            )}

            <PageGuideNote
                id="bonnen"
                accent="#FFBF00"
                intro="Sleep meerdere bestanden tegelijk, plak een screenshot met Cmd+V, of gebruik de camera op je telefoon."
                actions={[
                    { lead: 'PDF en foto', text: '— Haiku leest de bon binnen 6 seconden uit.' },
                    { lead: 'UBL-XML', text: '— gratis verwerkt, geen AI-call nodig.' },
                    { lead: 'Cmd+V', text: '— plak een screenshot direct vanaf je klembord.' },
                ]}
            />

            <PageSection>
                <MultiFormatDropZone
                    onExtracted={handleExtracted}
                    onDuplicate={handleDuplicate}
                    onError={handleError}
                    maxBatch={14}
                    variant="page"
                />
            </PageSection>

            {completed.length > 0 && (
                <PageSection>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 14,
                        flexWrap: 'wrap',
                        gap: 8,
                    }}>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                                Net gescand ({completed.length})
                            </h2>
                            {/* Eerlijke telling: hoeveel staan er écht in de DB. */}
                            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                                {nietBewaard.length === 0
                                    ? `${bewaardCount} van ${completed.length} bewaard in je kistje — je kunt gerust wegklikken.`
                                    : `${bewaardCount} van ${completed.length} bewaard. ${nietBewaard.length} nog niet — die ben je kwijt als je nu wegklikt.`}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {nietBewaard.length > 0 && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        for (const c of nietBewaard) {
                                            /* Sequentieel, en zonder tussentijds
                                               navigeren — dat brak deze lus eerder. */
                                            await persistEntry(c, { navigate: false });
                                        }
                                    }}
                                    className="btn btn-brand"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        minHeight: 36,
                                    }}
                                >
                                    <Check size={14} /> Bewaar {nietBewaard.length} alsnog
                                </button>
                            )}
                            {bewaardCount > 0 && (
                                <Link
                                    href="/archief"
                                    className="btn btn-ghost"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        minHeight: 36,
                                    }}
                                >
                                    <Archive size={14} /> Open bonnenkistje
                                </Link>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {completed.map(c => (
                            <ResultCard
                                key={c.id}
                                entry={c}
                                onCommit={retrySave}
                                onChooseLeverancier={chooseLeverancier}
                                onChooseNewLeverancier={chooseNewLeverancier}
                                onEscalate={escalateExtract}
                            />
                        ))}
                    </div>
                </PageSection>
            )}
        </div>
    );
}

function ResultCard({
    entry,
    onCommit,
    onChooseLeverancier,
    onChooseNewLeverancier,
    onEscalate,
}: {
    entry: CompletedExtract;
    onCommit: (entryId: string) => void;
    onChooseLeverancier: (entryId: string, leverancierId: number, naam: string) => void;
    onChooseNewLeverancier: (entryId: string, naam: string) => void;
    onEscalate: (entryId: string) => void;
}) {
    const r = entry.result;
    const lev = r.bon_preview.leverancier_naam || '(onbekend)';
    const datum = r.bon_preview.datum || '—';
    const matchedCount = r.items_with_suggestions.filter(i => i.inventory_id != null).length;

    /* UBL = source_type 'ubl_xml' → toon gratis-badge. */
    const isUbl = r.source_type === 'ubl_xml';

    return (
        <div
            style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--card, rgba(30,30,34,.5))',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(34,197,94,.12)',
                        color: 'var(--green)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                    aria-hidden="true"
                >
                    <Check size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {lev}{' '}
                        <span
                            style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}
                        >
                            · {datum}
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.file_name}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isUbl && (
                        <Badge color="var(--purple, #a78bfa)" label="UBL · gratis" />
                    )}
                    {!isUbl && (
                        <Badge
                            color="var(--brand)"
                            label={`${r.ocr_engine} · ${(r.ai_cost_eur_cents / 100).toFixed(3)}€`}
                        />
                    )}
                    <Badge
                        color={r.confidence >= 0.85 ? 'var(--green)' : 'var(--amber)'}
                        label={`${Math.round(r.confidence * 100)}%`}
                    />
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <Stat label="Totaal" value={fmt(r.bon_preview.totaal_bedrag)} />
                <Stat label="Netto" value={fmt(r.bon_preview.netto_bedrag)} />
                <Stat label="BTW 9%" value={fmt(r.bon_preview.btw_laag_bedrag)} />
                <Stat label="BTW 21%" value={fmt(r.bon_preview.btw_hoog_bedrag)} />
                <Stat
                    label="Regels"
                    value={`${r.items_with_suggestions.length} · ${matchedCount} gematcht`}
                />
            </div>

            {/* Reconciliation-banner — flag bij Σ items ≠ totaal_bedrag.
                Komt boven leverancier-step zodat Sam ziet dat hij moet checken
                vóórdat hij koppelt + bevestigt. */}
            <ReconciliationBanner
                entry={entry}
                onEscalate={() => onEscalate(entry.id)}
            />

            {/* Leverancier-approval step — mens-blijft-de-baas regel.
                AI suggesteert; Sam keurt goed of kiest. Verschijnt boven de
                items-list zodat 't direct opvalt. */}
            <LeverancierStep
                entry={entry}
                onChoose={(id, naam) => onChooseLeverancier(entry.id, id, naam)}
                onChooseNew={(naam) => onChooseNewLeverancier(entry.id, naam)}
            />

            <details>
                <summary
                    style={{
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginBottom: 8,
                    }}
                >
                    Toon regels ({r.items_with_suggestions.length})
                </summary>
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                    }}
                >
                    {r.items_with_suggestions.slice(0, 50).map((it, i) => (
                        <li
                            key={i}
                            style={{
                                display: 'flex',
                                gap: 8,
                                padding: '4px 0',
                                fontSize: 13,
                                color: 'var(--text)',
                            }}
                        >
                            <span style={{ flex: 1 }}>
                                {it.naam}
                                {it.inventory_naam && (
                                    <span
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--green)',
                                            marginLeft: 6,
                                        }}
                                    >
                                        → {it.inventory_naam}
                                    </span>
                                )}
                            </span>
                            <span style={{ color: 'var(--muted)' }}>
                                {it.aantal} {it.unit}
                            </span>
                            <span style={{ minWidth: 70, textAlign: 'right' }}>
                                {fmt(it.totaal)}
                            </span>
                        </li>
                    ))}
                </ul>
            </details>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {entry.archiefBonId ? (
                    <Link
                        href={`/archief?bon=${entry.archiefBonId}`}
                        className="btn btn-brand"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            minHeight: 36,
                        }}
                    >
                        <Check size={14} /> Bewaard — open in kistje
                    </Link>
                ) : (
                    <button
                        type="button"
                        onClick={() => onCommit(entry.id)}
                        disabled={entry.committing}
                        className="btn btn-brand"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            minHeight: 36,
                            opacity: entry.committing ? 0.5 : 1,
                            cursor: entry.committing ? 'wait' : 'pointer',
                        }}
                    >
                        {entry.committing ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> Opslaan…
                            </>
                        ) : (
                            <>
                                Bewaar in kistje <ArrowRight size={14} />
                            </>
                        )}
                    </button>
                )}
                <Link
                    href="/geld/boekhouder"
                    className="btn btn-ghost"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 36,
                    }}
                >
                    Naar boekhouder <ExternalLink size={14} />
                </Link>
                {entry.commitError && (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--red, #ef4444)',
                            alignSelf: 'center',
                        }}
                    >
                        {entry.commitError}
                    </span>
                )}
                {entry.archiefBonId && !entry.leverancierResolved && (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--amber, #f59e0b)',
                            alignSelf: 'center',
                        }}
                    >
                        Nog geen leverancier gekozen — de bon staat er wel al in.
                    </span>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div
                style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '.05em',
                    color: 'var(--muted)',
                    marginBottom: 2,
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
        </div>
    );
}

function Badge({ color, label }: { color: string; label: string }) {
    return (
        <span
            style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
}

/* ── ReconciliationBanner — flag mismatches uit Σ items vs totaal_bedrag ──
   Vier states (uit reconciliation.status):
     ok          → niets tonen (clean run)
     minor_drift → grijze regel onder ai_cost ("klein verschil €0.20, OK")
     mismatch    → rode banner met escalatie-knop
     no_total    → oranje banner (AI vond geen totaal_bedrag)

   Toont ook de pass-history: bv. "Gescand met Haiku → Sonnet (€0.025)".
   Klikbare "Probeer met Opus" knop als can_escalate=true. */
function ReconciliationBanner({
    entry,
    onEscalate,
}: {
    entry: CompletedExtract;
    onEscalate: () => void;
}) {
    const r = entry.result;
    const rec = r.reconciliation;
    const passes = r.ai_passes ?? [];
    const canEsc = r.can_escalate !== false;

    /* Geen reconciliation-data = oude flow / UBL. Toon alleen pass-history als die er is. */
    if (!rec) return null;

    /* OK + minor_drift: subtiele info-regel, geen banner. */
    if (rec.status === 'ok') {
        if (passes.length <= 1) return null;
        return (
            <div
                style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                }}
            >
                <Sparkles size={11} />
                <span>
                    Gescand via {passes.length} passes ({passes.map(p => p.engine).join(' → ')}) — totaal €
                    {(r.ai_cost_eur_cents / 100).toFixed(3)}
                </span>
            </div>
        );
    }

    /* minor_drift = oranje subtiel */
    if (rec.status === 'minor_drift') {
        return (
            <div
                style={{
                    padding: '8px 12px',
                    marginBottom: 12,
                    borderRadius: 8,
                    background: 'rgba(196,163,90,.06)',
                    border: '1px solid rgba(196,163,90,.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                }}
            >
                <AlertTriangle size={14} style={{ color: 'var(--brand-gold, #C4A35A)', flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--muted)' }}>{rec.explanation}</span>
            </div>
        );
    }

    /* mismatch + no_total = rode/oranje banner met escalatie-knop. */
    const isMismatch = rec.status === 'mismatch';
    const accentBg = isMismatch ? 'rgba(239,68,68,.06)' : 'rgba(249,115,22,.05)';
    const accentBorder = isMismatch ? 'rgba(239,68,68,.3)' : 'rgba(249,115,22,.25)';
    const accentColor = isMismatch ? 'var(--red, #ef4444)' : 'var(--orange, #f97316)';

    return (
        <div
            style={{
                padding: '12px 14px',
                marginBottom: 12,
                borderRadius: 10,
                background: accentBg,
                border: `1px solid ${accentBorder}`,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} style={{ color: accentColor, flexShrink: 0 }} />
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.08em',
                        color: accentColor,
                    }}
                >
                    {isMismatch ? 'Controleer regels' : 'Geen totaal gevonden'}
                </div>
                <div style={{ flex: 1 }} />
                {rec.claimed_total_eur != null && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                        Σ €{rec.sum_items_eur.toFixed(2)} vs totaal €{rec.claimed_total_eur.toFixed(2)}
                    </div>
                )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>{rec.explanation}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {canEsc && (
                    <button
                        type="button"
                        onClick={onEscalate}
                        disabled={entry.escalating}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            minHeight: 36,
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: accentColor,
                            color: 'var(--bg, #0f0f12)',
                            border: 'none',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: entry.escalating ? 'wait' : 'pointer',
                            opacity: entry.escalating ? 0.6 : 1,
                        }}
                    >
                        {entry.escalating ? (
                            <>
                                <Loader2 size={12} className="animate-spin" /> Opus is bezig…
                            </>
                        ) : (
                            <>
                                <Zap size={12} /> Probeer met Opus 4.7 (~€0.10)
                            </>
                        )}
                    </button>
                )}
                {!canEsc && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Opus 4.7 al geprobeerd — pas regels handmatig aan voor je bevestigt.
                    </span>
                )}
                {passes.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                        Passes: {passes.map(p => p.engine).join(' → ')}
                    </span>
                )}
            </div>
            {entry.escalateError && (
                <div style={{ fontSize: 11, color: 'var(--red, #ef4444)', marginTop: 6 }}>
                    {entry.escalateError}
                </div>
            )}
        </div>
    );
}

/* ── LeverancierStep — mens-blijft-de-baas leverancier-keuze ──────────────
   Vier states (uit extract response):

   1. auto_matched   → groene "Gekoppeld aan [naam]" badge, geen actie nodig.
   2. needs_approval → blauwe "AI denkt: [naam]" + lijst van similar
                       candidates uit Sam's eigen leveranciers + "Nieuwe maken"-knop.
   3. new_suggested  → oranje "Onbekende leverancier: [naam]" met
                       primary "Maak nieuwe leverancier aan" knop +
                       link "Of koppel aan bestaande…" voor edge cases.
   4. no_leverancier → rood "Geen leverancier gevonden" met handmatige input.

   Na keuze: groene confirm met "Wijzig" link om opnieuw te kiezen. */
function LeverancierStep({
    entry,
    onChoose,
    onChooseNew,
}: {
    entry: CompletedExtract;
    onChoose: (id: number, naam: string) => void;
    onChooseNew: (naam: string) => void;
}) {
    const r = entry.result;
    const state = r.leverancier_state ?? 'auto_matched';
    const candidates = r.leverancier_candidates ?? [];
    const aiNaam = r.bon_preview.leverancier_naam ?? '';
    const [newNaam, setNewNaam] = useState(aiNaam);
    const [showAlternatives, setShowAlternatives] = useState(false);

    // Sam heeft al gekozen — toon confirmatie met "Wijzig"-link
    if (entry.leverancierResolved) {
        const isNew = !!entry.chosenNewLeverancierNaam;
        const chosenName = isNew
            ? entry.chosenNewLeverancierNaam
            : candidates.find((c) => c.id === entry.chosenLeverancierId)?.naam ?? aiNaam;
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    marginBottom: 12,
                    borderRadius: 10,
                    background: 'rgba(34,197,94,.06)',
                    border: '1px solid rgba(34,197,94,.25)',
                }}
            >
                <Check size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {chosenName}
                        {isNew && (
                            <span
                                style={{
                                    marginLeft: 8,
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: 'rgba(255,191,0,.14)',
                                    color: 'var(--brand)',
                                    fontWeight: 700,
                                    letterSpacing: '.05em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                nieuw
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Leverancier {isNew ? 'wordt aangemaakt' : 'gekoppeld'} bij bevestigen
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        // Reset keuze door state te wijzigen — simpel via parent niet beschikbaar,
                        // dus laten we 'm "wijzigen" via showAlternatives toggle direct hieronder
                        setShowAlternatives(false);
                        // Forceer een re-open van de keuze-UI door leverancierResolved op false te zetten.
                        // Dit gebeurt via onChoose met -1, dat door commit-route zou worden geweigerd,
                        // dus beter: roep onChooseNew met lege string aan zou leverancier resetten.
                        // Voor simpliciteit: gebruik onChoose met 0 wat onhandig is. Beter: nieuwe handler.
                        // → Voor nu: laten we deze knop alleen tonen als entry.chosenLeverancierId is gezet
                        //   en navigeren naar de extractie-keuze opnieuw via window.location.
                        if (typeof window !== 'undefined') {
                            window.location.reload();
                        }
                    }}
                    style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        background: 'transparent',
                        textDecoration: 'underline',
                        textDecorationStyle: 'dotted',
                    }}
                    title="Reset keuze (vereist opnieuw scannen — gebruik nieuwe scan voor een andere bon)"
                >
                    Wijzig
                </button>
            </div>
        );
    }

    // State 4: no_leverancier — AI las geen naam
    if (state === 'no_leverancier') {
        return (
            <div
                style={{
                    padding: '12px 14px',
                    marginBottom: 12,
                    borderRadius: 10,
                    background: 'rgba(239,68,68,.05)',
                    border: '1px solid rgba(239,68,68,.25)',
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.08em',
                        color: 'var(--red)',
                        marginBottom: 6,
                    }}
                >
                    Leverancier ontbreekt
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    AI kon geen leveranciernaam vinden op deze bon. Vul handmatig in:
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        type="text"
                        value={newNaam}
                        onChange={(e) => setNewNaam(e.target.value)}
                        placeholder="Bijv. KitchenAid"
                        className="input"
                        style={{ flex: 1, fontSize: 13 }}
                    />
                    <button
                        type="button"
                        onClick={() => onChooseNew(newNaam)}
                        disabled={!newNaam.trim()}
                        className="btn btn-brand"
                        style={{
                            minHeight: 34,
                            opacity: !newNaam.trim() ? 0.5 : 1,
                            cursor: !newNaam.trim() ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Maak aan
                    </button>
                </div>
            </div>
        );
    }

    // State 2 & 3: needs_approval of new_suggested
    const isNewSuggested = state === 'new_suggested';
    const accentBg = isNewSuggested ? 'rgba(249,115,22,.05)' : 'rgba(59,130,246,.05)';
    const accentBorder = isNewSuggested
        ? 'rgba(249,115,22,.25)'
        : 'rgba(59,130,246,.25)';
    const accentColor = isNewSuggested ? 'var(--orange)' : 'var(--blue)';
    const eyebrowText = isNewSuggested
        ? 'Nieuwe leverancier?'
        : 'Geen exacte match — kies wat je wilt';

    return (
        <div
            style={{
                padding: '12px 14px',
                marginBottom: 12,
                borderRadius: 10,
                background: accentBg,
                border: `1px solid ${accentBorder}`,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.08em',
                        color: accentColor,
                    }}
                >
                    {eyebrowText}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    AI ziet:{' '}
                    <strong style={{ color: 'var(--text)' }}>{aiNaam || '—'}</strong>
                </div>
            </div>

            {/* Primary action: nieuwe leverancier aanmaken */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <input
                    type="text"
                    value={newNaam}
                    onChange={(e) => setNewNaam(e.target.value)}
                    placeholder="Naam nieuwe leverancier"
                    className="input"
                    style={{ flex: 1, fontSize: 13 }}
                />
                <button
                    type="button"
                    onClick={() => onChooseNew(newNaam)}
                    disabled={!newNaam.trim()}
                    className="btn btn-brand"
                    style={{
                        minHeight: 34,
                        opacity: !newNaam.trim() ? 0.5 : 1,
                        cursor: !newNaam.trim() ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                    }}
                >
                    <Check size={12} />
                    Maak nieuwe aan
                </button>
            </div>

            {/* Secondary: koppel aan bestaande */}
            {candidates.length > 0 ? (
                <div>
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            marginBottom: 6,
                        }}
                    >
                        Of koppel aan een bestaande:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {candidates.map((c) => (
                            <button
                                type="button"
                                key={c.id}
                                onClick={() => onChoose(c.id, c.naam)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 10px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'rgba(130,130,130,.06)',
                                    color: 'var(--text)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            >
                                {c.naam}
                                <span
                                    style={{
                                        fontSize: 9,
                                        padding: '1px 5px',
                                        borderRadius: 3,
                                        background:
                                            c.score >= 60
                                                ? 'rgba(34,197,94,.14)'
                                                : 'rgba(130,130,130,.12)',
                                        color:
                                            c.score >= 60
                                                ? 'var(--green)'
                                                : 'var(--muted)',
                                        fontFamily: 'var(--font-mono)',
                                    }}
                                >
                                    {c.score}%
                                </span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setShowAlternatives((v) => !v)}
                            style={{
                                fontSize: 11,
                                color: 'var(--muted)',
                                background: 'transparent',
                                padding: '6px 8px',
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted',
                            }}
                        >
                            {showAlternatives ? 'Verberg' : 'Andere…'}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Geen vergelijkbare leverancier in je archief. Maak hierboven een nieuwe aan.
                </div>
            )}
        </div>
    );
}
