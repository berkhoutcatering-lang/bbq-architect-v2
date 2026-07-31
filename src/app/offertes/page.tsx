'use client';
import './offerte-edit.css';
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { deleteOfferte as deleteOfferteAction } from '@/app/offertes/actions';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer, nextNummer, discountBaseExcl, formatMoneyInput, isDiscountLine, parseMoneyInput, priceExclFromIncl, priceInclFromExcl, recalculateDiscountLines, roundMoney } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import { buildBrandingConfig } from '@/lib/branding';
import { useOrg } from '@/lib/OrgContext';
import { useActiveResource } from '@/lib/ActiveResourceContext';
import { mailOfferte } from '@/lib/emailHelper';
import { logActivationEvent } from '@/lib/activation';
import { offertesToCsv, downloadCsv } from '@/lib/csvExport';
import { useFormValidation } from '@/hooks/useFormValidation';
import FieldError from '@/components/FieldError';
import OfferteMenuPicker, { type OfferteMenuPickerResult } from '@/components/menu/OfferteMenuPicker';
import MenuMenukaartCanvas, { type CanvasSaveResult } from '@/components/menu/MenuMenukaartCanvas';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import MarginDriftBanner from '@/app/offertes/_components/MarginDriftBanner';
import PageHint from '@/components/PageHint';
import FollowUpPrompt, { type FollowUpAction } from '@/components/FollowUpPrompt';
import SyncCascade, { type CascadeStep } from '@/components/SyncCascade';
import { runAcceptanceWorkflow } from '@/lib/acceptance-workflow';
import { mapOfferteToEventStatus, isOfferteAccepted } from '@/lib/statuses';
import { calcOfferteMarge } from '@/lib/costCalculations';
import { ArrowLeft, Link as LinkIcon, Plus, Trash2, Save, UtensilsCrossed, Mail, FileText, Copy, FileDown, Sparkles, Palette, ChefHat, Gauge, Fuel, List as ListIcon, UserRound, MoreHorizontal, ChevronDown, ChevronRight, Check, Info, CircleDollarSign, Receipt } from 'lucide-react';
import AiOfferteWizard from '@/components/AiOfferteWizard';
import { linkLeadToOfferte } from '@/app/verkoop/leads/actions';
import StatusBadge from '@/components/StatusBadge';
import StickyActionBar from '@/components/StickyActionBar';
import type { Offerte, Factuur, Gerecht, InventoryItem, Gang, MenuTemplateRow } from '@/types';

/* ── Offerte-bewerk UI-primitieven (nagebouwd uit Sam's design-zip) ──────────
   Lichtgewicht dropdown + BTW-picker. De rest van de kaart-layout staat inline
   in de edit-view; alleen deze twee hebben eigen open-state + outside-click. */
function useOffClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
    useEffect(function () {
        if (!active) return undefined;
        function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); }
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onOut(); }
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return function () { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
}

function OffDropdown({ trigger, children }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useOffClickOutside(ref, function () { setOpen(false); }, open);
    return (
        <div className="off-dd" ref={ref}>
            {trigger(open, function () { setOpen(function (o) { return !o; }); })}
            {open ? <div className="off-dd-menu" onClick={function () { setOpen(false); }}>{children}</div> : null}
        </div>
    );
}

/* Catering-BTW is in NL altijd 0 / 9 / 21 (0 = B2B reverse-charge, 9 = voeding,
   21 = service/alcohol). Compacte custom picker — native <select> mis-paint. */
