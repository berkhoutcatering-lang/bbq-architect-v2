'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, Unlink, UtensilsCrossed, Pencil, Trash2, Star, Flame, Sparkles, Hammer, Lightbulb, Armchair, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/lib/useSupabase';
import { track, trackOnce } from '@/lib/track';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useFormValidation } from '@/hooks/useFormValidation';
import { getInvPrice as sharedGetInvPrice } from '@/lib/costCalculations';
import FieldError from '@/components/FieldError';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import MargeBar from '@/components/chips/MargeBar';
import MenuWizard, { type MenuTemplateInput } from '@/components/MenuWizard';
import KitchenModeStepper from '@/components/KitchenModeStepper';
import AuditTrailTimeline from '@/components/AuditTrailTimeline';
import { LoadingState } from '@/components/LoadingState';
import FollowUpPrompt, { type FollowUpAction } from '@/components/FollowUpPrompt';
import InventoryAutocomplete, { type InventoryRow } from '@/components/InventoryAutocomplete';
import RecipeAiButton, { type AiFillResult, type AiFillMeta } from '@/components/RecipeAiButton';
import EstimatedPriceFixButton, { type FixResult } from '@/components/EstimatedPriceFixButton';
import RecipeFineTuneButton, { type FineTune, type RecipeForTune } from '@/components/RecipeFineTuneButton';
import GerechtenKpiTiles from './_components/GerechtenKpiTiles';
/* Bucket C (2026-05-25) — IA opschonen: nieuwe Menu-hub components vervangen
   de oude card-grid en gerecht-detail flow. GangFilterPills blijft niet
   meer in JSX (filtering via MRLibraryPage interne filter-pills) maar de
   import stays voor evt. fallback. */
import { MRViewToggle, MRSearchBar, MRButton, MRFilterPill } from '@/components/menu/atoms';
import { MRLibraryView } from '@/components/menu/library-views';
import { GerechtDetailDrawer } from '@/components/menu/drawer/GerechtDetailDrawer';
import { MenuCommandPalette, useCmdKShortcut } from '@/components/menu/MenuCommandPalette';
import { BedenkerModal } from '@/components/menu/BedenkerModal';
import { AllergenConfirmModal, type AllergenRow } from '@/components/menu/AllergenConfirmModal';
import { useMenuView } from '@/hooks/useMenuView';
import { getGangKey, getGangLabel } from '@/components/menu/helpers';
import {
  computeKpiTiles,
  pickGlyph,
} from './_components/stats-helpers';
import type { InventoryItem, Gang, Gerecht, MenuTemplateRow } from '@/types';

/* Velden voor Gerecht (gang_slug, foto_url, tags, allergenen, ingredienten,
   bron, kostprijs_pp, verkoopprijs) en Gang (minimum, extra_prijs_pp) zijn
   centraal toegevoegd via src/types/database.types.extensions.ts (module
   augmentation). MenuTemplateRow komt ook uit die file. */

/* P0.19 — GerechtenClient is de Client-body; `<page.tsx>` Server Component
   prefetcht gangen + gerechten + inventory + menu_templates parallel zodat
   first paint geen waterfall toont. `loadData()` blijft als refetch zodat
   menu-templates en realtime updates blijven werken. */
export interface GerechtenInitial {
    gangen?: Gang[];
    gerechten?: Gerecht[];
    inventory?: InventoryItem[];
    menuTemplates?: MenuTemplateRow[];
}