const BTW_OPTIONS = [0, 9, 21];
function OffBtwSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useOffClickOutside(ref, function () { setOpen(false); }, open);
    return (
        <div className="off-btw" ref={ref}>
            <button type="button" className="off-btw-btn" onClick={function () { setOpen(function (o) { return !o; }); }} aria-haspopup="listbox" aria-expanded={open}>
                {value}% <ChevronDown size={13} color="var(--muted)" />
            </button>
            {open ? (
                <div className="off-btw-menu">
                    {BTW_OPTIONS.map(function (b) {
                        return (
                            <button type="button" key={b} className="off-btw-item" onClick={function () { onChange(b); setOpen(false); }}>
                                {b}%
                                {b === value ? <Check size={13} color="var(--accent-gold-text)" style={{ marginLeft: 'auto' }} /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/* Status-meta voor de kopbalk-dropdown — alle 6 offerte-statussen (de design-zip
   toonde er 3; we behouden de volledige set zodat geen functionaliteit verdwijnt). */
const STATUS_META: Record<string, { label: string; dot: string }> = {
    concept: { label: 'Concept', dot: 'var(--muted-weak)' },
    verzonden: { label: 'Verzonden', dot: 'var(--blue)' },
    geaccepteerd: { label: 'Geaccepteerd', dot: 'var(--green)' },
    afgewezen: { label: 'Afgewezen', dot: 'var(--red)' },
    verlopen: { label: 'Verlopen', dot: 'var(--amber)' },
    geannuleerd: { label: 'Geannuleerd', dot: 'var(--muted)' },
};
const STATUS_ORDER = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen', 'geannuleerd'];

/* localStorage key matchend met AiOfferteWizard's DRAFT_KEY. Wordt door de
   wizard automatisch ingelezen wanneer `open` true wordt — zo kunnen we
   prefill-data via een query-param doorgeven zonder de wizard te wijzigen. */
const AI_WIZARD_DRAFT_KEY = 'bbq_ai_offerte_wizard_draft';

/* Demo-seed event dat we als prefill gebruiken wanneer de gebruiker vanuit
   /onboarding stap 3 hier landt met `?wizard=true&seedEvent=demo`. Generiek
   gehouden — geen echte klantnaam, zodat elke nieuwe BBQ Architect-tenant
   dezelfde "klassieke" demo-ervaring krijgt zonder verwijzing naar Hop & Bites'
   eigen klantenlijst. Pillar #1 Hub 1: ≤10 min naar eerste offerte. */
const DEMO_SEED_PREFILL = {
    clientName: 'Voorbeeld Bedrijf',
    clientAddress: 'Demolaan 1, Voorbeeldstad',
    eventDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 28);
        return d.toISOString().slice(0, 10);
    })(),
    gasten: 60,
    vegaCount: 5,
    gangen: '3',
    prompt: 'Bedrijfsfeest met BBQ-buffet voor 60 personen. Mix van pulled pork en vegetarische opties.',
    savedAt: Date.now(),
};

export default function Offertes() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { data: offertes, insert, update, remove, refetch: loadOffertes } = useSupabase<Offerte>('offertes', []);
    const facturen = useSupabase<Factuur>('facturen', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: gangenData } = useSupabase<Gang>('gangen', []);
    const { data: menuTemplatesData } = useSupabase<MenuTemplateRow>('menu_templates', []);
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const { settings } = useSettings();
    const { orgId } = useOrg();
    const { active } = useActiveResource();
    // Actief event → gasten + prijs p.p. ophalen, zodat een offerte die vanuit een
    // event wordt gemaakt die overneemt (regel + marge kloppen dan meteen). De pill
    // draagt alleen id + tekst, dus we halen de echte getallen op.
    const [activeEventData, setActiveEventData] = useState<{ guests: number; ppp: number } | null>(null);
    useEffect(function () {
        const aid = active && active.kind === 'event' ? parseInt(String(active.id), 10) : NaN;
        if (isNaN(aid)) { setActiveEventData(null); return; }
        let cancelled = false;
        supabase.from('events').select('guests, ppp').eq('id', aid).maybeSingle().then(function (r) {
            if (!cancelled && r.data) setActiveEventData({ guests: Number(r.data.guests) || 0, ppp: Number(r.data.ppp) || 0 });
        });
        return function () { cancelled = true; };
    }, [active]);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [showWizard, setShowWizard] = useState(false);
    const [showAiWizard, setShowAiWizard] = useState(false);
    const [showCanvas, setShowCanvas] = useState(false);
    /* Template-picker: "Nieuwe offerte" opent eerst een keuze tussen handmatig,
       vanaf nul met wizard, of starten met een opgeslagen menu uit /gerechten. */
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
    const [prefillFromTemplate, setPrefillFromTemplate] = useState<any | null>(null);
    const [vasteOpen, setVasteOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('alle');
    const [sortField, setSortField] = useState<string>('datum');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [priceModeByRow, setPriceModeByRow] = useState<Record<number, 'excl' | 'incl'>>({});
    const [moneyDraftByCell, setMoneyDraftByCell] = useState<Record<string, string>>({});
    const { errors, validateField, validateAll, clearError, fieldProps } = useFormValidation({
        client_naam: [{ required: 'Vul een klantnaam in' }],
        datum: [{ required: 'Vul een datum in' }],
        items: [{ custom: function (v: unknown) { return (!v || (Array.isArray(v) && v.length === 0)) ? 'Voeg minstens één regel toe' : null; } }],
    });
    const [followUpActions, setFollowUpActions] = useState<FollowUpAction[] | null>(null);
    const [followUpTitle, setFollowUpTitle] = useState('');
    const [cascadeSteps, setCascadeSteps] = useState<CascadeStep[] | null>(null);

    /* Hub 1 → Hub 2 handoff: open de AI-wizard direct als de URL `?wizard=true`
       bevat. Bij `&seedEvent=demo` schrijven we eerst een prefill-draft naar
       localStorage zodat de wizard die meeneemt. Daarna URL schoon-replacen
       zodat refresh/back niet opnieuw triggert. */
    useEffect(() => {
        const wantsWizard = searchParams?.get('wizard') === 'true';
        if (!wantsWizard) return;
        const seedEvent = searchParams?.get('seedEvent');
        if (seedEvent === 'demo') {
            try {
                localStorage.setItem(
                    AI_WIZARD_DRAFT_KEY,
                    JSON.stringify({ ...DEMO_SEED_PREFILL, savedAt: Date.now() }),
                );
            } catch { /* private mode / full disk — wizard valt gewoon terug op defaults */ }
        }
        setShowAiWizard(true);
        router.replace('/offertes');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function calcOfferteMargeData(offerte: Offerte | Record<string, unknown>) {
        try {
            /* Helper-signature gebruikt `Record<string, any>` om legacy en
               geserialiseerde-shapes van offerte te accepteren. Onze typed
               `Offerte` is structureel een superset; cast naar de helper-input
               houdt runtime gedrag intact. gerechtenData / inventoryData zijn
               structural-compatible met GerechtForCost[] / InventoryLookup[]. */
            return calcOfferteMarge(offerte as Record<string, unknown>, gerechtenData, inventoryData);
        } catch (e) {
            console.error('[MARGE] calcOfferteMargeData error:', e);
            return { gasten: 0, prijsPP: 38.50, omzet: 0, foodcostPP: 0, foodcostTotaal: 0, vasteKosten: 0, nettoWinst: 0, margePct: 0 };
        }
    }

    /* Marge per offerte caching — voorkomt dat we ingredient_costs door-rekenen
       op elke render. Re-computed alleen als offertes / gerechten / inventory
       écht veranderen. Belangrijk voor lijst met 50+ offertes. */
    const margeMap = useMemo(function () {
        const map: Record<string, ReturnType<typeof calcOfferteMargeData>> = {};
        offertes.forEach(function (o) { map[String(o.id)] = calcOfferteMargeData(o); });
        return map;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [offertes, gerechtenData, inventoryData]);
    function margeColor(pct: number) { return pct > 70 ? 'green' : pct >= 60 ? 'orange' : 'red'; }
    function margeLabel(pct: number) { return pct > 70 ? 'Sterk' : pct >= 60 ? 'Aandacht' : 'Lage marge'; }
    function margeEmoji(pct: number) { return pct > 70 ? '🟢' : pct >= 60 ? '🟡' : '🔴'; }
    /* Zonder foodcost is een marge-% betekenisloos: (omzet − 0)/omzet = 100% zou
       ten onrechte "Sterk" tonen. Alleen oordelen als er écht een kostprijs is. */
    function margeCostKnown(m: { foodcostTotaal?: number }) { return (m.foodcostTotaal || 0) > 0; }

    /* Sinds 2026-06-02: OfferteMenuPicker vervangt MenuWizard. De picker geeft
       alleen de gerechten-selectie (menu_selectie + template_naam) — een menukaart
       houdt bewust GEEN prijs of aantal gasten vast. Die vult de cateraar hier in
       de offerte-regel in: qty = aantal couverts, prijs = prijs p.p. → totaal rolt. */
    function buildBasisItem(template_naam: string) {
        return {
            desc: template_naam,
            qty: 1,
            prijs: 0,
            btw: settings?.default_btw ?? 21,
        };
    }

    function handleWizardComplete(result: OfferteMenuPickerResult) {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.map((o) => o.nummer));
        setShowWizard(false);
        setPrefillFromTemplate(null);
        setPriceModeByRow({});
        setMoneyDraftByCell({});
        setEditing('new');
        // Kwam de offerte vanuit een event? Neem gasten + prijs p.p. over — dan
        // klopt de offerteregel (gasten × prijs) én de marge meteen, i.p.v. €38,50
        // voor 1 persoon. Anders leeg (cateraar vult zelf in).
        const g = activeEventData?.guests || 0;
        const p = activeEventData?.ppp || 0;
        const fromEvent = g > 0 && p > 0;
        const basisItem = fromEvent
            ? { desc: result.template_naam, qty: g, prijs: p, btw: settings?.default_btw ?? 21 }
            : buildBasisItem(result.template_naam);
        setForm(Object.assign({
            nummer: nummer,
            status: 'concept',
            client_naam: '',
            client_adres: '',
            client_email: '',
            datum: today(),
            geldig_tot: addDays(today(), geldigDagen),
            notitie: result.template_naam,
            items: [basisItem],
            menu_selectie: result.menu_selectie,
        }, fromEvent ? { aantal_gasten: g, basis_prijs_pp: p } : {}));
        showToast(fromEvent
            ? `Menukaart toegepast — ${g} gasten × €${p} p.p. overgenomen van je event.`
            : 'Menukaart toegepast! Vul prijs, gasten en klantgegevens aan.', 'info');
    }

    /* De geünificeerde canva levert menu-keuze + menukaart-styling in één keer.
       Schrijf naar de form; saveOfferte persisteert menu_selectie +
       menukaart_template_id + menukaart_overrides. Prijs/gasten/regels blijven
       intact — die vult de cateraar in de offerte-regel (min input, max output). */
    function handleCanvasSave(result: CanvasSaveResult) {
        setShowCanvas(false);
        setForm(Object.assign({}, form, {
            menu_selectie: result.menuSelectie,
            menukaart_template_id: result.templateId,
            menukaart_overrides: result.customOverrides,
        }));
        showToast('Menu & menukaart bijgewerkt! Klik Opslaan om door te voeren.', 'info');
    }

    function newOfferte() {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.map((o) => o.nummer));
        setPriceModeByRow({});
        setMoneyDraftByCell({});
        setEditing('new');
        // Vanuit een event? Neem gasten + prijs p.p. over (zie handleWizardComplete).
        const g = activeEventData?.guests || 0;
        const p = activeEventData?.ppp || 0;
        const fromEvent = g > 0 && p > 0;
        setForm(Object.assign({
            nummer: nummer, status: 'concept', client_naam: '', client_adres: '', client_email: '',
            datum: today(), geldig_tot: addDays(today(), geldigDagen), notitie: '',
            items: [{ desc: '', qty: fromEvent ? g : 1, prijs: fromEvent ? p : 0, btw: settings?.default_btw ?? 21 }],
        }, fromEvent ? { aantal_gasten: g, basis_prijs_pp: p } : {}));
    }

    /* Template-picker logica — "Nieuwe offerte" opent een keuze.
       Templates komen uit menu_templates op /gerechten. */
    async function openTemplatePicker() {
        const { data, error } = await supabase
            .from('menu_templates')
            .select('id, naam, beschrijving, menu_selectie, basis_prijs_pp, aantal_gasten, is_default')
            .eq('actief', true)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false });
        if (!error && data) {
            setAvailableTemplates(data);
        } else {
            setAvailableTemplates([]);
        }
        setShowTemplatePicker(true);
    }

    function newOfferteFromWizardBlank() {
        /* "Vanaf nul" opent de picker zonder voorkeuze — cateraar kiest zelf
           welke menukaart eruit komt. Geen samenstel-wizard meer. */
        setPrefillFromTemplate(null);
        setShowTemplatePicker(false);
        setShowWizard(true);
    }

    function newOfferteFromTemplate(t: { id: number }) {
        /* Picker krijgt de template-id mee; selectie + uitvinken gebeurt in
           de picker zelf. handleWizardComplete bouwt daarna de offerte. */
        setPrefillFromTemplate({ templateId: t.id });
        setShowTemplatePicker(false);
        setShowWizard(true);
    }

    function newOfferteHandmatig() {
        setShowTemplatePicker(false);
        newOfferte();
    }

    function editOfferte(o: Offerte) { setPriceModeByRow({}); setMoneyDraftByCell({}); setEditing(o.id); setForm(JSON.parse(JSON.stringify(o))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }
    function setItems(items: Array<Record<string, any>>) {
        setField('items', recalculateDiscountLines(items));
    }

    async function syncQuoteToEvent(quoteId: number | string, quoteData: Record<string, any>): Promise<number | null> {
        if (!quoteId) return null;

        const qid = parseInt(String(quoteId), 10);
        if (isNaN(qid)) return null;

        let totalBedrag = 0;
        let estimatedGuests = quoteData.aantal_gasten || 0;
        (quoteData.items || []).forEach(function (item) {
            totalBedrag += (item.qty || 0) * (item.prijs || 0);
            if (!estimatedGuests && (item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
        });
        const ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;

        /* Canonical mapping via src/lib/statuses.ts — handelt aliases
           (akkoord/goedgekeurd → geaccepteerd, geannuleerd → afgewezen)
           en orphan-cleanup ('DELETE') uniform af. */
        const syncAction = mapOfferteToEventStatus(quoteData.status);
        if (syncAction === null) {
            /* Status niet relevant voor event-sync (bv. onbekende legacy waarde). */
            return null;
        }
        const eventStatus: string = syncAction === 'DELETE' ? '__DELETE__' : syncAction;

        try {
            const res = await supabase.from('events').select('id, status, name').eq('offerte_id', qid);
            if (res.error) {
                console.error('[SYNC] Query failed:', res.error.message);
                showToast('Sync fout: ' + res.error.message, 'error');
                return null;
            }

            const rows = res.data || [];

            // Clean duplicates
            if (rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    await supabase.from('events').delete().eq('id', rows[i].id);
                }
            }

            const existing = rows.length > 0 ? rows[0] : null;

            // Delete event if offerte rejected/expired
            if (eventStatus === '__DELETE__') {
                if (existing) {
                    await supabase.from('events').delete().eq('offerte_id', qid);
                    showToast('🗑️ Optie verwijderd uit Agenda', 'info');
                }
                return null;
            }

            const payload: Record<string, any> = {
                name: 'Offerte: ' + (quoteData.client_naam || quoteData.nummer || 'Onbekend'),
                date: quoteData.datum || new Date().toISOString().slice(0, 10),
                guests: estimatedGuests || 50,
                ppp: Math.round(ppp * 100) / 100,
                location: quoteData.client_adres || '',
                client_naam: quoteData.client_naam || '',
                client_adres: quoteData.client_adres || '',
                status: eventStatus,
                notitie: quoteData.notitie || ''
            };

            if (existing) {
                const u = await supabase.from('events').update(payload).eq('id', existing.id).select();
                if (u.error) {
                    console.error('[SYNC] Update FAILED:', u.error.message);
                    showToast('Sync fout bij update: ' + u.error.message, 'error');
                    return existing.id;
                }
                const msg = eventStatus === 'confirmed'
                    ? '✅ Agenda gesynchroniseerd — Event bevestigd!'
                    : '📅 Agenda gesynchroniseerd met Offerte';
                showToast(msg, 'success');
                return existing.id;
            } else {
                // RLS: de events-tabel heeft geen org-default/trigger, dus een insert
                // MOET organization_id expliciet meesturen (anders schendt 'ie de policy).
                if (!orgId) {
                    showToast('Sync fout: organisatie nog niet geladen — probeer opnieuw', 'error');
                    return null;
                }
                // Kwam deze offerte vanuit een event (actieve resource)? Koppel 'm dan
                // aan DÁT event i.p.v. een duplicaat te maken — mits dat event nog niet
                // aan een andere offerte hangt. Naam/gasten/prijs van het event laten we
                // staan: het event is de bron van waarheid. "Eén event, één offerte."
                if (active && active.kind === 'event') {
                    const aid = parseInt(String(active.id), 10);
                    if (!isNaN(aid)) {
                        const { data: ev } = await supabase.from('events').select('id, offerte_id').eq('id', aid).maybeSingle();
                        if (ev && (ev.offerte_id == null || ev.offerte_id === qid)) {
                            const u = await supabase.from('events').update({ offerte_id: qid, status: eventStatus }).eq('id', aid).select();
                            if (!u.error) {
                                showToast('📅 Offerte gekoppeld aan je event', 'success');
                                return aid;
                            }
                            console.error('[SYNC] Adopt event FAILED:', u.error.message);
                            // val terug op een nieuw event hieronder
                        }
                    }
                }
                payload.offerte_id = qid;
                payload.type = 'Zakelijk';
                payload.menu = [];
                payload.organization_id = orgId;
                const ins = await supabase.from('events').insert(payload).select();
                if (ins.error) {
                    console.error('[SYNC] Insert FAILED:', ins.error.message);
                    showToast('Sync fout bij insert: ' + ins.error.message, 'error');
                    return null;
                }
                const newEventId = ins.data && ins.data[0] ? ins.data[0].id : null;
                showToast('📅 Agenda gesynchroniseerd — Optie toegevoegd!', 'success');
                return newEventId;
            }
        } catch (e) {
            console.error('[SYNC] Error:', e);
            showToast('Sync fout: kon events niet ophalen', 'error');
            return null;
        }
    }

    async function triggerWorkflowIfAccepted(eventId: number | null, formData: Record<string, any>) {
        /* Canonical accept-check via statuses.ts — accepteert ook legacy
           aliases 'akkoord' en 'goedgekeurd'. */
        if (!isOfferteAccepted(formData.status) || !eventId) return;

        // Show SyncCascade visual feedback
        setCascadeSteps([
            { id: 'accept', label: 'Offerte geaccepteerd', status: 'completed' },
            { id: 'event', label: 'Event bijgewerkt → Bevestigd', status: 'in_progress' },
            { id: 'factuur', label: 'Factuur aanmaken', status: 'pending' },
            { id: 'prep', label: 'Prep-taken inplannen', status: 'pending' },
            { id: 'inkoop', label: 'Inkooplijst genereren', status: 'pending' },
            { id: 'courses', label: 'Service-gangen aanmaken', status: 'pending' },
        ]);

        try {
            const result = await runAcceptanceWorkflow({
                eventId: eventId,
                offerteId: typeof formData.id === 'number' ? formData.id : undefined,
                offerteData: formData,
                settings: settings,
                facturenCount: facturen.data.length,
                facturenNummers: facturen.data.map((f) => f.nummer)
            });

            /* Deep-links naar de NET aangemaakte entiteiten — niet generiek
               /facturen maar /facturen?focus=<id>, niet /events maar
               /events/<id>/hub. Dit is het "wat-is-net-gemaakt"-weefsel:
               de operator springt direct naar wat de workflow zojuist maakte. */
            const factuurHref = result.factuur.factuurId
                ? `/facturen?focus=${result.factuur.factuurId}`
                : '/facturen';
            const eventHref = eventId ? `/events/${eventId}/hub` : '/events';

            // Update cascade steps progressively
            setCascadeSteps(function (prev) {
                if (!prev) return prev;
                return prev.map(function (s) {
                    if (s.id === 'event') return { ...s, status: 'completed' as const, href: eventHref };
                    if (s.id === 'factuur') return { ...s, status: result.factuur.success ? 'completed' as const : 'error' as const, detail: result.factuur.message, href: factuurHref };
                    if (s.id === 'prep') return { ...s, status: result.prep.success ? 'completed' as const : 'error' as const, detail: result.prep.message, href: eventHref };
                    if (s.id === 'inkoop') return { ...s, status: result.inkoop.success ? 'completed' as const : 'error' as const, detail: result.inkoop.message, href: '/inkoop' };
                    if (s.id === 'courses') return { ...s, status: result.courses.success ? 'completed' as const : 'error' as const, detail: result.courses.message, href: eventHref };
                    return s;
                });
            });

            /* Toast met directe deep-link naar de nieuwe factuur — meteen zichtbaar,
               niet pas na de 3s-cascade. */
            if (result.factuur.success && result.factuur.factuurId) {
                const fNum = /aangemaakt/i.test(result.factuur.message)
                    ? result.factuur.message.replace(/^Factuur\s*/i, '').replace(/\s*aangemaakt.*$/i, '')
                    : '';
                showToast('✓ Factuur ' + (fNum ? fNum + ' ' : '') + 'aangemaakt — open via de groene knop', 'success');
            }

            // Also show follow-up prompt after cascade — met SPECIFIEKE deep-links
            setTimeout(function () {
                setFollowUpTitle('Offerte geaccepteerd!');
                setFollowUpActions([
                    { icon: '🧾', label: 'Factuur bekijken', href: factuurHref },
                    { icon: '📅', label: 'Event openen', href: eventHref },
                    { icon: '📋', label: 'Prep-taken bekijken', href: eventHref },
                    { icon: '📧', label: 'Stuur bevestiging', onClick: function () { if (formData.client_email) { showToast('Bevestiging verstuurd', 'success'); } } },
                ]);
            }, 3000);
        } catch (e) {
            console.error('[SAVE] Workflow error:', e);
            showToast('Workflow fout: ' + (e.message || ''), 'error');
            setCascadeSteps(function (prev) {
                if (!prev) return prev;
                return prev.map(function (s) { return s.status === 'pending' || s.status === 'in_progress' ? { ...s, status: 'error' as const } : s; });
            });
        }
    }

    function validateOfferte(): boolean {
        return validateAll({ client_naam: form!.client_naam, datum: form!.datum, items: form!.items });
    }

    async function saveOfferte() {
        if (!validateOfferte()) return;

        try {
            const formToSave = Object.assign({}, form, { items: recalculateDiscountLines(form!.items || []) });
            let quoteId: number | string | null = null;

            if (editing === 'new') {
                const insertedRow: any = await insert(formToSave);
                showToast('Offerte aangemaakt', 'success');

                quoteId = insertedRow && insertedRow.id ? insertedRow.id : null;
                if (!quoteId) {
                    const lookup: any = await supabase.from('offertes').select('id').eq('nummer', formToSave.nummer).order('id', { ascending: false }).limit(1);
                    if (lookup.data && lookup.data.length > 0) {
                        quoteId = lookup.data[0].id;
                    }
                }
            } else {
                const { id, created_at, ...rest } = formToSave;
                await update(editing as number, rest);
                showToast('Offerte bijgewerkt', 'success');
                quoteId = editing as number;
            }

            // Sync to event and get event_id back
            const eventId = quoteId ? await syncQuoteToEvent(quoteId, formToSave) : null;

            // Trigger acceptance workflow if status warrants it
            await triggerWorkflowIfAccepted(eventId, formToSave);

            setEditing(null); setForm(null);
        } catch (err) {
            console.error('[SAVE] Error:', err);
            showToast('Fout bij opslaan: ' + (err.message || ''), 'error');
        }
    }

    function duplicateOfferte(o: Record<string, any>) {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.map((o) => o.nummer));
        const copy = JSON.parse(JSON.stringify(o));
        delete copy.id;
        delete copy.created_at;
        copy.nummer = nummer;
        copy.status = 'concept';
        copy.datum = today();
        copy.geldig_tot = addDays(today(), geldigDagen);
        setPriceModeByRow({});
        setMoneyDraftByCell({});
        setEditing('new');
        setForm(copy);
        showToast('Offerte gedupliceerd — pas details aan en sla op', 'info');
    }

    function deleteOfferte() {
        showConfirm('Weet je zeker dat je deze offerte wilt verwijderen?', async function () {
            /* P0.14 — Server Action met Zod + re-auth (OWASP A01 mitigatie).
               Vervangt directe Client-supabase delete. Event-koppeling
               (gekoppelde events bij offerte) blijft Client-side want dat
               is een aparte cleanup-stap die geen Zod-validatie vereist. */
            await supabase.from('events').delete().eq('offerte_id', editing).then(function (res) {
                if (res.error) console.error('[DELETE] Event delete error:', res.error);
            });
            const result = await deleteOfferteAction(editing as number);
            if ('error' in result) {
                showToast('Fout bij verwijderen: ' + result.error, 'error');
                return;
            }
            showToast('Offerte verwijderd', 'success');
            setEditing(null);
            setForm(null);
        });
    }

    async function convertToFactuur() {
        const betaaltermijn = (settings && settings.betaaltermijn) || 14;
        const factuurNum = nextNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.data.map((f) => f.nummer));
        const factuurData = {
            nummer: factuurNum,
            status: 'concept' as const,
            client_naam: form!.client_naam,
            client_adres: form!.client_adres,
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: recalculateDiscountLines(form!.items || [])
        };
        await facturen.insert(factuurData);
        const { id, created_at, ...rest } = Object.assign({}, form, { status: 'geaccepteerd' as const });
        await update(editing as number, rest);
        showToast('Factuur aangemaakt vanuit offerte', 'success');
        const eventId = await syncQuoteToEvent(editing as number, Object.assign({}, form, { status: 'geaccepteerd' }));
        // Trigger remaining workflow tasks (prep, inkoop, haccp) — factuur already created manually
        if (eventId) {
            await triggerWorkflowIfAccepted(eventId, Object.assign({}, form, { status: 'geaccepteerd' }));
        }
        setEditing(null); setForm(null);
    }

    function addItem() { setItems((form!.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: settings?.default_btw ?? 21 }])); }
    function addDiscountItem() {
        setItems((form!.items || []).concat([{ desc: 'Korting', qty: 1, prijs: 0, btw: 0, type: 'discount', discount_type: 'amount', discount_value: 0 }]));
    }
    function updateItem(idx: number, key: string, val: any) {
        const items = form!.items.map(function (item, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setItems(items);
    }
    function updateDiscountKind(idx: number, kind: 'amount' | 'percent') {
        const item = form!.items[idx] || {};
        const base = discountBaseExcl(form!.items || []);
        const currentAmount = Math.abs(Number(item.prijs) || 0);
        const nextValue = kind === 'percent' ? (base > 0 ? roundMoney(currentAmount / base * 100) : 0) : currentAmount;
        const items = form!.items.map(function (it, i: number) {
            return i === idx ? Object.assign({}, it, { discount_type: kind, discount_value: nextValue, btw: 0, qty: 1 }) : it;
        });
        setItems(items);
    }
    function updateDiscountValue(idx: number, val: string) {
        const items = form!.items.map(function (item, i: number) {
            return i === idx ? Object.assign({}, item, { discount_value: Math.abs(parseMoneyInput(val)), qty: 1, btw: 0 }) : item;
        });
        setItems(items);
    }
    function moneyCellKey(idx: number, kind: 'excl' | 'incl') { return idx + ':' + kind; }
    function moneyCellValue(idx: number, kind: 'excl' | 'incl', fallback: number) {
        const key = moneyCellKey(idx, kind);
        return Object.prototype.hasOwnProperty.call(moneyDraftByCell, key) ? moneyDraftByCell[key] : formatMoneyInput(fallback);
    }
    function setMoneyCellDraft(idx: number, kind: 'excl' | 'incl', value: string) {
        const key = moneyCellKey(idx, kind);
        setMoneyDraftByCell(function (m) { return Object.assign({}, m, { [key]: value }); });
    }
    function clearMoneyCellDraft(idx: number, kind: 'excl' | 'incl') {
        const key = moneyCellKey(idx, kind);
        setMoneyDraftByCell(function (m) {
            if (!Object.prototype.hasOwnProperty.call(m, key)) return m;
            const next = Object.assign({}, m);
            delete next[key];
            return next;
        });
    }
    function updateItemPriceExcl(idx: number, val: string) {
        setPriceModeByRow(function (m) { return Object.assign({}, m, { [idx]: 'excl' as const }); });
        updateItem(idx, 'prijs', roundMoney(parseMoneyInput(val)));
    }
    function updateItemPriceIncl(idx: number, val: string) {
        const item = form!.items[idx] || {};
        setPriceModeByRow(function (m) { return Object.assign({}, m, { [idx]: 'incl' as const }); });
        updateItem(idx, 'prijs', priceExclFromIncl(val, Number(item.btw) || 0, 6));
    }
    function updateItemBtw(idx: number, nextBtw: number) {
        const item = form!.items[idx] || {};
        if (priceModeByRow[idx] === 'incl') {
            const incl = priceInclFromExcl(Number(item.prijs) || 0, Number(item.btw) || 0);
            const items = form!.items.map(function (it, i: number) {
                return i === idx ? Object.assign({}, it, { btw: nextBtw, prijs: priceExclFromIncl(incl, nextBtw, 6) }) : it;
            });
            setItems(items);
            return;
        }
        updateItem(idx, 'btw', nextBtw);
    }
    function removeItem(idx: number) {
        setItems(form!.items.filter(function (_, i: number) { return i !== idx; }));
        setMoneyDraftByCell({});
        setPriceModeByRow(function (m) {
            const next: Record<number, 'excl' | 'incl'> = {};
            Object.keys(m).forEach(function (key) {
                const n = Number(key);
                if (n < idx) next[n] = m[n];
                if (n > idx) next[n - 1] = m[n];
            });
            return next;
        });
    }

    function downloadOfferte() {
        const normalizedForm = Object.assign({}, form, { items: recalculateDiscountLines(form!.items || []) });
        const totals = calcLineTotals(normalizedForm.items);
        const branding = buildBrandingConfig(settings);
        generatePDF({ type: 'offerte', form: normalizedForm, settings: settings, totals: totals, branding: branding, orgId: orgId || undefined });
    }
    if (editing !== null && form) {
        const totals = calcLineTotals(form.items);

        /* BTW gegroepeerd per tarief — voor de totalen-weergave. Grand total
           blijft calcLineTotals.totaal zodat PDF/portaal exact gelijk lopen. */
        const btwGroups: Record<number, number> = {};
        (form.items || []).forEach(function (it: { qty?: number; prijs?: number; btw?: number; type?: string }) {
            if (isDiscountLine(it)) return;
            const rate = Number(it.btw) || 0;
            btwGroups[rate] = (btwGroups[rate] || 0) + (Number(it.qty) || 0) * (Number(it.prijs) || 0) * rate / 100;
        });
        const btwRates = Object.keys(btwGroups).map(Number).filter(function (r) { return btwGroups[r] > 0.0001; }).sort(function (a, b) { return a - b; });

        /* Marge — read-only, NOOIT AI-afgeleid (hard rule). Zelfde calc als de lijst. */
        const marge = calcOfferteMargeData(form);
        const costKnown = margeCostKnown(marge);
        const margeKey = margeColor(marge.margePct);
        const margeHex = !costKnown ? 'var(--muted)' : margeKey === 'green' ? 'var(--green)' : margeKey === 'orange' ? 'var(--amber)' : 'var(--red)';

        /* Menu-lijst afgeleid uit menu_selectie + gangen-volgorde — exact dezelfde
           bron als de canva, PDF en portaal (één pipeline, geen notitie-rommel). */
        const gangArr = gangenData as Array<{ slug?: string; naam?: string; volgorde?: number }>;
        const gangNaam = function (slug: string) { const g = gangArr.find(function (x) { return x.slug === slug; }); return (g && g.naam) || slug.replace(/_/g, ' '); };
        const gangVolgorde = function (slug: string) { const g = gangArr.find(function (x) { return x.slug === slug; }); return (g && typeof g.volgorde === 'number') ? g.volgorde : 999; };
        const menuSelObj = (form.menu_selectie && typeof form.menu_selectie === 'object' && !Array.isArray(form.menu_selectie)) ? (form.menu_selectie as Record<string, string[]>) : null;
        const menuList: Array<{ n: string; t: string }> = [];
        if (menuSelObj) {
            Object.entries(menuSelObj)
                .filter(function (e) { return Array.isArray(e[1]) && e[1].length > 0; })
                .sort(function (a, b) { return gangVolgorde(a[0]) - gangVolgorde(b[0]); })
                .forEach(function (e) { (e[1] as string[]).forEach(function (naam) { menuList.push({ n: naam, t: gangNaam(e[0]) }); }); });
        }

        /* Vaste kosten — inline editen (min input): geen los invoer-veld meer. */
        const vasteKosten: Array<{ naam?: string; bedrag?: number | string }> = form.vaste_kosten || [];
        const vasteTotaal = vasteKosten.reduce(function (s, k) { return s + (parseFloat(String(k.bedrag)) || 0); }, 0);
        const updateVaste = function (idx: number, key: string, val: unknown) { const arr = vasteKosten.slice(); arr[idx] = Object.assign({}, arr[idx], { [key]: val }); setField('vaste_kosten', arr); };
        const addVaste = function () { setField('vaste_kosten', vasteKosten.concat([{ naam: '', bedrag: 0 }])); if (!vasteOpen) setVasteOpen(true); };
        const removeVaste = function (idx: number) { const arr = vasteKosten.slice(); arr.splice(idx, 1); setField('vaste_kosten', arr); };

        const isNew = editing === 'new';
        const statusMeta = STATUS_META[form.status] || STATUS_META.concept;
        const ctxLabel = form.nummer ? `${form.nummer} · ${form.client_naam || 'Geen klant'}` : 'Nieuwe offerte';

        async function handleMail() {
            const res = await mailOfferte(form, settings?.bedrijfsnaam || 'Hop & Bites');
            showToast(res.fallback ? 'Mailto geopend — stel RESEND_API_KEY in .env in voor directe verzending' : res.success ? 'Offerte verstuurd!' : 'Fout: ' + res.error, res.success ? 'success' : 'error');
            if (res.success && !res.fallback && form?.id && form?.status !== 'verzonden') {
                const hadEerdere = (offertes || []).some(function (o) { return o.status === 'verzonden' && o.id !== form.id; });
                await update(form.id, { status: 'verzonden' });
                if (!hadEerdere && orgId) { logActivationEvent(orgId, 'first_quote_sent', { offerte_id: form.id }); }
            }
        }
        function copyKlantLink() {
            /* KRITIEK: de portal /q/[id] zoekt op public_token, NIET op offerte.id.
               Een link met de integer-id geeft 404 bij de klant. public_token is een
               UUID (DB-default gen_random_uuid) en zit in het geladen form-object. */
            const token = (form as { public_token?: string }).public_token;
            if (!token) { showToast('Sla de offerte eerst op om een klant-link te maken', 'error'); return; }
            navigator.clipboard.writeText(window.location.origin + '/q/' + token);
            showToast('Klant-link gekopieerd! Plak deze in een mail of WhatsApp.', 'success');
        }

        return (
            <div className="hopbites-theme off-page">
                <div className="off-wrap">
                    {/* ── Kopbalk: nummer + status-dropdown + "..."-acties + terug ── */}
                    <header className="off-card off-top">
                        <div>
                            <span className="eyebrow">{isNew ? 'Nieuwe offerte' : 'Offerte bewerken'}</span>
                            <div className="num">{form.nummer || 'Concept'}</div>
                            <p className="meta">{form.created_at ? 'Aangemaakt ' + fmtNl(String(form.created_at).slice(0, 10)) : 'Nieuwe offerte'} · {settings?.bedrijfsnaam || 'BBQ Architect'}</p>
                        </div>
                        <div className="off-top-actions">
                            <OffDropdown trigger={function (open, toggle) {
                                return (
                                    <button type="button" className="off-status-btn" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}>
                                        <span className="off-status-dot" style={{ background: statusMeta.dot }} />
                                        {statusMeta.label}
                                        <ChevronDown size={15} color="var(--muted)" />
                                    </button>
                                );
                            }}>
                                {STATUS_ORDER.map(function (k) {
                                    return (
                                        <button type="button" key={k} className="off-dd-item" onClick={function () { setField('status', k); }}>
                                            <span className="off-status-dot" style={{ background: STATUS_META[k].dot, marginLeft: 2, marginRight: 4 }} />
                                            {STATUS_META[k].label}
                                            {k === form.status ? <Check size={15} color="var(--accent-gold-text)" style={{ marginLeft: 'auto' }} /> : null}
                                        </button>
                                    );
                                })}
                            </OffDropdown>

                            <OffDropdown trigger={function (open, toggle) {
                                return (
                                    <button type="button" className="off-iconbtn" onClick={toggle} title="Meer acties" aria-label="Meer acties" aria-expanded={open}>
                                        <MoreHorizontal size={19} />
                                    </button>
                                );
                            }}>
                                <button type="button" className="off-dd-item" onClick={handleMail}><span className="ico"><Mail size={16} /></span> Mail versturen</button>
                                <button type="button" className="off-dd-item" onClick={downloadOfferte}><span className="ico"><FileText size={16} /></span> PDF downloaden</button>
                                {!isNew && <button type="button" className="off-dd-item" onClick={copyKlantLink}><span className="ico"><LinkIcon size={16} /></span> Klant-link kopiëren</button>}
                                {!isNew && form.status === 'geaccepteerd' && <button type="button" className="off-dd-item" onClick={convertToFactuur}><span className="ico"><Receipt size={16} /></span> Maak factuur</button>}
                                {!isNew && <button type="button" className="off-dd-item" onClick={function () { duplicateOfferte(form); }}><span className="ico"><Copy size={16} /></span> Dupliceer</button>}
                                {!isNew && <div className="off-dd-sep" />}
                                {!isNew && <button type="button" className="off-dd-item danger" onClick={deleteOfferte}><span className="ico"><Trash2 size={16} /></span> Verwijderen</button>}
                            </OffDropdown>

                            <button type="button" className="off-iconbtn" onClick={function () { setEditing(null); setForm(null); }} title="Terug naar overzicht" aria-label="Terug naar overzicht">
                                <ArrowLeft size={18} />
                            </button>
                        </div>
                    </header>

                    {/* ── 1 · Klant (WIE) ── */}
                    <section className="off-card">
                        <div className="off-head">
                            <span className="off-ic"><UserRound size={18} color="var(--accent-gold-text)" /></span>
                            <div style={{ minWidth: 0 }}>
                                <span className="off-step">Wie</span>
                                <h2 className="off-h2">Klant</h2>
                                <p className="off-sub">Voor wie is deze offerte?</p>
                            </div>
                        </div>
                        <div className="off-klant">
                            <KlantAutocomplete
                                label="Klantnaam"
                                inputClassName="off-input"
                                value={form.client_naam}
                                onChange={function (v) { setField('client_naam', v); clearError('client_naam'); }}
                                onSelect={function (k) { setField('client_naam', k.naam); setField('client_adres', [k.adres, k.postcode, k.plaats].filter(Boolean).join(', ')); if ((k as { email?: string }).email) setField('client_email', (k as { email?: string }).email); }}
                                error={errors.client_naam}
                            />
                            <label className="off-field">
                                <span className="off-field-label">Adres</span>
                                <textarea className="off-area" value={form.client_adres || ''} placeholder="Straat, postcode en plaats" onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('client_adres', e.target.value); }} />
                            </label>
                            <label className="off-field">
                                <span className="off-field-label">E-mail</span>
                                <input className="off-input" type="email" inputMode="email" autoComplete="email" placeholder="naam@bedrijf.nl" value={form.client_email || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_email', e.target.value); }} />
                            </label>
                            <div className="off-2col">
                                <label className="off-field">
                                    <span className="off-field-label">Datum</span>
                                    <input className="off-input" type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); clearError('datum'); }} style={errors.datum ? { borderColor: 'var(--red)' } : {}} />
                                    <FieldError message={errors.datum} fieldName="datum" />
                                </label>
                                <label className="off-field">
                                    <span className="off-field-label">Geldig tot</span>
                                    <input className="off-input" type="date" value={form.geldig_tot} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('geldig_tot', e.target.value); }} />
                                    <span className="off-field-hint">Standaard 30 dagen</span>
                                </label>
                            </div>
                            <label className="off-field">
                                <span className="off-field-label">Notitie</span>
                                <textarea className="off-area" rows={2} value={form.notitie || ''} placeholder="Interne notitie of opmerking voor de klant" onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} />
                            </label>
                        </div>
                    </section>

                    {/* ── 2 · Menu (WAT) — CTA opent de geünificeerde canva ── */}
                    <section className="off-card">
                        <div className="off-head">
                            <span className="off-ic"><ChefHat size={18} color="var(--accent-gold-text)" /></span>
                            <div style={{ minWidth: 0 }}>
                                <span className="off-step">Wat</span>
                                <h2 className="off-h2">Menu</h2>
                                <p className="off-sub">Wat serveer je?</p>
                            </div>
                        </div>
                        <button type="button" className="off-menu-cta" onClick={function () { setShowCanvas(true); }} title="Menu samenstellen — de menukaart vult zichzelf automatisch">
                            <span className="cta-ic"><UtensilsCrossed size={20} color="#1a1407" /></span>
                            <div style={{ minWidth: 0 }}>
                                <div className="cta-t">Menu &amp; menukaart</div>
                                <div className="cta-s">Stel het menu samen en genereer de menukaart</div>
                            </div>
                            <ChevronRight size={20} color="var(--accent-gold-text)" style={{ marginLeft: 'auto' }} />
                        </button>
                        {menuList.length > 0 ? (
                            <>
                                <ul className="off-menu-list">
                                    {menuList.map(function (d, i) {
                                        return <li key={i}><span className="dot" />{d.n}<span className="tag">{d.t}</span></li>;
                                    })}
                                </ul>
                                <div className="off-menu-foot">
                                    <CircleDollarSign size={14} color="var(--muted)" />
                                    {menuList.length} gerechten gekozen
                                    {marge.foodcostTotaal > 0 ? <> · foodcost <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>&nbsp;{fmt(marge.foodcostTotaal)}</span></> : null}
                                </div>
                            </>
                        ) : (
                            <div className="off-empty">
                                <Info size={16} color="var(--muted)" />
                                Nog geen gerechten gekozen — open de menukaart om het menu samen te stellen.
                            </div>
                        )}
                    </section>

                    {/* ── 3 · Regels (HOEVEEL) ── */}
                    <section className="off-card">
                        <div className="off-head">
                            <span className="off-ic"><ListIcon size={18} color="var(--accent-gold-text)" /></span>
                            <div style={{ minWidth: 0 }}>
                                <span className="off-step">Hoeveel</span>
                                <h2 className="off-h2">Offerteregels</h2>
                                <p className="off-sub">Wat reken je door?</p>
                            </div>
                        </div>
                        <div className="off-table-wrap">
                            <table className="off-table">
                                <colgroup>
                                    <col /><col style={{ width: 78 }} /><col style={{ width: 118 }} /><col style={{ width: 118 }} /><col style={{ width: 92 }} /><col style={{ width: 122 }} /><col style={{ width: 40 }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>Omschrijving</th>
                                        <th className="r">Aantal</th>
                                        <th className="r">Excl. btw</th>
                                        <th className="r">Incl. btw</th>
                                        <th className="r">BTW</th>
                                        <th className="r">Totaal excl.</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(form.items || []).map(function (item, idx: number) {
                                        const isDiscount = isDiscountLine(item);
                                        return (
                                            <tr key={idx} className={isDiscount ? 'off-discount-row' : undefined}>
                                                <td><input className="off-cellinput" value={item.desc} placeholder="Omschrijving…" onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                                <td>{isDiscount ? <span className="off-discount-pill">Korting</span> : <input className="off-cellinput num" type="number" min="0" step="1" value={item.qty} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} />}</td>
                                                <td>
                                                    {isDiscount ? (
                                                        <div className="off-discount-input">
                                                            <select value={item.discount_type || 'amount'} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { updateDiscountKind(idx, e.target.value === 'percent' ? 'percent' : 'amount'); }} aria-label="Korting type">
                                                                <option value="amount">€</option>
                                                                <option value="percent">%</option>
                                                            </select>
                                                            <input className="off-cellinput num" type="text" inputMode="decimal" value={moneyCellValue(idx, 'excl', Number(item.discount_value) || 0)} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setMoneyCellDraft(idx, 'excl', e.target.value); updateDiscountValue(idx, e.target.value); }} onBlur={function () { clearMoneyCellDraft(idx, 'excl'); }} />
                                                        </div>
                                                    ) : (
                                                        <input className="off-cellinput num" type="text" inputMode="decimal" value={moneyCellValue(idx, 'excl', Number(item.prijs) || 0)} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setMoneyCellDraft(idx, 'excl', e.target.value); updateItemPriceExcl(idx, e.target.value); }} onBlur={function () { clearMoneyCellDraft(idx, 'excl'); }} />
                                                    )}
                                                </td>
                                                <td>{isDiscount ? <span className="off-discount-muted">Aparte regel</span> : <input className="off-cellinput num" type="text" inputMode="decimal" value={moneyCellValue(idx, 'incl', priceInclFromExcl(Number(item.prijs) || 0, Number(item.btw) || 0))} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setMoneyCellDraft(idx, 'incl', e.target.value); updateItemPriceIncl(idx, e.target.value); }} onBlur={function () { clearMoneyCellDraft(idx, 'incl'); }} />}</td>
                                                <td className="r">{isDiscount ? <span className="off-discount-muted">0%</span> : <OffBtwSelect value={Number(item.btw) || 0} onChange={function (v) { updateItemBtw(idx, v); }} />}</td>
                                                <td className="r"><span className="off-linetotal">{fmt((item.qty || 0) * (item.prijs || 0))}</span></td>
                                                <td><button type="button" className="off-rowdel" onClick={function () { removeItem(idx); }} title="Regel verwijderen" aria-label="Regel verwijderen"><Trash2 size={15} /></button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="off-row-actions">
                            <button type="button" className="off-addrow" onClick={addItem}><Plus size={15} /> Regel</button>
                            <button type="button" className="off-addrow off-adddiscount" onClick={addDiscountItem}><Plus size={15} /> Korting</button>
                        </div>
                        <div className="off-totals">
                            <div className="row"><span className="lab">Subtotaal (excl. btw)</span><span className="val">{fmt(totals.subtotaal)}</span></div>
                            {btwRates.map(function (rate) { return <div className="row" key={rate}><span className="lab">BTW {rate}%</span><span className="val">{fmt(btwGroups[rate])}</span></div>; })}
                            <div className="row grand"><span className="lab">Totaal</span><span className="val">{fmt(totals.totaal)}</span></div>
                        </div>
                    </section>

                    {/* ── 4 · Vaste kosten (EENMALIG, inklapbaar) ── */}
                    <section className="off-card">
                        <button type="button" className="off-collap-head" onClick={function () { setVasteOpen(!vasteOpen); }} aria-expanded={vasteOpen}>
                            <span className="off-ic"><Fuel size={18} color="var(--accent-gold-text)" /></span>
                            <div>
                                <span className="off-step">Eenmalig</span>
                                <h2 className="off-h2">Vaste kosten</h2>
                            </div>
                            <span className="off-collap-sum">
                                <span className="amt">{fmt(vasteTotaal)}</span>
                                <span>· {vasteKosten.length} {vasteKosten.length === 1 ? 'post' : 'posten'}</span>
                                <span className={'off-chev' + (vasteOpen ? ' open' : '')}><ChevronDown size={18} /></span>
                            </span>
                        </button>
                        {vasteOpen ? (
                            <div className="off-collap-body">
                                {vasteKosten.map(function (k, idx: number) {
                                    return (
                                        <div className="off-kost-row" key={idx}>
                                            <input className="off-input" value={k.naam || ''} placeholder="Kostenpost" onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateVaste(idx, 'naam', e.target.value); }} />
                                            <input className="off-input mono" type="number" min="0" step="0.01" value={k.bedrag as number} style={{ textAlign: 'right' }} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateVaste(idx, 'bedrag', parseFloat(e.target.value) || 0); }} />
                                            <button type="button" className="off-rowdel" onClick={function () { removeVaste(idx); }} title="Verwijderen" aria-label="Kostenpost verwijderen"><Trash2 size={15} /></button>
                                        </div>
                                    );
                                })}
                                <button type="button" className="off-addrow" onClick={addVaste}><Plus size={15} /> Kostenpost toevoegen</button>
                            </div>
                        ) : null}
                    </section>

                    {/* ── 5 · Winst-overzicht (MARGE) — read-only ── */}
                    <section className="off-card">
                        <div className="off-head">
                            <span className="off-ic"><Gauge size={18} color="var(--accent-gold-text)" /></span>
                            <div style={{ minWidth: 0 }}>
                                <span className="off-step">Marge</span>
                                <h2 className="off-h2">Winst-overzicht</h2>
                                <p className="off-sub">Automatisch berekend uit menu, regels en kosten</p>
                            </div>
                        </div>
                        <div className="off-stats">
                            <div className="off-stat"><span className="lab">Omzet</span><span className="val">{fmt(marge.omzet)}</span><span className="note">excl. btw</span></div>
                            <div className="off-stat"><span className="lab">Foodcost</span><span className="val">{fmt(marge.foodcostTotaal)}</span><span className="note">{!costKnown ? 'nog geen kostprijs' : Math.round(marge.foodcostTotaal / marge.omzet * 100) + '% van omzet'}</span></div>
                            <div className="off-stat"><span className="lab">Vaste kosten</span><span className="val">{fmt(marge.vasteKosten)}</span><span className="note">eenmalig</span></div>
                            <div className="off-stat off-stat-net">
                                <span className="lab">Netto winst</span>
                                <span className="val">{fmt(marge.nettoWinst)}</span>
                                <div className="off-marge">
                                    <div className="off-marge-track"><div className="off-marge-fill" style={{ width: (costKnown ? Math.max(0, Math.min(100, marge.margePct)) : 0) + '%', background: margeHex }} /></div>
                                    <span className="off-marge-txt"><span className="off-marge-dot" style={{ background: margeHex }} />{costKnown ? `Marge ${marge.margePct.toFixed(0)}% · ${margeLabel(marge.margePct)}` : 'Nog geen kostprijs — kies een menu'}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <MenuMenukaartCanvas
                    open={showCanvas}
                    onClose={function () { setShowCanvas(false); }}
                    contextLabel={ctxLabel}
                    gerechten={gerechtenData}
                    gangen={gangenData}
                    menuTemplates={menuTemplatesData}
                    initialMenuSelectie={typeof form.menu_selectie === 'object' && !Array.isArray(form.menu_selectie) ? form.menu_selectie : {}}
                    templateId={form.menukaart_template_id || settings?.menukaart_template_id || 'restaurant-01'}
                    brandOverrides={(settings?.menukaart_overrides as Record<string, unknown>) ?? {}}
                    customOverrides={(form.menukaart_overrides as Record<string, unknown>) ?? {}}
                    logoUrl={settings?.logo_url ?? null}
                    offerId={editing !== 'new' ? form.id : null}
                    onSave={handleCanvasSave}
                />

                <StickyActionBar
                    hint={ctxLabel}
                    secondary={
                        <button className="btn btn-ghost" onClick={function () { setEditing(null); setForm(null); }}>
                            <ArrowLeft size={14} /> Annuleren
                        </button>
                    }
                    primary={
                        <button className="btn-gold" onClick={saveOfferte}>
                            <Save size={14} /> Opslaan
                        </button>
                    }
                />
            </div>
        );
    }

    return (
        <div className="hopbites-theme mobile-safe-bottom">
            <PageHeader
                title={`Offertes (${offertes.length})`}
                description="BBQ Architect"
                actions={<>
                    <button className="btn btn-ghost btn-sm" onClick={function () { downloadCsv(offertesToCsv(offertes), 'offertes-export.csv'); showToast('CSV gedownload'); }} title="Exporteer als CSV voor boekhouding"><FileDown size={14} /> CSV</button>
                    <button className="btn-gold-outline" onClick={function () { setShowAiWizard(true); }}><Sparkles size={14} /> AI Offerte</button>
                    <button className="btn-gold" onClick={openTemplatePicker}><Plus size={14} /> Nieuwe offerte</button>
                </>}
            />
            <MarginDriftBanner />
            <OfferteMenuPicker
                open={showWizard}
                onClose={function () { setShowWizard(false); setPrefillFromTemplate(null); }}
                onApply={handleWizardComplete}
                initialTemplateId={prefillFromTemplate?.templateId ?? null}
            />
            {showTemplatePicker && (
                <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) setShowTemplatePicker(false); }}>
                    <div className="modal-box" style={{ maxWidth: 560, width: '95%', maxHeight: '85vh', overflow: 'auto' }}>
                        <h3 style={{ marginTop: 0 }}>Hoe wil je beginnen?</h3>
                        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4, marginBottom: 16 }}>
                            Kies een opgeslagen menu uit /gerechten of begin opnieuw met de wizard.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                            <button className="btn btn-brand" onClick={newOfferteFromWizardBlank} style={{ justifyContent: 'flex-start' }}>
                                <Sparkles size={14} style={{ marginRight: 8 }} /> Wizard vanaf nul
                                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>Stel een nieuw menu samen</span>
                            </button>
                            <button className="btn btn-ghost" onClick={newOfferteHandmatig} style={{ justifyContent: 'flex-start' }}>
                                <Plus size={14} style={{ marginRight: 8 }} /> Handmatige offerte
                                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>Direct items typen, geen menu</span>
                            </button>
                        </div>

                        {availableTemplates.length > 0 && (
                            <>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                                    Of starten met een opgeslagen menu
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {availableTemplates.map(function (t) {
                                        const sel = typeof t.menu_selectie === 'string' ? JSON.parse(t.menu_selectie) : (t.menu_selectie || {});
                                        const dishCount: number = (Object.values(sel) as unknown[]).reduce<number>(function (a, list) { return a + (Array.isArray(list) ? list.length : 0); }, 0);
                                        return (
                                            <button
                                                key={t.id}
                                                className="btn btn-ghost"
                                                onClick={function () { newOfferteFromTemplate(t); }}
                                                style={{ justifyContent: 'flex-start', textAlign: 'left' as const, padding: '10px 14px' }}
                                            >
                                                <UtensilsCrossed size={14} style={{ marginRight: 8, flexShrink: 0 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600 }}>
                                                        {t.is_default && <span style={{ color: '#B48C14', marginRight: 4 }}>★</span>}
                                                        {t.naam}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                                        {dishCount} gerechten · {t.basis_prijs_pp > 0 ? '€' + Number(t.basis_prijs_pp).toFixed(2) + ' p.p.' : 'Geen vaste prijs'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {availableTemplates.length === 0 && (
                            <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'center' as const, border: '1px dashed var(--border)', borderRadius: 8 }}>
                                Nog geen menukaarten. Maak er één aan via <Link href="/gerechten/menukaarten/nieuw" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>Menu → Menukaarten</Link>.
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button className="btn btn-ghost btn-sm" onClick={function () { setShowTemplatePicker(false); }}>Annuleren</button>
                        </div>
                    </div>
                </div>
            )}
            <AiOfferteWizard
                open={showAiWizard}
                onClose={function () { setShowAiWizard(false); }}
                onSaved={function (id) {
                    showToast('✨ AI-offerte opgeslagen als concept', 'success');
                    loadOffertes();
                    /* Lead Funnel: als deze offerte uit een lead-conversie kwam,
                       koppel de offerte terug aan de lead (FK + status 'offerte'). */
                    try {
                        const raw = localStorage.getItem('bbq_lead_convert');
                        if (raw) {
                            const conv = JSON.parse(raw) as { leadId?: number };
                            if (conv?.leadId) void linkLeadToOfferte(Number(conv.leadId), id);
                            localStorage.removeItem('bbq_lead_convert');
                        }
                    } catch { /* geen lead-conversie of localStorage onbeschikbaar */ }
                }}
            />
            <PageHint id="offertes" title="Offertes" description="Maak offertes met menu-selectie en live marge-berekening. Geaccepteerde offertes genereren automatisch een event en factuur." />
            <div style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 12,
            }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op klant of nummer..."
                    style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                />
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                    {['alle', 'concept', 'verzonden', 'geaccepteerd', 'betaald', 'afgewezen'].map(function (s) {
                        return <button key={s} className={'btn btn-sm ' + (filterStatus === s ? 'btn-brand' : 'btn-ghost')}
                            onClick={function () { setFilterStatus(s); }}
                            style={{ textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>;
                    })}
                </div>
                <select value={sortField + '_' + sortDir} onChange={function (e) {
                    const [f, d] = e.target.value.split('_');
                    setSortField(f); setSortDir(d as 'asc' | 'desc');
                }} style={{ flex: '0 0 auto', padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                    <option value="datum_desc">Datum (nieuwste eerst)</option>
                    <option value="datum_asc">Datum (oudste eerst)</option>
                    <option value="totaal_desc">Bedrag (hoog-laag)</option>
                    <option value="totaal_asc">Bedrag (laag-hoog)</option>
                    <option value="client_naam_asc">Klant (A-Z)</option>
                </select>
            </div>
            <div className="panel">
                {offertes.length === 0 && (
                    <div style={{
                        padding: 'var(--space-8) var(--space-6)',
                        textAlign: 'center',
                        background: 'linear-gradient(135deg, var(--brand-tint) 0%, var(--card) 70%)',
                        border: '1px solid var(--brand-tint-border)',
                        borderRadius: 'var(--radius-xl)',
                        margin: 'var(--space-4) 0',
                    }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 56, height: 56, borderRadius: 'var(--radius-xl)',
                            background: 'var(--brand)', color: '#000', marginBottom: 'var(--space-4)',
                        }}>
                            <Sparkles size={26} />
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Maak je eerste offerte met AI</h3>
                        <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 460, margin: '0 auto var(--space-5)', lineHeight: 1.5 }}>
                            Beschrijf je klant + event in één zin en de AI bouwt een volledig menu met adviesprijs en marge-berekening. In ~2 minuten klaar om te versturen.
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => setShowAiWizard(true)} className="btn btn-brand" style={{ padding: '12px 24px', fontSize: 14 }}>
                                <Sparkles size={14} /> Start met AI
                            </button>
                            <button onClick={newOfferte} className="btn btn-ghost" style={{ padding: '12px 20px', fontSize: 13 }}>
                                Lege offerte starten
                            </button>
                        </div>
                    </div>
                )}
                {offertes.filter(function (o) {
                    if (filterStatus !== 'alle' && o.status !== filterStatus) return false;
                    if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        return (o.client_naam || '').toLowerCase().includes(q) || (o.nummer || '').toLowerCase().includes(q);
                    }
                    return true;
                }).sort(function (a, b) {
                    if (sortField === 'datum') {
                        return sortDir === 'asc' ? (a.datum || '').localeCompare(b.datum || '') : (b.datum || '').localeCompare(a.datum || '');
                    }
                    if (sortField === 'client_naam') {
                        return sortDir === 'asc' ? (a.client_naam || '').localeCompare(b.client_naam || '') : (b.client_naam || '').localeCompare(a.client_naam || '');
                    }
                    if (sortField === 'totaal') {
                        const ta = (a.items || []).reduce(function (s: number, i) { return s + (i.qty || 0) * (i.prijs || 0); }, 0);
                        const tb = (b.items || []).reduce(function (s: number, i) { return s + (i.qty || 0) * (i.prijs || 0); }, 0);
                        return sortDir === 'asc' ? ta - tb : tb - ta;
                    }
                    return 0;
                }).map(function (o) {
                    let total = 0;
                    (o.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
                    const m = margeMap[String(o.id)] || calcOfferteMargeData(o);
                    /* menu_selectie heeft 3 mogelijke shapes (array van string,
                       array van object, of object met arrays) — runtime-check
                       met type-assertion is veiliger dan de Offerte-type-def. */
                    const menuSel = o.menu_selectie as unknown;
                    const hasMenu = Array.isArray(menuSel) && menuSel.length > 0;
                    return (
                        <div key={o.id} className="ev-row" onClick={function () { editOfferte(o); }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>{o.nummer}
                                    {hasMenu && m.gasten > 0 && (margeCostKnown(m)
                                        ? <span className={'marge-badge marge-badge-sm marge-' + margeColor(m.margePct)}>{margeEmoji(m.margePct)} {m.margePct.toFixed(0)}%</span>
                                        : <span className="marge-badge marge-badge-sm marge-grey" title="Nog geen kostprijs bekend — voeg gerechten met kostprijs toe">· kostprijs?</span>)}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.client_naam} — {fmtNl(o.datum)}</div>
                                {o.notitie && (function () {
                                    const txt = String(o.notitie);
                                    const gangIdx = txt.search(/GANG\s*\d|Normaal Menu:|Dieet Menu:|Totaalprijs/i);
                                    const opmerking = gangIdx > 0 ? txt.substring(0, gangIdx).trim() : (gangIdx === 0 ? '' : txt.trim());
                                    return opmerking ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{opmerking.length > 80 ? opmerking.substring(0, 80) + '...' : opmerking}</div> : null;
                                })()}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={function (e) { e.stopPropagation(); window.location.href = '/offertes/' + o.id + '/menukaart-editor'; }}
                                    title={o.menukaart_template_id ? 'Pas menukaart-styling aan' : 'Maak een menukaart voor deze offerte'}
                                    style={{
                                        padding: '6px 10px',
                                        fontSize: 11.5,
                                        letterSpacing: '.05em',
                                        textTransform: 'uppercase',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        ...(o.menukaart_template_id ? {} : { borderColor: 'rgba(158,120,28,.4)', color: 'var(--brand-gold, #c4a35a)' }),
                                    }}
                                >
                                    <Palette size={13} /> Menukaart
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={function (e) { e.stopPropagation(); window.location.href = '/offertes/' + o.id + '/view'; }}
                                    title="Bekijk in nieuwe Margin Doctor weergave"
                                    style={{ padding: '6px 12px', fontSize: 11.5, letterSpacing: '.05em', textTransform: 'uppercase' }}
                                >
                                    Margin Doctor
                                </button>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                    <StatusBadge status={o.status} size="sm" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* SyncCascade - visuele feedback bij offerte acceptatie */}
            {cascadeSteps && (
                <SyncCascade
                    title="Acceptance Workflow"
                    steps={cascadeSteps}
                    onClose={function () { setCascadeSteps(null); }}
                    autoClose={8000}
                />
            )}

            {/* Follow-Up Prompt */}
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