export default function Gerechten({ initial }: { initial?: GerechtenInitial } = {}) {
    const showToast = useToast();
    const showConfirm = useConfirm();
    const { orgId } = useOrg();
    const { errors, validateAll, clearError, fieldProps } = useFormValidation({
        naam: [{ required: 'Vul een naam in' }],
    });
    const { data: inventoryData, insert: insertInventory, refetch: refetchInventory } = useSupabase<InventoryItem>('inventory', initial?.inventory ?? []);
    const [gangen, setGangen] = useState<Gang[]>(initial?.gangen ?? []);
    const [gerechten, setGerechten] = useState<Gerecht[]>(initial?.gerechten ?? []);
    const [activeGang, setActiveGang] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any>>({});
    const [aiEnriching, setAiEnriching] = useState(false);
    const [gangEditing, setGangEditing] = useState<string | number | null>(null);
    const [gangForm, setGangForm] = useState<Record<string, any>>({});
    const [tagInput, setTagInput] = useState('');
    const [allergeenInput, setAllergeenInput] = useState('');
    const [labelInput, setLabelInput] = useState('');
    const [battleInput, setBattleInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [stats, setStats] = useState<Record<string, any> | null>(null);
    const [hwInput, setHwInput] = useState<Record<string, any>>({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
    const [costInput, setCostInput] = useState<Record<string, any>>({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
    const [dataLoading, setDataLoading] = useState(true);
    const [followUpActions, setFollowUpActions] = useState<FollowUpAction[] | null>(null);
    const [followUpTitle, setFollowUpTitle] = useState('');
    /* Menu's-tab op /gerechten — herbruikbare menu-templates die de wizard
       opslaat. Eén plek voor menu-samenstelling, hergebruikt vanuit /offertes. */
    const [view, setView] = useState<'gerechten' | 'menus'>('gerechten');
    /* Status-filter: 'all' default, anders een van de 4 workflow-states. */
    const [statusFilter, setStatusFilter] = useState<'all' | 'concept' | 'review_nodig' | 'actief' | 'inactief'>('all');
    const [menuTemplates, setMenuTemplates] = useState<MenuTemplateRow[]>(initial?.menuTemplates ?? []);
    const [showMenuWizard, setShowMenuWizard] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<MenuTemplateInput | null>(null);
    /* Kitchen Mode = full-screen stap-voor-stap voor in de keuken (was /recepten).
       Dit object bewaart titel + stappen array voor de stepper. */
    const [kitchenMode, setKitchenMode] = useState<{ titel: string; stappen: string[] } | null>(null);

    /* Bucket C (2026-05-25): nieuwe menu-hub state.
       - inspectingGerecht = drawer open + welke gerecht erin staat
       - cmdkOpen = ⌘K palette state
       - bedenkerOpen = lokale BedenkerModal-open state (URL-driven flow loopt
         via MenuHubModalMounts in /gerechten/layout.tsx)
       - allergenModalRows = pending AI-rows na save; lege array = geen modal */
    const [viewMode, setViewMode] = useMenuView();
    const [inspectingGerecht, setInspectingGerecht] = useState<Gerecht | null>(null);
    const [cmdkOpen, setCmdkOpen] = useState(false);
    const [bedenkerOpen, setBedenkerOpen] = useState(false);
    const [allergenModalRows, setAllergenModalRows] = useState<AllergenRow[]>([]);
    /* AI-allergeen-detectie bij opslaan: standaard aan, maar Sam wil de keuze.
       aiSaving = spinner-state tijdens de (trage) AI-call. */
    const [aiAllergenEnabled, setAiAllergenEnabled] = useState(true);
    const [aiSaving, setAiSaving] = useState(false);
    /* P0-A: saveData wacht in pending tot user op modal beslist. */
    const [pendingAllergenSave, setPendingAllergenSave] = useState<Record<string, any> | null>(null);
    const [gangFilter, setGangFilter] = useState<string>('all');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const serviceImageRef = useRef<HTMLInputElement>(null);
    const WINKELS = ['Sligro', 'Crisp', 'PLUS', 'Overig'];
    const HW_CATS = ['servies', 'apparatuur', 'branding', 'meubilair'];
    const COST_UNITS = ['kg', 'g', 'L', 'ml', 'stuks'];

    useEffect(function () { loadData().finally(function () { setDataLoading(false); }); }, []);

    /* Bucket C — ⌘K opent de Menu Command Palette. */
    useCmdKShortcut(useCallback(() => setCmdkOpen(true), []));

    async function loadData() {
        const g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) {
            setGangen(g.data);
            if (!activeGang && g.data.length > 0) setActiveGang(g.data[0].slug);
        }
        const r = await supabase.from('gerechten').select('*').order('volgorde');
        if (r.data) setGerechten(r.data);
        await loadMenuTemplates();
    }

    async function loadMenuTemplates() {
        const { data, error } = await supabase
            .from('menu_templates')
            .select('*')
            .eq('actief', true)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false });
        if (error) {
            /* Migratie nog niet gedraaid → tabel ontbreekt. Niet-fataal: lege state. */
            if (/relation .* does not exist/i.test(error.message)) {
                setMenuTemplates([]);
                return;
            }
            console.warn('[gerechten] menu_templates load error:', error.message);
            return;
        }
        setMenuTemplates(data || []);
    }

    function newMenuTemplate() {
        setEditingTemplate(null);
        setShowMenuWizard(true);
    }

    function editMenuTemplate(t) {
        setEditingTemplate({
            id: t.id,
            naam: t.naam,
            beschrijving: t.beschrijving || '',
            menu_selectie: typeof t.menu_selectie === 'string' ? JSON.parse(t.menu_selectie) : (t.menu_selectie || {}),
            basis_prijs_pp: t.basis_prijs_pp || undefined,
            aantal_gasten: t.aantal_gasten || undefined,
        });
        setShowMenuWizard(true);
    }

    async function handleMenuTemplateComplete(result: any) {
        const naam = (result.template_naam || '').trim();
        if (!naam) { showToast('Geef het menu een naam', 'error'); return; }

        const payload = {
            naam,
            beschrijving: result.template_beschrijving || null,
            menu_selectie: result.menu_selectie || {},
            basis_prijs_pp: result.basis_prijs_pp || 0,
            aantal_gasten: result.aantal_gasten || 40,
            organization_id: orgId || null,
            actief: true,
        };

        if (result.template_id) {
            const { error } = await supabase.from('menu_templates').update(payload).eq('id', result.template_id);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Menu bijgewerkt!');
        } else {
            const { error } = await supabase.from('menu_templates').insert([payload]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Menu opgeslagen!');
        }
        setShowMenuWizard(false);
        setEditingTemplate(null);
        await loadMenuTemplates();
    }

    function deleteMenuTemplate(id: number | string) {
        showConfirm('Weet je zeker dat je dit menu wilt verwijderen?', async function () {
            const { error } = await supabase.from('menu_templates').delete().eq('id', id);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Menu verwijderd');
            await loadMenuTemplates();
        });
    }

    async function toggleDefaultTemplate(t) {
        if (t.is_default) {
            const { error } = await supabase.from('menu_templates').update({ is_default: false }).eq('id', t.id);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
        } else {
            /* Eerst alle defaults voor deze org clearen — partial unique index dwingt 1 default per org af. */
            if (orgId) {
                await supabase.from('menu_templates').update({ is_default: false }).eq('organization_id', orgId).eq('is_default', true);
            }
            const { error } = await supabase.from('menu_templates').update({ is_default: true }).eq('id', t.id);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
        }
        await loadMenuTemplates();
    }

    function newGang() {
        setGangEditing('new');
        setGangForm({ naam: '', slug: '', minimum: 1, extra_prijs_pp: 0, volgorde: gangen.length + 1, actief: true });
    }
    function editGang(g) {
        setGangEditing(g.id);
        setGangForm({ naam: g.naam, slug: g.slug, minimum: g.minimum, extra_prijs_pp: g.extra_prijs_pp, volgorde: g.volgorde, actief: g.actief !== false });
    }
    async function saveGang() {
        if (!gangForm.naam || !gangForm.slug) { showToast('Vul naam en slug in', 'error'); return; }
        if (gangEditing === 'new') {
            const { error } = await supabase.from('gangen').insert([gangForm]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang toegevoegd!');
        } else {
            const { error } = await supabase.from('gangen').update(gangForm).eq('id', gangEditing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang bijgewerkt!');
        }
        setGangEditing(null);
        loadData();
    }
    async function deleteGang(id: number | string) {
        showConfirm('Weet je zeker dat je deze gang wilt verwijderen?', async function () {
            await supabase.from('gangen').delete().eq('id', id);
            showToast('Gang verwijderd');
            setGangEditing(null);
            loadData();
        });
    }

    function newGerecht() {
        setEditing('new');
        setForm({
            naam: '', beschrijving: '', gang_slug: activeGang,
            volgorde: gerechten.filter(function (g) { return g.gang_slug === activeGang; }).length + 1,
            foto_url: '', ingredienten: [], bereidingswijze: '',
            allergenen: [], tags: [], kostprijs_pp: '',
            service_image: '', battle_plan_steps: [], target_prep_time: 0,
            hardware_items: [], ingredienten_winkels: {},
            ingredient_costs: [], actief: false,
            porties: 10, wijn_suggestie: '', service_tip: ''
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput(''); setBattleInput('');
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
        setStats(null);
    }
    async function editGerecht(g) {
        setEditing(g.id);

        const rawIngs = g.ingredienten || [];
        const mappedIngs = Array.isArray(rawIngs) ? rawIngs : (typeof rawIngs === 'string' ? rawIngs.split(',').map(function (s: string) { return s.trim(); }).filter(Boolean) : []);

        setForm({
            naam: g.naam,
            beschrijving: g.beschrijving || '',
            gang_slug: g.gang_slug,
            volgorde: g.volgorde,
            foto_url: g.foto_url || '',
            ingredienten: mappedIngs.map(function (i) {
                if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
                return String(i);
            }),
            bereidingswijze: g.bereidingswijze || '',
            allergenen: g.allergenen || [],
            tags: g.tags || [],
            kostprijs_pp: g.kostprijs_pp || '',
            service_image: g.service_image || '',
            battle_plan_steps: g.battle_plan_steps || [],
            target_prep_time: g.target_prep_time || 0,
            hardware_items: g.hardware_items || [],
            ingredienten_winkels: g.ingredienten_winkels || {},
            ingredient_costs: g.ingredient_costs || [],
            actief: g.actief !== false,
            porties: g.porties || 10,
            wijn_suggestie: g.wijn_suggestie || '',
            service_tip: g.service_tip || ''
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput(''); setBattleInput('');
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
        loadStats(g.naam);
    }

    async function loadStats(naam: string) {
        const offRes = await supabase.from('offertes').select('id, client_naam, datum, menu_selectie').not('menu_selectie', 'is', null);
        let offCount = 0;
        const offList: { naam: string; datum: string }[] = [];
        if (offRes.data) {
            offRes.data.forEach(function (o) {
                const sel = typeof o.menu_selectie === 'string' ? JSON.parse(o.menu_selectie) : o.menu_selectie;
                let found = false;
                Object.values(sel || {}).forEach(function (dishes) {
                    /* dishes-shape varieert per offerte: kan string[] of object[] zijn.
                       Runtime-check + cast naar string[] voor de indexOf-lookup. */
                    if (Array.isArray(dishes) && (dishes as string[]).indexOf(naam) >= 0) found = true;
                });
                if (found) { offCount++; offList.push({ naam: o.client_naam, datum: o.datum }); }
            });
        }

        const servRes = await supabase.from('service_logs').select('duration_seconds, gang_slug').not('served_at', 'is', null);
        let totalTime = 0; let timeCount = 0;
        if (servRes.data) {
            servRes.data.forEach(function (log) {
                if (log.duration_seconds) { totalTime += log.duration_seconds; timeCount++; }
            });
        }

        setStats({
            offCount: offCount,
            offList: offList.slice(0, 5),
            avgTime: timeCount > 0 ? Math.round(totalTime / timeCount) : null,
            servedCount: timeCount
        });
    }

    /* AI allergeen-detectie obv ingredient_costs (of fallback ingredienten). User
       hoeft niets te doen — als hij geen allergenen had ingevuld, vullen we 'm
       automatisch aan met door AI gedetecteerde codes. Bestaande user-codes
       blijven behouden (we mergen, geen overschrijving). */
    async function detectAllergensViaAi(saveData: Record<string, any>): Promise<string[]> {
        try {
            const fromCosts = Array.isArray(saveData.ingredient_costs)
                ? saveData.ingredient_costs.map((c) => c?.naam).filter(Boolean)
                : [];
            const fromIngredienten = Array.isArray(saveData.ingredienten) ? saveData.ingredienten : [];
            const ingredients = (fromCosts.length > 0 ? fromCosts : fromIngredienten).filter(Boolean);
            if (ingredients.length === 0) return [];

            const res = await fetch('/api/detect-allergens', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ingredients, dish_name: saveData.naam }),
            });
            if (!res.ok) return [];
            const body = await res.json();
            /* Activation tracking — `ai_allergen_detect` markeert dat een tenant
               de allergeen-AI succesvol heeft gebruikt. */
            if (Array.isArray(body.allergens) && body.allergens.length > 0) {
                track('ai_allergen_detect', { dish: saveData.naam, count: body.allergens.length });
            }
            return Array.isArray(body.allergens) ? body.allergens : [];
        } catch (e) {
            console.warn('[gerecht] allergen detection failed:', e);
            return [];
        }
    }

    /* Bucket-C P0-A (2026-05-25): saveGerecht splitst nu in 2 fases:
       1. detect + check newOnes → modal openen (block save)
       2. commitSave wordt door modal-onSubmit aangeroepen met user-decisions
       Reden: zonder confirm zou een onbevestigde AI-allergeen direct in
       /q/[id] zichtbaar worden — security/safety issue. */
    async function commitSave(saveData: Record<string, any>) {
        const dbData: Record<string, any> = Object.assign({}, saveData);
        if (editing === 'new') {
            if (!dbData.status) dbData.status = 'actief';
            if (!dbData.bron) dbData.bron = 'manual';
            /* RLS WITH CHECK op gerechten vereist organization_id ∈ user's orgs.
               Zonder dit faalt de insert met "new row violates row-level security
               policy". orgId komt uit useOrg(). */
            if (!dbData.organization_id && orgId) dbData.organization_id = orgId;
        }

        if (editing === 'new') {
            if (!orgId) { showToast('Geen organisatie geladen — herlaad de pagina', 'error'); return; }
            const { error } = await supabase.from('gerechten').insert([dbData]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht toegevoegd!');
            /* Activation tracking — `first_gerecht_created` (ux-master.md sectie 7). */
            trackOnce('first_gerecht_created', 'first_gerecht');
            setFollowUpActions([
                { icon: '\ud83c\udf7d\ufe0f', label: 'Stel een menu samen', onClick: function() { newMenuTemplate(); } },
                { icon: '\u2795', label: 'Nog een gerecht toevoegen', onClick: function() { newGerecht(); } },
            ]);
            setFollowUpTitle('Gerecht toegevoegd!');
        } else {
            const { error } = await supabase.from('gerechten').update(dbData).eq('id', editing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht bijgewerkt!');
        }
        setEditing(null);
        loadData();
    }

    /* P0-A entry-point: detect → modal of direct commit. */
    async function saveGerecht() {
        if (!validateAll({ naam: form.naam })) return;
        const saveData = Object.assign({}, form) as Record<string, any>;
        if (saveData.kostprijs_pp === '' || saveData.kostprijs_pp === null) saveData.kostprijs_pp = 0;
        else saveData.kostprijs_pp = parseFloat(saveData.kostprijs_pp) || 0;

        /* AI-allergeen-detectie is optioneel (Sam's keuze). Bij uitgeschakeld:
           direct opslaan zonder AI-call — sneller, geen kosten, handmatige
           allergenen blijven leidend. */
        if (!aiAllergenEnabled) {
            await commitSave(saveData);
            return;
        }

        setAiSaving(true);
        try {
            const aiAllergens = await detectAllergensViaAi(saveData);
            const existing = Array.isArray(saveData.allergenen) ? saveData.allergenen : [];
            const newOnes = aiAllergens.filter((a: string) => !existing.includes(a));

            if (newOnes.length > 0) {
                /* Block save, open modal. Modal-onSubmit roept commitSave aan met
                   de definitieve allergenen-merge op basis van user-decisions. */
                setPendingAllergenSave(saveData);
                setAllergenModalRows(newOnes.map((a: string, i: number) => ({
                    id: `save-${i}-${a}`,
                    allergen: a,
                    source: `AI-detectie via ${saveData.ingredient_costs?.length ?? saveData.ingredienten?.length ?? 0} ingrediënten`,
                    confidence: 90,
                })));
                return;
            }

            await commitSave(saveData);
        } finally {
            setAiSaving(false);
        }
    }

    async function deleteGerecht(id: number | string) {
        showConfirm('Weet je zeker dat je dit gerecht wilt verwijderen?', async function () {
            await supabase.from('gerechten').delete().eq('id', id);
            showToast('Gerecht verwijderd');
            setEditing(null);
            loadData();
        });
    }

    async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const ext = file.name.split('.').pop();
        const fileName = 'gerecht_' + Date.now() + '.' + ext;

        const { data, error } = await supabase.storage
            .from('gerechten-fotos')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (error) {
            showToast('Upload fout: ' + error.message, 'error');
            setUploading(false);
            return;
        }

        const { data: urlData } = supabase.storage
            .from('gerechten-fotos')
            .getPublicUrl(fileName);

        setForm(Object.assign({}, form, { foto_url: urlData.publicUrl }));
        setUploading(false);
        showToast('📸 Foto geüpload!');
    }

    async function handleServiceImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const ext = file.name.split('.').pop();
        const fileName = 'service_' + Date.now() + '.' + ext;
        const { data, error } = await supabase.storage
            .from('gerechten-fotos')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });
        if (error) {
            showToast('Upload fout: ' + error.message, 'error');
            setUploading(false);
            return;
        }
        const { data: urlData } = supabase.storage
            .from('gerechten-fotos')
            .getPublicUrl(fileName);
        setForm(Object.assign({}, form, { service_image: urlData.publicUrl }));
        setUploading(false);
        showToast('🎯 Service foto geüpload!');
    }

    function addArrayItem(field: string, value: string, setter: (v: string) => void) {
        const current = form[field] || [];
        if (value.trim() && !current.includes(value.trim())) {
            setForm(Object.assign({}, form, { [field]: current.concat([value.trim()]) }));
        }
        setter('');
    }
    function removeArrayItem(field: string, idx: number) {
        const current = (form[field] || []).slice();
        current.splice(idx, 1);
        setForm(Object.assign({}, form, { [field]: current }));
    }
    function handleTagKeyDown(field: string, value: string, setter: (v: string) => void, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            addArrayItem(field, value, setter);
        }
    }

    function addHardwareItem() {
        if (!hwInput.naam.trim()) return;
        const items = (form.hardware_items || []).concat([Object.assign({}, hwInput, { naam: hwInput.naam.trim() })]);
        setForm(Object.assign({}, form, { hardware_items: items }));
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
    }
    function removeHardwareItem(idx: number) {
        const items = (form.hardware_items || []).slice();
        items.splice(idx, 1);
        setForm(Object.assign({}, form, { hardware_items: items }));
    }
    function setWinkelTag(ingredient: string, winkel: string) {
        const winkels = Object.assign({}, form.ingredienten_winkels || {});
        if (winkel) winkels[ingredient] = winkel;
        else delete winkels[ingredient];
        setForm(Object.assign({}, form, { ingredienten_winkels: winkels }));
    }

    function addCostItem() {
        if (!costInput.naam.trim()) return;
        const items = (form.ingredient_costs || []).concat([Object.assign({}, costInput, {
            naam: costInput.naam.trim(),
            qty_pp: parseFloat(costInput.qty_pp) || 0,
            yield: parseFloat(costInput.yield) || 1.0,
            inventory_id: costInput.inventory_id || null,
        })]);
        setForm(Object.assign({}, form, { ingredient_costs: items }));
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0, inventory_id: null });
    }
    function pickFromInventory(naam: string, inv?: InventoryRow) {
        setCostInput((c) => Object.assign({}, c, {
            naam,
            inventory_id: inv?.id ?? null,
            // Als gebruiker geen eenheid heeft gekozen, pak die van het voorraad-item
            unit: c.unit === 'kg' && inv?.unit ? inv.unit : c.unit,
        }));
    }

    function applyAiFill(data: AiFillResult, meta: AiFillMeta) {
        setForm((f: any) => Object.assign({}, f, {
            naam: f.naam || data.naam,                             // overschrijf niet als al ingevuld
            beschrijving: f.beschrijving || data.beschrijving,
            porties: f.porties || data.porties || 10,
            ingredient_costs: (data.ingredient_costs || []).map(ing => ({
                naam: ing.naam,
                inventory_id: ing.inventory_id ?? null,
                qty_pp: ing.qty_pp,
                unit: ing.unit,
                yield: ing.yield ?? 1.0,
                is_estimated: ing.is_estimated ?? false,
                estimated_price: ing.estimated_price_eur ?? null,
            })),
            bereidingswijze: data.bereidingswijze || f.bereidingswijze || '',
            allergenen: (data.allergenen && data.allergenen.length) ? data.allergenen : f.allergenen,
            tags: (data.tags && data.tags.length) ? data.tags : f.tags,
            wijn_suggestie: data.wijn_suggestie || f.wijn_suggestie || '',
            service_tip: data.service_tip || f.service_tip || '',
            ingredienten: (data.ingredient_costs || []).map(i => i.naam),  // legacy field sync
        }));
        showToast(`AI vulde recept in (${meta.matched_count} matched, ${meta.estimated_count} geschat — €${(meta.cost_cents / 100).toFixed(3)})`, 'success');
    }

    async function applyFineTune(tune: FineTune) {
        if (tune.type === 'add_ingredient') {
            const d = tune.details;
            setForm((f: any) => {
                const items = (f.ingredient_costs || []).slice();
                items.push({
                    naam: d.naam,
                    qty_pp: d.qty_pp,
                    unit: d.unit,
                    yield: d.yield ?? 1.0,
                    inventory_id: d.inventory_id ?? null,
                    is_estimated: !!d.is_estimated,
                    estimated_price: d.estimated_price_eur ?? null,
                });
                return Object.assign({}, f, { ingredient_costs: items });
            });
            return;
        }
        if (tune.type === 'replace_ingredient') {
            const d = tune.details;
            setForm((f: any) => {
                const items = (f.ingredient_costs || []).slice();
                const idx = items.findIndex((i) =>
                    (i.naam || '').toLowerCase().trim() === d.from_naam.toLowerCase().trim()
                );
                const replacement = {
                    naam: d.to_naam,
                    qty_pp: d.to_qty_pp,
                    unit: d.to_unit,
                    yield: 1.0,
                    inventory_id: d.inventory_id ?? null,
                    is_estimated: !!d.is_estimated,
                    estimated_price: d.estimated_price_eur ?? null,
                };
                if (idx >= 0) items[idx] = replacement;
                else items.push(replacement);
                return Object.assign({}, f, { ingredient_costs: items });
            });
            return;
        }
        if (tune.type === 'tweak_quantity') {
            const d = tune.details;
            setForm((f: any) => {
                const items = (f.ingredient_costs || []).slice();
                const idx = items.findIndex((i) =>
                    (i.naam || '').toLowerCase().trim() === d.ingredient_naam.toLowerCase().trim()
                );
                if (idx >= 0) {
                    items[idx] = Object.assign({}, items[idx], {
                        qty_pp: d.new_qty_pp,
                        ...(d.new_unit ? { unit: d.new_unit } : {}),
                    });
                    return Object.assign({}, f, { ingredient_costs: items });
                }
                return f;
            });
            return;
        }
        if (tune.type === 'add_step') {
            const d = tune.details;
            setForm((f: any) => {
                const current = String(f.bereidingswijze || '').trim();
                const lines = current ? current.split('\n') : [];
                if (d.positie === 'begin') {
                    lines.unshift(d.stap_text);
                } else if (d.positie === 'eind' || typeof d.positie !== 'number') {
                    lines.push(d.stap_text);
                } else {
                    const idx = Math.max(0, Math.min(lines.length, d.positie));
                    lines.splice(idx, 0, d.stap_text);
                }
                return Object.assign({}, f, { bereidingswijze: lines.join('\n') });
            });
            return;
        }
        if (tune.type === 'general_tip') {
            const d = tune.details;
            setForm((f: any) => {
                if (d.veld === 'wijn_suggestie') {
                    return Object.assign({}, f, { wijn_suggestie: d.tip_text });
                }
                if (d.veld === 'service_tip') {
                    return Object.assign({}, f, { service_tip: d.tip_text });
                }
                // 'vrij' — append onderaan bereiding als tip-regel
                const current = String(f.bereidingswijze || '').trim();
                return Object.assign({}, f, {
                    bereidingswijze: current
                        ? current + '\n\n💡 ' + d.tip_text
                        : '💡 ' + d.tip_text,
                });
            });
            return;
        }
    }

    const tuneRecept: RecipeForTune = {
        naam: form.naam || '',
        beschrijving: form.beschrijving,
        porties: form.porties || 10,
        ingredient_costs: (form.ingredient_costs || []).map((i) => ({
            naam: i.naam,
            qty_pp: Number(i.qty_pp) || 0,
            unit: i.unit || 'kg',
            yield: i.yield,
            inventory_id: i.inventory_id ?? null,
            is_estimated: i.is_estimated,
            estimated_price: i.estimated_price,
        })),
        bereidingswijze: form.bereidingswijze,
        allergenen: form.allergenen,
        tags: form.tags,
        wijn_suggestie: form.wijn_suggestie,
        service_tip: form.service_tip,
    };

    async function applyEstimateFix(idx: number, fix: FixResult) {
        let newInventoryId: number | null = null;

        if (fix.addToInventory) {
            try {
                const existing = (inventoryData || []).find((i) =>
                    (i.naam || '').toLowerCase().trim() === fix.naam.toLowerCase().trim()
                );
                if (existing) {
                    newInventoryId = existing.id;
                } else {
                    const created = await insertInventory({
                        naam: fix.naam,
                        unit: fix.unit,
                        purchase_price: fix.price,
                        last_price_eur: fix.price,
                        last_price_at: new Date().toISOString(),
                        current_stock: 0,
                        min_stock: 0,
                        par_level: 0,
                        categorie: 'Overig',
                        supplier: fix.supplier || '',
                    } as any);
                    newInventoryId = (created as any)?.id ?? null;
                    void refetchInventory();
                }
            } catch (e) {
                console.warn('[applyEstimateFix] inventory add faalde:', (e as Error).message);
            }
        }

        setForm((f: any) => {
            const items = (f.ingredient_costs || []).slice();
            if (!items[idx]) return f;
            items[idx] = Object.assign({}, items[idx], {
                naam: fix.naam,
                unit: fix.unit,
                inventory_id: newInventoryId ?? items[idx].inventory_id ?? null,
                is_estimated: false,
                estimated_price: null,
            });
            return Object.assign({}, f, { ingredient_costs: items });
        });
    }
    function removeCostItem(idx: number) {
        const items = (form.ingredient_costs || []).slice();
        items.splice(idx, 1);
        setForm(Object.assign({}, form, { ingredient_costs: items }));
    }
    function calcCostPP(item: any) {
        const inv = sharedGetInvPrice(inventoryData as any, item.naam, item.inventory_id);
        const price = inv ? inv.price : 0;
        const yld = item.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
        let unitFactor = 1;
        if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
        if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
        return ((item.qty_pp || 0) * unitFactor / yld) * price;
    }
    const totalFoodcostPP = (form.ingredient_costs || []).reduce(function (sum: number, item: any) { return sum + calcCostPP(item); }, 0);

    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* Status-systeem: cards filteren op huidige gang + huidige status-filter.
       Status is single source of truth — `actief` blijft via DB-trigger in sync
       voor backwards-compat met oudere queries. */
    function getStatus(g): 'concept' | 'review_nodig' | 'actief' | 'inactief' {
        if (g.status) return g.status;
        return g.actief === false ? 'inactief' : 'actief';
    }
    /* Bucket C — vervangt gangGerechten (single-gang activeGang) met multi-filter
       op gangFilter (kan 'all' zijn). MRLibraryView krijgt de gefilterde lijst. */
    const filteredGerechten = useMemo(() => {
        return gerechten.filter(function (g) {
            if (gangFilter !== 'all' && g.gang_slug !== gangFilter) return false;
            if (statusFilter !== 'all' && getStatus(g) !== statusFilter) return false;
            return true;
        });
    }, [gerechten, gangFilter, statusFilter]);
    /* currentGang blijft beschikbaar voor edit-modal (newGerecht zet gang_slug). */
    const currentGang = gangen.find(function (g) { return g.slug === (gangFilter !== 'all' ? gangFilter : activeGang); });

    /* Tellingen per status voor de filter-pills bovenaan (over alle gangen). */
    const statusCounts = {
        all: gerechten.length,
        concept: gerechten.filter(g => getStatus(g) === 'concept').length,
        review_nodig: gerechten.filter(g => getStatus(g) === 'review_nodig').length,
        actief: gerechten.filter(g => getStatus(g) === 'actief').length,
        inactief: gerechten.filter(g => getStatus(g) === 'inactief').length,
    };

    /* Compleetheid-meter: welke velden zijn nog niet ingevuld? */
    function checklistVoor(g): { label: string; ok: boolean }[] {
        return [
            { label: 'Naam', ok: !!(g.naam && String(g.naam).trim()) },
            { label: 'Beschrijving', ok: !!(g.beschrijving && String(g.beschrijving).trim()) },
            { label: 'Foto', ok: !!g.foto_url },
            { label: 'Kostprijs', ok: Number(g.kostprijs_pp || 0) > 0 },
            { label: 'Ingrediënten', ok: Array.isArray(g.ingredienten) && g.ingredienten.length > 0 },
            { label: 'Allergenen', ok: Array.isArray(g.allergenen) && g.allergenen.length > 0 },
            { label: 'Bereidingswijze', ok: !!(g.bereidingswijze && String(g.bereidingswijze).trim()) },
        ];
    }

    const ALLERGENEN_PRESETS = ['Glutenvrij', 'Lactosevrij', 'Notenvrij', 'Vegetarisch', 'Veganistisch', 'Vis', 'Schaaldieren'];
    const TAG_PRESETS = ['Vega', 'Vegan', 'Signature', 'Populair', 'Nieuw', 'Seizoen'];

    if (dataLoading) {
        return <LoadingState label="Gerechten laden" />;
    }

    // Compute stats voor de KPI-tegels
    const kpiData = computeKpiTiles(gerechten);

    const gangPills = gangen.map(function (g) {
        const count = gerechten.filter(function (d) { return d.gang_slug === g.slug; }).length;
        const icon = pickGlyph('', g.slug);
        return { slug: g.slug as string, label: g.naam as string, icon, count };
    });

    return (
        <div className="main-content mobile-safe-bottom">
            {/* RichKeukenTabs verwijderd — vervangen door HubTabs in /gerechten/layout.tsx (Menu & Recepten unify). */}
            {/* Compacte 1-line header: titel + view-toggle (Gerechten / Menu's) + add-CTA.
                Vervangt PageGuideNote + GerechtenPageHero + SignatureSpotlight + DietAllergensOverview
                — Sam's "te speels" feedback. Density-doel: gerechten boven de fold. */}
            {/* Bucket C (2026-05-25) — nieuwe header: titel + tab-toggle + view-toggle
                + ⌘K search + acties (Bedenk met AI + Nieuw). Bestaande Gerechten ↔
                Menu's tab-toggle blijft als hoofdroute voor menu-templates view. */}
            <div className="mr-page-header" style={{ padding: '14px 0 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <h1 className="mr-page-title" style={{ fontSize: 22 }}>
                        {view === 'gerechten' ? 'Gerechten' : "Menu's"}
                    </h1>
                    <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {view === 'gerechten' ? `${gerechten.length} gerechten` : `${menuTemplates.length} menu's`}
                    </span>
                    <div role="tablist" style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', marginLeft: 8 }}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'gerechten'}
                            onClick={function () { setView('gerechten'); }}
                            className={view === 'gerechten' ? 'btn btn-brand btn-sm' : 'btn btn-ghost btn-sm'}
                            style={{ minHeight: 32, padding: '6px 12px', fontSize: 13 }}
                        >
                            Gerechten
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'menus'}
                            onClick={function () { setView('menus'); }}
                            className={view === 'menus' ? 'btn btn-brand btn-sm' : 'btn btn-ghost btn-sm'}
                            style={{ minHeight: 32, padding: '6px 12px', fontSize: 13 }}
                        >
                            Menu&rsquo;s
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {view === 'gerechten' && (
                        <>
                            <MRSearchBar onCmdK={() => setCmdkOpen(true)} />
                            <MRViewToggle mode={viewMode} onChange={setViewMode} />
                        </>
                    )}
                </div>
            </div>

            {/* Action-bar: AI-bedenker + Nieuw */}
            <div className="mr-action-bar">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {view === 'gerechten' ? (
                        <>
                            <MRButton variant="primary" icon={<Plus size={14} />} onClick={newGerecht}>Nieuw gerecht</MRButton>
                            <MRButton variant="ai" icon={<Sparkles size={14} />} onClick={() => setBedenkerOpen(true)}>
                                Bedenk met AI
                            </MRButton>
                            <button type="button" onClick={newGang} className="btn btn-ghost btn-sm" style={{ minHeight: 32 }}>+ Gang</button>
                        </>
                    ) : (
                        <MRButton variant="primary" icon={<Plus size={14} />} onClick={newMenuTemplate}>Nieuw menu</MRButton>
                    )}
                </div>
            </div>

            {view === 'gerechten' && gerechten.length > 0 && (
                <GerechtenKpiTiles
                    totaal={kpiData.totaal}
                    conceptCount={kpiData.conceptCount}
                    gemVerkoop={kpiData.gemVerkoop}
                    gemMargePct={kpiData.gemMargePct}
                    allergenenGedekt={kpiData.allergenenGedekt}
                    totaalGerechten={kpiData.totaalGerechten}
                />
            )}
            {/* GangFilterPills weg — gang-filter loopt via MRFilterPill in de Bucket-C filter-bar. */}


            {view === 'menus' && (
                <PageSection>
                    {menuTemplates.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--card)' }}>
                            <UtensilsCrossed size={28} style={{ color: 'var(--muted)', marginBottom: 12 }} />
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Nog geen menu&rsquo;s opgeslagen</div>
                            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
                                Bouw een menu met de wizard en sla het op. Hergebruik het later in een offerte zodat je niet elke keer opnieuw begint.
                            </div>
                            <button className="btn btn-brand btn-sm" onClick={newMenuTemplate}>
                                <UtensilsCrossed size={14} style={{ marginRight: 6 }} />Nieuw menu maken
                            </button>
                        </div>
                    ) : (
                        <div className="dish-grid">
                            {menuTemplates.map(function (t) {
                                const sel = typeof t.menu_selectie === 'string' ? JSON.parse(t.menu_selectie) : (t.menu_selectie || {});
                                const dishCount: number = (Object.values(sel) as unknown[]).reduce<number>(function (a, list) { return a + (Array.isArray(list) ? list.length : 0); }, 0);
                                return (
                                    <div key={t.id} className="dish-card" style={{ position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            {t.is_default && <Star size={14} style={{ color: '#B48C14', fill: '#B48C14' }} />}
                                            <div className="dish-name" style={{ margin: 0, flex: 1 }}>{t.naam}</div>
                                        </div>
                                        {t.beschrijving ? <div className="dish-desc">{String(t.beschrijving)}</div> : null}
                                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                                            {dishCount} gerechten over {Object.keys(sel).length} gangen
                                        </div>
                                        {Number(t.basis_prijs_pp) > 0 && (
                                            <div className="dish-kostprijs">€{Number(t.basis_prijs_pp).toFixed(2)} p.p.</div>
                                        )}
                                        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={function () { editMenuTemplate(t); }} title="Aanpassen">
                                                <Pencil size={12} style={{ marginRight: 4 }} /> Aanpassen
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={function () { toggleDefaultTemplate(t); }} title={t.is_default ? 'Standaard af' : 'Maak standaard'}>
                                                <Star size={12} style={{ marginRight: 4, color: t.is_default ? '#B48C14' : undefined }} /> {t.is_default ? 'Standaard' : 'Maak standaard'}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={function () { deleteMenuTemplate(t.id); }} title="Verwijderen" style={{ color: 'var(--red)' }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </PageSection>
            )}

            {view === 'gerechten' && (<>
                {/* Filter-pills bar — gang + status, beide met MRFilterPill */}
                <div className="mr-filter-bar">
                    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap' }}>
                        <MRFilterPill label="Alle" count={gerechten.length} active={gangFilter === 'all'} onClick={() => setGangFilter('all')} />
                        {gangen.map(g => (
                            <MRFilterPill
                                key={g.slug}
                                label={g.naam}
                                count={gerechten.filter(d => d.gang_slug === g.slug).length}
                                active={gangFilter === g.slug}
                                onClick={() => setGangFilter(g.slug)}
                            />
                        ))}
                    </div>
                    {(statusCounts.concept > 0 || statusCounts.review_nodig > 0 || statusFilter !== 'all') && (
                        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 12 }}>
                            <MRFilterPill label="Alle" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                            <MRFilterPill label="Actief" count={statusCounts.actief} active={statusFilter === 'actief'} onClick={() => setStatusFilter('actief')} />
                            {statusCounts.concept > 0 && <MRFilterPill label="✦ Concept" count={statusCounts.concept} active={statusFilter === 'concept'} onClick={() => setStatusFilter('concept')} />}
                            {statusCounts.review_nodig > 0 && <MRFilterPill label="Review" count={statusCounts.review_nodig} active={statusFilter === 'review_nodig'} onClick={() => setStatusFilter('review_nodig')} />}
                            {statusCounts.inactief > 0 && <MRFilterPill label="Inactief" count={statusCounts.inactief} active={statusFilter === 'inactief'} onClick={() => setStatusFilter('inactief')} />}
                        </div>
                    )}
                </div>

                {/* Gang-overzicht (alleen tonen als specifieke gang geselecteerd) */}
                {gangFilter !== 'all' && currentGang && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
                        <div>
                            <span style={{ fontWeight: 600 }}>{currentGang.naam}</span>
                            <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 10 }}>
                                Min. {currentGang.minimum} selecteren
                                {(currentGang.extra_prijs_pp ?? 0) > 0 && ' • Extra: +€' + Number(currentGang.extra_prijs_pp).toFixed(2) + ' p.p.'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost btn-sm" onClick={function () { editGang(currentGang); }}>Gang bewerken</button>
                        </div>
                    </div>
                )}

                {/* MRLibraryView — Grid / List / Gallery dispatcher */}
                {filteredGerechten.length === 0 ? (
                    <EmptyState page="/gerechten" onAction={newGerecht} />
                ) : (
                    <MRLibraryView
                        mode={viewMode}
                        gerechten={filteredGerechten}
                        gangen={gangen}
                        onSelect={(g) => setInspectingGerecht(g)}
                        density="comfortable"
                        photoMode="mixed"
                    />
                )}
            </>)}

            {showMenuWizard && (
                <MenuWizard
                    mode="template"
                    existingTemplate={editingTemplate}
                    onComplete={handleMenuTemplateComplete}
                    onClose={function () { setShowMenuWizard(false); setEditingTemplate(null); }}
                />
            )}

            {kitchenMode && (
                <KitchenModeStepper
                    titel={kitchenMode.titel}
                    stappen={kitchenMode.stappen}
                    onClose={function () { setKitchenMode(null); }}
                />
            )}

            {editing && (
                <div className="modal-bg" onClick={function (e: React.MouseEvent<HTMLDivElement>) { if (e.target === e.currentTarget) setEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h3 style={{ margin: 0 }}>{editing === 'new' ? 'Nieuw gerecht' : 'Gerecht bewerken'}</h3>
                            <button type="button" disabled={aiEnriching || !form.naam}
                                onClick={async function () {
                                    setAiEnriching(true);
                                    try {
                                        /* Vision-pad: als er een foto is, gebruik de nieuwe
                                           /api/gerecht-vision-fill endpoint die de foto analyseert
                                           én suggesties teruggeeft. Anders fallback op de bestaande
                                           tekst-only /api/recipe-generate enrich-flow. */
                                        if (form.foto_url) {
                                            const res = await fetch('/api/gerecht-vision-fill', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    naam: form.naam,
                                                    beschrijving: form.beschrijving || '',
                                                    foto_url: form.foto_url,
                                                    bereidings_modus: form.bereidings_modus || null,
                                                }),
                                            });
                                            const body = await res.json();
                                            if (!res.ok) { showToast('AI fout: ' + (body.error || 'onbekend'), 'error'); return; }
                                            const d = body.data || {};
                                            // Allergenen + kostprijs zijn server-side gefilterd (compliance).
                                            // Convert vision-output naar form-shape.
                                            const ingredientenStrings = (d.ingredienten || []).map(function (i: any) {
                                                return `${i.naam} ${i.qty_pp}${i.eenheid}`;
                                            });
                                            setForm(Object.assign({}, form, {
                                                beschrijving: form.beschrijving || d.beschrijving || '',
                                                gang_slug: form.gang_slug || d.gangcategorie || '',
                                                bereidings_modus: form.bereidings_modus || d.bereidings_modus || 'prepared',
                                                ingredienten: (form.ingredienten && form.ingredienten.length > 0) ? form.ingredienten : ingredientenStrings,
                                                bereidingswijze: form.bereidingswijze || (Array.isArray(d.preparation_steps) ? d.preparation_steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') : ''),
                                                wijn_suggestie: form.wijn_suggestie || d.wijn_suggestie || '',
                                                bier_suggestie: form.bier_suggestie || d.bier_suggestie || '',
                                                service_tip: form.service_tip || d.service_tip || '',
                                                ai_suggested: true,
                                                bron: 'ai',
                                            }));
                                            // Vision-vertrouwen + inline vragen tonen als de AI er om vraagt
                                            const conf = d.vision_confidence || 'middel';
                                            const questions = Array.isArray(d.inline_questions) ? d.inline_questions : [];
                                            if (questions.length > 0) {
                                                showToast(`AI vraagt: ${questions.join(' · ')}`, 'info');
                                            } else {
                                                showToast(`AI heeft velden ingevuld (zekerheid: ${conf}) — check ingrediënten en stappen`, 'success');
                                            }
                                            return;
                                        }

                                        // Fallback: tekst-only enrich (oude pad zonder foto)
                                        const existing = gerechten.map(function (g) { return { naam: g.naam, gang: g.gang_slug, tags: g.tags }; });
                                        const res = await fetch('/api/recipe-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'enrich', prompt: 'enrich', existing: existing, options: { currentDish: form } }) });
                                        const body = await res.json();
                                        if (!res.ok) { showToast('AI fout: ' + (body.error || 'onbekend'), 'error'); return; }
                                        const d = body.data || {};
                                        setForm(Object.assign({}, form, {
                                            beschrijving: form.beschrijving || d.beschrijving || '',
                                            ingredienten: (form.ingredienten && form.ingredienten.length > 0) ? form.ingredienten : (d.ingredienten || []).map(function (i) { return i.naam + ' ' + i.hoeveelheid + i.eenheid; }),
                                            bereidingswijze: form.bereidingswijze || (Array.isArray(d.instructies) ? d.instructies.join('\n') : d.instructies) || '',
                                            allergenen: (form.allergenen && form.allergenen.length > 0) ? form.allergenen : (d.allergenen || []),
                                            tags: (form.tags && form.tags.length > 0) ? form.tags : (d.tags || []),
                                            kostprijs_pp: form.kostprijs_pp || d.geschatte_kostprijs_pp || 0,
                                        }));
                                        showToast('AI heeft ontbrekende velden ingevuld', 'success');
                                    } catch (e) {
                                        showToast('Fout: ' + (e.message || 'onbekend'), 'error');
                                    } finally {
                                        setAiEnriching(false);
                                    }
                                }}
                                style={{ padding: '8px 14px', borderRadius: 8, background: form.naam && !aiEnriching ? 'rgba(196,163,90,.15)' : 'rgba(255,255,255,.05)', border: '1px solid ' + (form.naam ? 'rgba(196,163,90,.35)' : 'rgba(255,255,255,.1)'), color: form.naam ? '#c4a35a' : 'rgba(255,255,255,.3)', fontSize: 11, fontWeight: 700, cursor: form.naam && !aiEnriching ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                ✦ {aiEnriching ? (form.foto_url ? 'Claude analyseert foto...' : 'Claude schrijft...') : (form.foto_url ? 'AI: foto analyseren' : 'AI vul velden in')}
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>

                            <div className="field">
                                <label>Foto</label>
                                {form.foto_url ? (
                                    <div className="foto-upload-zone has-foto">
                                        <img src={form.foto_url} alt="Gerecht" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { fileInputRef.current!.click(); }}>Vervangen</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setForm(Object.assign({}, form, { foto_url: '' })); }}>Verwijder</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="foto-upload-zone" onClick={function () { fileInputRef.current!.click(); }}>
                                        {uploading ? <span style={{ color: 'var(--color-accent-gold)' }}>⏳ Uploaden...</span> : <span>📷 Klik om foto te uploaden</span>}
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoUpload} />
                            </div>

                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: 12, marginBottom: 12, padding: '12px 14px', borderRadius: 12,
                                background: 'linear-gradient(135deg, rgba(196,163,90,.10), rgba(196,163,90,.02))',
                                border: '1px solid rgba(196,163,90,.28)',
                                flexWrap: 'wrap',
                            }}>
                                <div style={{ minWidth: 200, flex: 1 }}>
                                    <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-accent-gold)', fontWeight: 700, marginBottom: 2 }}>
                                        AI Receptuur-Assistent
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                                        Geef alleen een naam (bv. &ldquo;Pulled Pork Taco&rdquo;) — AI vult ingrediënten, bereiding, allergenen, kostprijs in. Matcht tegen je voorraad; onbekende producten worden geschat (met foto-fix-knop).
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <RecipeAiButton
                                        defaultName={form.naam || ''}
                                        defaultPorties={form.porties || 10}
                                        onResult={applyAiFill}
                                    />
                                    {(form.ingredient_costs || []).length > 0 && form.naam && (
                                        <RecipeFineTuneButton
                                            recept={tuneRecept}
                                            onApply={applyFineTune}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="form-grid">
                                <div className="field">
                                    <label>Naam</label>
                                    <input name="naam" value={form.naam || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { naam: e.target.value })); clearError('naam'); }} placeholder="bijv. Crispy Zalm" style={errors.naam ? { borderColor: 'var(--red)' } : {}} {...fieldProps('naam', form.naam)} />
                                    <FieldError message={errors.naam} fieldName="naam" />
                                </div>
                                <div className="field">
                                    <label>Gang</label>
                                    <select value={form.gang_slug || ''} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setForm(Object.assign({}, form, { gang_slug: e.target.value })); }}>
                                        {gangen.map(function (g) { return <option key={g.slug} value={g.slug}>{g.naam}</option>; })}
                                    </select>
                                </div>
                            </div>

                            <div className="field">
                                <label>Beschrijving</label>
                                <input value={form.beschrijving || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} placeholder="bijv. Krokant gyoza vel met gerookte zalm" />
                            </div>

                            <div className="field">
                                <label>Ingrediënten</label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.ingredienten || []).map(function (tag: string, idx: number) {
                                            return (
                                                <span key={idx} className="ingredient-tag">
                                                    {tag}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('ingredienten', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={tagInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setTagInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('ingredienten', tagInput, setTagInput, e); }}
                                        placeholder="Typ ingrediënt + Enter" />
                                </div>
                            </div>

                            <div className="field">
                                <label>Bereidingswijze <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(één stap per regel voor Kitchen Mode)</span></label>
                                <textarea value={form.bereidingswijze || ''}
                                    onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }}
                                    placeholder={'bijv.\n1. Brisket 12u op 110°C\n2. Wrap in butcher paper bij 75°C kerntemp\n3. Snijd tegen draad in van 5mm'}
                                    rows={4} style={{ resize: 'vertical' }} />
                            </div>

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Receptuur</span>
                                    {form.bereidingswijze && (
                                        <button
                                            type="button"
                                            onClick={function () {
                                                const stappen = String(form.bereidingswijze || '')
                                                    .split('\n')
                                                    .map(function (s: string) { return s.trim().replace(/^\d+\.\s*/, ''); })
                                                    .filter(Boolean);
                                                setKitchenMode({ titel: form.naam || 'Gerecht', stappen });
                                            }}
                                            style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(196,163,90,.15)', border: '1px solid rgba(196,163,90,.35)', color: 'var(--color-accent-gold)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 'normal' }}
                                            title="Open de stappen full-screen voor in de keuken"
                                        >
                                            <Flame size={12} /> Kitchen Mode
                                        </button>
                                    )}
                                </div>

                                <div className="form-grid">
                                    <div className="field">
                                        <label>Porties (referentie)</label>
                                        <input type="number" min={1} value={form.porties || 10}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { porties: parseInt(e.target.value) || 1 })); }}
                                            placeholder="bijv. 10" />
                                    </div>
                                    <div className="field">
                                        <label>Bereidingstijd <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(seconden)</span></label>
                                        <input type="number" min={0} step={30} value={form.target_prep_time || ''}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { target_prep_time: e.target.value === '' ? 0 : parseInt(e.target.value) })); }}
                                            placeholder="bijv. 1800 (= 30 min)" />
                                    </div>
                                </div>

                                <div className="field">
                                    <label>Wijn-suggestie <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                    <input value={form.wijn_suggestie || ''}
                                        onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { wijn_suggestie: e.target.value })); }}
                                        placeholder="bijv. Stevige rode Pinotage of Zuid-Afrikaanse Cabernet" />
                                </div>

                                <div className="field">
                                    <label>Service-tip <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(plating / serveren)</span></label>
                                    <input value={form.service_tip || ''}
                                        onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { service_tip: e.target.value })); }}
                                        placeholder="bijv. Serveer op voorverwarmd bord, mierikswortel apart in een kleine schaal" />
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    Service Mode — chef-instructies
                                </div>

                                <div className="field">
                                    <label>Service-foto <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(perfecte opmaak)</span></label>
                                    {form.service_image ? (
                                        <div className="foto-upload-zone has-foto">
                                            <img src={form.service_image} alt="Service" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8 }} />
                                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                <button type="button" className="btn btn-ghost btn-sm" onClick={function () { serviceImageRef.current!.click(); }}>Vervangen</button>
                                                <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setForm(Object.assign({}, form, { service_image: '' })); }}>Verwijder</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="foto-upload-zone" onClick={function () { serviceImageRef.current!.click(); }} style={{ borderColor: 'rgba(180,140,20,.2)' }}>
                                            {uploading ? <span style={{ color: 'var(--color-accent-gold)' }}>⏳ Uploaden...</span> : <span>🎯 Klik om service foto te uploaden</span>}
                                        </div>
                                    )}
                                    <input ref={serviceImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleServiceImageUpload} />
                                </div>

                                <div className="field">
                                    <label>Battle plan <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(stappen voor de chef)</span></label>
                                    <div className="tag-input-container">
                                        <div className="tag-list">
                                            {(form.battle_plan_steps || []).map(function (step: string, idx: number) {
                                                return (
                                                    <span key={idx} className="battle-step-tag">
                                                        <span style={{ color: 'var(--color-accent-gold)', fontWeight: 700, marginRight: 4 }}>{idx + 1}.</span>
                                                        {step}
                                                        <button type="button" className="tag-remove" onClick={function () { removeArrayItem('battle_plan_steps', idx); }}>×</button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <input className="tag-input" value={battleInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setBattleInput(e.target.value); }}
                                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('battle_plan_steps', battleInput, setBattleInput, e); }}
                                            placeholder="Typ stap + Enter (bijv. Flat Top 220°C)" />
                                    </div>
                                </div>

                                <div className="field">
                                    <label>Doeltijd <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel, in seconden)</span></label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input type="number" min="0" step="30" value={form.target_prep_time || ''}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { target_prep_time: e.target.value === '' ? 0 : parseInt(e.target.value) })); }}
                                            placeholder="bijv. 300 (= 5 min)" style={{ maxWidth: 160 }} />
                                        {form.target_prep_time > 0 && (
                                            <span style={{ fontSize: 13, color: 'var(--color-accent-gold)', fontWeight: 600 }}>
                                                = {formatTime(form.target_prep_time)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    Hardware per gast
                                </div>

                                {(form.hardware_items || []).length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                        {(form.hardware_items || []).map(function (hw: any, idx: number) {
                                            return (
                                                <div key={idx} className="hw-item-row">
                                                    <span className="hw-item-cat" aria-label={hw.categorie}>
                                                        {hw.categorie === 'servies' ? <UtensilsCrossed size={12} />
                                                            : hw.categorie === 'apparatuur' ? <Hammer size={12} />
                                                            : hw.categorie === 'branding' ? <Lightbulb size={12} />
                                                            : <Armchair size={12} />}
                                                    </span>
                                                    <span className="hw-item-name">{hw.naam}</span>
                                                    <span className="hw-item-detail">×{hw.ratio}/gast</span>
                                                    <span className="hw-item-detail">+{hw.buffer_pct}%</span>
                                                    {hw.min_extra > 0 && <span className="hw-item-detail">+{hw.min_extra} extra</span>}
                                                    <button type="button" className="tag-remove" onClick={function () { removeHardwareItem(idx); }}>×</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div className="field" style={{ flex: 2, minWidth: 120 }}>
                                        <label>Item naam</label>
                                        <input value={hwInput.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { naam: e.target.value })); }}
                                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') { e.preventDefault(); addHardwareItem(); } }}
                                            placeholder="bijv. Churchill Dessertbord" style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Ratio</label>
                                        <input type="number" step="0.1" min="0" value={hwInput.ratio}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { ratio: parseFloat(e.target.value) || 0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Buffer%</label>
                                        <input type="number" min="0" value={hwInput.buffer_pct}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { buffer_pct: parseInt(e.target.value) || 0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 70, flex: '0 1 80px' }}>
                                        <label>Categorie</label>
                                        <select value={hwInput.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setHwInput(Object.assign({}, hwInput, { categorie: e.target.value })); }}
                                            style={{ fontSize: 12, padding: '7px 6px' }}>
                                            {HW_CATS.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
                                        </select>
                                    </div>
                                    <button type="button" className="btn btn-brand btn-sm" onClick={addHardwareItem} style={{ height: 34 }}>+</button>
                                </div>
                            </div>

                            {(form.ingredienten || []).length > 0 && (
                                <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                        Winkel per ingrediënt
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {(form.ingredienten || []).map(function (ing: string, idx: number) {
                                            const currentWinkel = (form.ingredienten_winkels || {})[ing] || '';
                                            return (
                                                <div key={idx} className="winkel-tag-row">
                                                    <span className="winkel-tag-name">{ing}</span>
                                                    <select className="winkel-tag-select" value={currentWinkel}
                                                        onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setWinkelTag(ing, e.target.value); }}>
                                                        <option value="">—</option>
                                                        {WINKELS.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    Kostprijsberekening
                                </div>

                                {(form.ingredient_costs || []).length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                        {(form.ingredient_costs || []).map(function (item: any, idx: number) {
                                            const inv = sharedGetInvPrice(inventoryData as any, item.naam, item.inventory_id);
                                            const costPP = calcCostPP(item);
                                            const isEstimated = !!item.is_estimated && !inv;
                                            const estPrice = Number(item.estimated_price);
                                            return (
                                                <div key={idx} className="ingredient-cost-row">
                                                    <div className="ingredient-cost-info">
                                                        <span className="ingredient-cost-name">{item.naam}</span>
                                                        {inv ? (
                                                            <span className="ingredient-cost-linked"><Link size={14} /> €{inv.price.toFixed(2)}/{inv.unit}</span>
                                                        ) : isEstimated ? (
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                padding: '2px 8px', fontSize: 10, fontWeight: 700,
                                                                letterSpacing: '.1em', textTransform: 'uppercase',
                                                                color: '#f59e0b', background: 'rgba(245,158,11,.10)',
                                                                border: '1px solid rgba(245,158,11,.35)', borderRadius: 5,
                                                            }}>
                                                                <Sparkles size={11} /> Geschat
                                                                {Number.isFinite(estPrice) && estPrice > 0 && (
                                                                    <span style={{ marginLeft: 4, fontWeight: 600, textTransform: 'none', letterSpacing: 'normal' }}>
                                                                        €{estPrice.toFixed(2)}/{item.unit}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="ingredient-cost-unlinked"><Unlink size={14} /> niet in voorraad</span>
                                                        )}
                                                    </div>
                                                    <div className="ingredient-cost-details">
                                                        <span className="ingredient-cost-chip">{item.qty_pp} {item.unit}/gast</span>
                                                        {item.yield && item.yield < 1 && <span className="ingredient-cost-chip">yield {(item.yield * 100).toFixed(0)}%</span>}
                                                        {isEstimated && Number.isFinite(estPrice) && estPrice > 0 && (
                                                            <span className={'ingredient-cost-price'} title="Op basis van schatting">
                                                                ~€{((item.qty_pp || 0) * estPrice / (item.yield || 1)).toFixed(2)}
                                                            </span>
                                                        )}
                                                        {!isEstimated && (
                                                            <span className={'ingredient-cost-price' + (costPP > 0 ? '' : ' empty')}>€{costPP.toFixed(2)}</span>
                                                        )}
                                                        {isEstimated && (
                                                            <EstimatedPriceFixButton
                                                                ingredientName={item.naam}
                                                                ingredientUnit={item.unit || 'kg'}
                                                                estimatedPrice={Number.isFinite(estPrice) ? estPrice : null}
                                                                onResult={(fix) => applyEstimateFix(idx, fix)}
                                                            />
                                                        )}
                                                    </div>
                                                    <button type="button" className="tag-remove" onClick={function () { removeCostItem(idx); }}>×</button>
                                                </div>
                                            );
                                        })}

                                        <div className="ingredient-cost-total">
                                            <span>Totale Foodcost p.p.</span>
                                            <span className="ingredient-cost-total-value">€{totalFoodcostPP.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div className="field" style={{ flex: 2, minWidth: 160 }}>
                                        <label>Ingrediënt</label>
                                        <InventoryAutocomplete
                                            inventory={inventoryData as unknown as InventoryRow[]}
                                            value={costInput.naam}
                                            onChange={pickFromInventory}
                                            onCommit={addCostItem}
                                            placeholder="Tik 3+ letters, bv. 'ker' voor kerrie…"
                                        />
                                    </div>
                                    <div className="field" style={{ minWidth: 70, flex: '0 1 80px' }}>
                                        <label>Qty p.p.</label>
                                        <input type="number" step="0.01" min="0" value={costInput.qty_pp}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setCostInput(Object.assign({}, costInput, { qty_pp: e.target.value })); }}
                                            placeholder="0.08" style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Eenheid</label>
                                        <select value={costInput.unit} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setCostInput(Object.assign({}, costInput, { unit: e.target.value })); }}
                                            style={{ fontSize: 12, padding: '7px 6px' }}>
                                            {COST_UNITS.map(function (u) { return <option key={u} value={u}>{u}</option>; })}
                                        </select>
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Yield</label>
                                        <input type="number" step="0.05" min="0.1" max="1" value={costInput.yield}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setCostInput(Object.assign({}, costInput, { yield: parseFloat(e.target.value) || 1.0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <button type="button" className="btn btn-brand btn-sm" onClick={addCostItem} style={{ height: 34 }}>+</button>
                                </div>
                            </div>

                            <div className="field">
                                <label>⚠️ Allergenen <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.allergenen || []).map(function (a: string, idx: number) {
                                            return (
                                                <span key={idx} className="allergen-tag">
                                                    {a}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('allergenen', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={allergeenInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setAllergeenInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('allergenen', allergeenInput, setAllergeenInput, e); }}
                                        placeholder="Typ allergeen + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {ALLERGENEN_PRESETS.filter(function (p) { return !(form.allergenen || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('allergenen', p, setAllergeenInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            <div className="field">
                                <label>🏷️ Labels <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.tags || []).map(function (t: string, idx: number) {
                                            return (
                                                <span key={idx} className="label-tag">
                                                    {t}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('tags', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={labelInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setLabelInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('tags', labelInput, setLabelInput, e); }}
                                        placeholder="Typ label + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {TAG_PRESETS.filter(function (p) { return !(form.tags || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('tags', p, setLabelInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            <div className="form-grid">
                                <div className="field">
                                    <label>Kostprijs p.p. <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                    <input type="number" step="0.01" value={form.kostprijs_pp || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} placeholder="€0.00" />
                                </div>
                                <div className="field">
                                    <label>Volgorde</label>
                                    <input type="number" value={form.volgorde != null ? form.volgorde : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                            </div>

                            <div className="field">
                                <label>Status</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button
                                        type="button"
                                        onClick={function () { setForm(Object.assign({}, form, { actief: !form.actief })); }}
                                        style={{
                                            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                            fontWeight: 700, fontSize: 12, transition: 'all .15s',
                                            background: form.actief ? 'rgba(74,222,128,.15)' : 'rgba(239,68,68,.1)',
                                            color: form.actief ? 'var(--green)' : 'var(--red)',
                                        }}
                                    >
                                        {form.actief ? 'Actief' : 'Inactief'}
                                    </button>
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        {form.actief ? 'Zichtbaar in offertes en menu' : 'Verborgen — niet beschikbaar voor offertes'}
                                    </span>
                                </div>
                            </div>

                            {/* AI-INZICHTEN sectie — pijnpunten/toppunten/marge%/foto-prompt */}
                            {(form.foto_prompt || (form.pijnpunten && form.pijnpunten.length > 0) || (form.toppunten && form.toppunten.length > 0) || form.marge_pct != null) && (
                                <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: 'rgba(167,139,250,.05)', border: '1px solid rgba(167,139,250,.25)' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple, #a78bfa)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                                        ✦ AI-inzichten
                                    </div>

                                    {form.marge_pct != null && (
                                        <div style={{ marginBottom: 10, fontSize: 12 }}>
                                            <span style={{ color: 'var(--muted)' }}>Marge: </span>
                                            <strong style={{ color: form.marge_pct >= 70 ? 'var(--green)' : form.marge_pct >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                                                {form.marge_pct >= 70 ? '🟢' : form.marge_pct >= 60 ? '🟠' : '🔴'} {form.marge_pct}%
                                            </strong>
                                        </div>
                                    )}

                                    {form.toppunten && form.toppunten.length > 0 && (
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>↑ TOPPUNTEN</div>
                                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                                                {(form.toppunten as string[]).map(function (p, i) { return <li key={i}>{p}</li>; })}
                                            </ul>
                                        </div>
                                    )}

                                    {form.pijnpunten && form.pijnpunten.length > 0 && (
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>↓ PIJNPUNTEN</div>
                                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                                                {(form.pijnpunten as string[]).map(function (p, i) { return <li key={i}>{p}</li>; })}
                                            </ul>
                                        </div>
                                    )}

                                    {form.foto_prompt && (
                                        <FotoPromptKnop text={form.foto_prompt as string} />
                                    )}
                                </div>
                            )}

                            {editing !== 'new' && stats && (
                                <div className="gerecht-stats-panel">
                                    <div className="gerecht-stats-title">Statistieken</div>
                                    <div className="gerecht-stats-grid">
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.offCount}</div>
                                            <div className="gerecht-stat-label">Offertes</div>
                                        </div>
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.servedCount}</div>
                                            <div className="gerecht-stat-label">Geserveerd</div>
                                        </div>
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.avgTime ? formatTime(stats.avgTime) : '—'}</div>
                                            <div className="gerecht-stat-label">Gem. Tijd</div>
                                        </div>
                                    </div>
                                    {stats.offList.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Gebruikt in:</div>
                                            {stats.offList.map(function (o, i: number) {
                                                return (
                                                    <div key={i} style={{ fontSize: 12, padding: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{o.naam}</span>
                                                        <span style={{ color: 'var(--muted)' }}>{o.datum}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Compleetheid-meter — toont in één oogopslag wat nog mist
                            voordat een concept geactiveerd kan worden. */}
                        {(function () {
                            const checks = checklistVoor(form);
                            const okCount = checks.filter(c => c.ok).length;
                            const total = checks.length;
                            const pct = Math.round((okCount / total) * 100);
                            const currentStatus = form.status || (editing === 'new' ? 'actief' : 'inactief');
                            const isConcept = currentStatus === 'concept' || currentStatus === 'review_nodig';
                            return (
                                <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Compleetheid</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{okCount} / {total}</div>
                                    </div>
                                    <div style={{ height: 6, background: 'var(--color-bg-deep)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                                        <div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? '#22c55e' : pct >= 60 ? '#FFBF00' : '#f59e0b', transition: 'width .3s' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {checks.map(c => (
                                            <span key={c.label} style={{
                                                fontSize: 11,
                                                padding: '3px 8px',
                                                borderRadius: 4,
                                                background: c.ok ? 'rgba(34,197,94,.1)' : 'rgba(245,158,11,.1)',
                                                color: c.ok ? '#22c55e' : '#f59e0b',
                                                fontWeight: 600,
                                            }}>
                                                {c.ok ? '✓' : '○'} {c.label}
                                            </span>
                                        ))}
                                    </div>
                                    {isConcept && pct >= 100 && (
                                        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', fontSize: 12, color: '#22c55e' }}>
                                            ✓ Compleet — klaar om te activeren met de knop hieronder.
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Geschiedenis-sectie — alleen voor bestaande gerechten.
                            Pillar #5: audit-trail voor compliance + dispute-resolution. */}
                        {editing !== 'new' && (
                            <div style={{ marginTop: 14 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    Geschiedenis
                                </div>
                                <AuditTrailTimeline recordTable="gerechten" recordId={editing as number} />
                            </div>
                        )}

                        <div className="modal-actions">
                            {editing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGerecht(editing as number); }}>Verwijderen</button>}
                            {/* Status-toggle: concept/review → activeer · actief → deactiveer · inactief → activeer */}
                            {editing !== 'new' && (function () {
                                const cur = form.status || (form.actief === false ? 'inactief' : 'actief');
                                if (cur === 'concept' || cur === 'review_nodig') {
                                    return (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={function () { setForm(Object.assign({}, form, { status: 'actief' })); }}
                                            style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,.4)' }}
                                            title="Maak klant-klaar — verschijnt dan in de offerte-wizard"
                                        >
                                            ✓ Activeer
                                        </button>
                                    );
                                }
                                if (cur === 'actief') {
                                    return (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={function () { setForm(Object.assign({}, form, { status: 'inactief' })); }}
                                            title="Verberg uit offerte-wizard zonder te verwijderen"
                                        >
                                            Deactiveer
                                        </button>
                                    );
                                }
                                return (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={function () { setForm(Object.assign({}, form, { status: 'actief' })); }}
                                        style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,.4)' }}
                                    >
                                        ✓ Activeer
                                    </button>
                                );
                            })()}
                            {/* AI-allergeen-toggle: Sam wil de keuze of de AI bij opslaan
                                meedraait. Standaard aan. Uit = direct opslaan, geen AI-call. */}
                            <button
                                type="button"
                                onClick={function () { setAiAllergenEnabled(!aiAllergenEnabled); }}
                                title={aiAllergenEnabled ? 'AI-allergeencheck staat aan — klik om uit te zetten' : 'AI-allergeencheck staat uit — klik om aan te zetten'}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 'auto',
                                    padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    background: aiAllergenEnabled ? 'rgba(196,163,90,.12)' : 'rgba(255,255,255,.04)',
                                    border: '1px solid ' + (aiAllergenEnabled ? 'rgba(196,163,90,.35)' : 'rgba(255,255,255,.12)'),
                                    color: aiAllergenEnabled ? '#c4a35a' : 'var(--muted)',
                                }}
                            >
                                <span style={{
                                    width: 28, height: 16, borderRadius: 8, position: 'relative', transition: 'background .15s',
                                    background: aiAllergenEnabled ? '#c4a35a' : 'rgba(255,255,255,.2)', flexShrink: 0,
                                }}>
                                    <span style={{
                                        position: 'absolute', top: 2, left: aiAllergenEnabled ? 14 : 2, width: 12, height: 12,
                                        borderRadius: 6, background: '#fff', transition: 'left .15s',
                                    }} />
                                </span>
                                ✦ AI-allergeencheck
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={aiSaving} onClick={function () { setEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" disabled={aiSaving} onClick={saveGerecht}>
                                {aiSaving ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span className="spinner-ring" style={{
                                            width: 13, height: 13, border: '2px solid rgba(0,0,0,.25)', borderTopColor: '#000',
                                            borderRadius: '50%', display: 'inline-block', animation: 'spin .6s linear infinite',
                                        }} />
                                        AI checkt allergenen...
                                    </span>
                                ) : 'Opslaan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {gangEditing && (
                <div className="modal-bg" onClick={function (e: React.MouseEvent<HTMLDivElement>) { if (e.target === e.currentTarget) setGangEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 440, width: '100%' }}>
                        <h3>{gangEditing === 'new' ? 'Nieuwe gang' : 'Gang bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                            <div className="field">
                                <label>Naam</label>
                                <input value={gangForm.naam || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { naam: e.target.value })); }} placeholder="bijv. Bites" />
                            </div>
                            <div className="field">
                                <label>Slug (code-naam)</label>
                                <input value={gangForm.slug || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })); }} placeholder="bijv. bites" />
                            </div>
                            <div className="form-grid">
                                <div className="field">
                                    <label>Minimum selectie</label>
                                    <input type="number" value={gangForm.minimum != null ? gangForm.minimum : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { minimum: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                                <div className="field">
                                    <label>Extra prijs p.p. (€)</label>
                                    <input type="number" step="0.25" value={gangForm.extra_prijs_pp != null ? gangForm.extra_prijs_pp : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { extra_prijs_pp: e.target.value === '' ? '' : parseFloat(e.target.value) })); }} />
                                </div>
                            </div>
                            <div className="field">
                                <label>Volgorde</label>
                                <input type="number" value={gangForm.volgorde != null ? gangForm.volgorde : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {gangEditing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGang(gangEditing as number); }}>Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setGangEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGang}>Opslaan</button>
                        </div>
                    </div>
                </div>
            )}
            {followUpActions && (
                <FollowUpPrompt
                    title={followUpTitle}
                    actions={followUpActions}
                    onDismiss={function () { setFollowUpActions(null); }}
                    autoHideMs={15000}
                />
            )}

            {/* Bucket C (2026-05-25) — Detail drawer (klik op kaart).
                key={inspectingGerecht?.id} dwingt remount zodat tab-state reset bij
                nieuwe gerecht — vermijdt setState-in-effect. */}
            <GerechtDetailDrawer
                key={inspectingGerecht?.id ?? 'none'}
                open={!!inspectingGerecht}
                gerecht={inspectingGerecht}
                gangen={gangen}
                onClose={() => setInspectingGerecht(null)}
                onEdit={(g) => { setInspectingGerecht(null); editGerecht(g); }}
                onDuplicate={(g) => {
                    setInspectingGerecht(null);
                    /* Dupliceer-flow: vul form vanuit g, zet ID op 'new'. */
                    setEditing('new');
                    setForm({
                        ...g,
                        naam: g.naam + ' (kopie)',
                        id: undefined,
                    } as Record<string, any>);
                }}
                onDelete={(g) => { setInspectingGerecht(null); deleteGerecht(g.id); }}
                onAllergenCheck={async (g) => {
                    /* Bouw AllergenRow[] uit detected allergens en open modal. */
                    const detected = await detectAllergensViaAi({
                        naam: g.naam,
                        ingredient_costs: (g as any).ingredient_costs,
                        ingredienten: g.ingredienten,
                    });
                    const existing = g.allergenen ?? [];
                    const newOnes = detected.filter((a) => !existing.includes(a));
                    if (newOnes.length === 0) {
                        showToast('Geen nieuwe allergenen gedetecteerd', 'success');
                        return;
                    }
                    setAllergenModalRows(newOnes.map((a, i) => ({
                        id: `recheck-${g.id}-${i}`,
                        allergen: a,
                        source: `AI-detectie via ingrediënten van "${g.naam}"`,
                        confidence: 85,
                    })));
                }}
            />

            {/* AllergenConfirmModal — geactiveerd door drawer "Hercheck" of toekomstige
                saveGerecht-hook. Bevestigde rijen worden in volgende sessie naar
                Supabase componenten_allergens.confirmed_at gepatched. */}
            <AllergenConfirmModal
                open={allergenModalRows.length > 0}
                rows={allergenModalRows}
                onClose={() => {
                    /* Sluiten zonder beslissing: pending-save annuleren zodat
                       de oude form-state behouden blijft (user kan opnieuw save). */
                    setAllergenModalRows([]);
                    setPendingAllergenSave(null);
                }}
                onSubmit={async ({ confirmed, rejected }) => {
                    /* P0-A flow:
                       - Pending = save in progress → merge confirmed allergens en commit
                       - Geen pending = standalone "Hercheck" uit drawer → toast-only */
                    if (pendingAllergenSave) {
                        /* Extract de allergeen-namen uit de confirmed IDs (vorm: "save-{idx}-{allergen}") */
                        const confirmedAllergens = confirmed
                            .map(id => allergenModalRows.find(r => r.id === id)?.allergen)
                            .filter((a): a is string => Boolean(a));
                        const existing = Array.isArray(pendingAllergenSave.allergenen) ? pendingAllergenSave.allergenen : [];
                        const merged = [...new Set([...existing, ...confirmedAllergens])];
                        const finalSaveData = { ...pendingAllergenSave, allergenen: merged };
                        if (confirmedAllergens.length > 0) {
                            showToast(`${confirmedAllergens.length} allergeen${confirmedAllergens.length === 1 ? '' : 'en'} toegevoegd`, 'success');
                        }
                        if (rejected.length > 0) {
                            showToast(`${rejected.length} verworpen`, 'info');
                        }
                        setAllergenModalRows([]);
                        setPendingAllergenSave(null);
                        await commitSave(finalSaveData);
                    } else {
                        /* Standalone hercheck uit drawer — voor nu toast-only.
                           DB-write naar component_allergens.confirmed_at komt in volgende ronde. */
                        showToast(`${confirmed.length} bevestigd, ${rejected.length} verworpen`, 'success');
                        setAllergenModalRows([]);
                    }
                }}
            />

            {/* Lokale BedenkerModal — voor de "+ Bedenk met AI" knop in header.
                URL-driven flow (?modal=bedenker via middleware /bedenker redirect)
                loopt via MenuHubModalMounts in /gerechten/layout.tsx. */}
            <BedenkerModal
                open={bedenkerOpen}
                onClose={() => setBedenkerOpen(false)}
                onAccept={(result) => {
                    setBedenkerOpen(false);
                    /* Maak gerecht-form aan met AI-resultaat als basis. */
                    setEditing('new');
                    setForm({
                        naam: result.name,
                        beschrijving: result.desc,
                        gang_slug: activeGang ?? gangen[0]?.slug,
                        kostprijs_pp: result.cost,
                        verkoopprijs: result.price,
                        bron: 'ai',
                        status: 'concept',
                        ingredienten: result.components,
                        allergenen: [],
                        tags: [],
                        ingredient_costs: [],
                    } as Record<string, any>);
                }}
            />

            {/* MenuCommandPalette — ⌘K shortcut via useCmdKShortcut hook bovenin. */}
            <MenuCommandPalette
                open={cmdkOpen}
                onClose={() => setCmdkOpen(false)}
                gerechten={gerechten}
                onSelectGerecht={(g) => { setCmdkOpen(false); setInspectingGerecht(g); }}
                onAction={(id) => {
                    setCmdkOpen(false);
                    if (id === 'bedenker') setBedenkerOpen(true);
                    if (id === 'allergens') {
                        /* Open allergens-queue modal — voor nu navigeert hij naar de
                           AllergenQueueBanner sectie via een toast-hint. */
                        showToast('Allergen-queue: klik banner bovenaan om openstaande rijen te zien', 'info');
                    }
                }}
            />
        </div>
    );
}

// Compacte foto-prompt knop met Kopieer + Toon-toggle.
// Verschijnt in de gerecht edit-modal — maakt de AI-foto-prompt direct
// te kopiëren naar GPT Image 2 / Imagen / Poe zonder dat de lange prompt
// het edit-formulier vol-typt.
function FotoPromptKnop({ text }: { text: string }): React.ReactElement {
    const [copied, setCopied] = useState(false);
    const [show, setShow] = useState(false);
    function copy(): void {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function () {
                setCopied(true);
                setTimeout(function () { setCopied(false); }, 1800);
            }).catch(function () { /* noop */ });
        }
    }
    return (
        <div style={{ marginTop: 6, padding: 10, borderRadius: 8, background: 'rgba(167,139,250,.07)', border: '1px dashed rgba(167,139,250,.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple, #a78bfa)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    📸 AI foto-prompt (Poe / GPT Image 2)
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setShow(function (v) { return !v; })}
                        style={{ background: 'none', border: '1px solid rgba(167,139,250,.4)', color: 'var(--purple, #a78bfa)', padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {show ? 'Verberg' : 'Toon'}
                    </button>
                    <button type="button" onClick={copy}
                        style={{ background: copied ? 'var(--purple, #a78bfa)' : 'none', border: '1px solid rgba(167,139,250,.4)', color: copied ? '#000' : 'var(--purple, #a78bfa)', padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {copied ? '✓ Gekopieerd' : '📋 Kopieer prompt'}
                    </button>
                </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                Plak deze prompt in Poe (GPT Image 2) of een andere image-AI om een foto van dit gerecht te genereren.
            </div>
            {show && (
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, fontFamily: 'var(--font-mono, monospace)', marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,.3)', borderRadius: 5, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{text}</div>
            )}
        </div>
    );
}
