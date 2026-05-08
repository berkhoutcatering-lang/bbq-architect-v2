'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Filter, Lightbulb, ThumbsDown, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import RichKeukenTabs from '@/components/RichKeukenTabs';
import PageGuideNote from '@/components/PageGuideNote';

import PromptHero from './_components/PromptHero';
import HowItWorksStrip from './_components/HowItWorksStrip';
import ConceptCard, { SkeletonCard } from './_components/ConceptCard';
import ConceptDrawer from './_components/ConceptDrawer';
import HistoryRail from './_components/HistoryRail';
import SavedTray from './_components/SavedTray';
import AIThinkingTrail from './_components/AIThinkingTrail';
import BedenkerPageHero from './_components/BedenkerPageHero';
import BedenkerKpiTiles from './_components/BedenkerKpiTiles';
import LatestConceptSpotlight from './_components/LatestConceptSpotlight';
import StudioBackground from './_components/StudioBackground';
import { mapApiToConcept, conceptToGerechtPayload } from './_components/mapping';
import type { Concept } from './_components/types';
import {
  useConceptHistory,
  type BedenkMode,
  type ModeContext,
  type ConceptHistoryRow,
} from './_components/useConceptHistory';

const VERRAS_PROMPTS_VRIJ = [
  'Verrassend hoofdgerecht in BBQ-stijl voor 60 personen — gebruik een seizoens-ingredient',
  'Borrelhapje dat niemand nog op een BBQ heeft gedaan',
  'Smoke-dessert dat past bij een zomeravond',
  'Plantaardig hoofdgerecht dat vleeseters wegblaast',
  'Aziatische twist op een Hop & Bites-klassieker',
  'Streetfood-concept met pulled pork in een nieuw jasje',
  'Side-dish die de hoofdgerechten steelt — comfort food twist',
  'Fine-dining hapje uit BBQ-restjes (zero-waste, signature)',
];

const VERRAS_PROMPTS_VOORRAAD = [
  'Maak hier iets pittigs van voor de lunch',
  'Bedenk een zero-waste finger-food uit deze restjes',
  'Comfort-gerecht op basis van deze ingrediënten',
];

const VERRAS_PROMPTS_KLANT = [
  'Een gerecht dat indruk maakt zonder te zwaar te worden',
  'Iets feestelijks dat past bij de gelegenheid',
  'Verras de gasten met een onverwachte twist',
];

const VERRAS_VOORRAAD_FILLERS = [
  '2kg pulled pork over, 500g cheddar, 1kg ui',
  '5kg paprika, 1kg feta, 200g basilicum, 500g rijst',
  '3kg kipdijen, 1kg champignon, 500g spinazie',
  'Restjes brisket 1.5kg + 2kg bonen + 500g ui',
];

interface ExistingDish {
  id?: number | string;
  naam: string;
  gang_slug?: string;
  tags?: string[];
}

const HOWTO_DISMISS_KEY = 'bbq.bedenker.howto.dismissed.v1';

type SortKey = 'confidence' | 'margin' | 'prep' | 'risk';

/** Concept-id (lokaal) → concept_history row-id (UUID) zodat we bij save ook de
 *  history-rij kunnen markeren als 'bewaard'. */
type ConceptHistoryMap = Record<string, string>;

export default function BedenkerPage() {
  const showToast = useToast();
  const { orgId } = useOrg();
  const conceptHistory = useConceptHistory();

  const [prompt, setPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [bestaande, setBestaande] = useState<ExistingDish[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openConcept, setOpenConcept] = useState<Concept | null>(null);
  const [showHow, setShowHow] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('confidence');

  /** Mode + per-mode context. Vrij = open brainstorm, voorraad = restjes-input,
   *  klant = wizard-feeder met dieet/budget/gasten. */
  const [mode, setMode] = useState<BedenkMode>('vrij');
  const [modeContext, setModeContext] = useState<ModeContext>({});

  /** concept-id → concept_history.id mapping voor save-tracking */
  const [conceptToHistory, setConceptToHistory] = useState<ConceptHistoryMap>({});

  // Latest gerecht voor de spotlight — accepteert UUID-string of bigint id
  interface LatestConcept {
    id: number | string;
    naam: string;
    beschrijving?: string;
    glyph?: string;
    gang_naam?: string;
    created_at?: string;
    kostprijs_pp?: number;
    marge_pct?: number;
  }
  const [latestSavedConcept, setLatestSavedConcept] = useState<LatestConcept | null>(null);

  useEffect(() => {
    if (!orgId) return;
    // Eerst: pak meest recent BEWAARDE concept_history-entry (= via /bedenker
    // opgeslagen). Pas als daar geen rij is, fallback op meest recent toegevoegd
    // gerecht overall — zodat de spotlight niet leeg blijft bij een verse account.
    supabase
      .from('concept_history')
      .select('saved_gerecht_id, naam, tagline, glyph, categorie, saved_at, kostprijs_pp, marge_pct')
      .eq('organization_id', orgId)
      .eq('status', 'bewaard')
      .not('saved_gerecht_id', 'is', null)
      .order('saved_at', { ascending: false })
      .limit(1)
      .then((res) => {
        if (res.data && res.data.length > 0) {
          const r = res.data[0] as {
            saved_gerecht_id: string;
            naam: string;
            tagline: string | null;
            glyph: string | null;
            categorie: string | null;
            saved_at: string;
            kostprijs_pp: number | null;
            marge_pct: number | null;
          };
          setLatestSavedConcept({
            id: r.saved_gerecht_id,
            naam: r.naam,
            beschrijving: r.tagline ?? undefined,
            glyph: r.glyph ?? '✨',
            gang_naam: r.categorie ?? undefined,
            created_at: r.saved_at,
            kostprijs_pp: r.kostprijs_pp ?? undefined,
            marge_pct: r.marge_pct ?? undefined,
          });
          return;
        }
        // Fallback: meest recent overall
        supabase
          .from('gerechten')
          .select('id, naam, beschrijving, gang_slug, created_at, kostprijs_pp, marge_pct')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1)
          .then((r2) => {
            if (r2.data && r2.data.length > 0) {
              const r = r2.data[0];
              const name = (r.naam || '').toLowerCase();
              const glyph = /watermel|meloen/i.test(name)
                ? '🍉'
                : /taco/i.test(name)
                ? '🌮'
                : /brisket|burnt/i.test(name)
                ? '🥩'
                : /tofu|vegan/i.test(name)
                ? '🌱'
                : /chocola|brownie/i.test(name)
                ? '🍫'
                : /bonbon|spies/i.test(name)
                ? '🍢'
                : '✨';
              setLatestSavedConcept({
                id: r.id,
                naam: r.naam,
                beschrijving: r.beschrijving,
                glyph,
                gang_naam: r.gang_slug,
                created_at: r.created_at,
                kostprijs_pp: r.kostprijs_pp,
                marge_pct: r.marge_pct,
              });
            }
          });
      });
  }, [orgId]);

  // Load existing dishes (style reference)
  useEffect(() => {
    supabase
      .from('gerechten')
      .select('id,naam,gang_slug,tags')
      .limit(80)
      .then((res) => setBestaande((res.data as ExistingDish[]) || []));
  }, []);

  // Howto-dismiss blijft op localStorage — pure UI-preference, geen team-state
  useEffect(() => {
    try {
      if (localStorage.getItem(HOWTO_DISMISS_KEY) === '1') setShowHow(false);
    } catch {
      /* noop */
    }
  }, []);

  function dismissHow() {
    setShowHow(false);
    try {
      localStorage.setItem(HOWTO_DISMISS_KEY, '1');
    } catch {
      /* noop */
    }
  }

  async function fetchOneConcept(p: string): Promise<{ concept: Concept; raw: Record<string, unknown> } | null> {
    try {
      const res = await fetch('/api/recipe-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p,
          mode: 'recipe',
          existing: bestaande.map((g) => ({ naam: g.naam, gang: g.gang_slug, tags: g.tags })),
          options: {
            flavour: mode,
            flavourContext: modeContext,
            porties: modeContext.gasten,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.data) return null;
      return { concept: mapApiToConcept(body.data, p, bestaande), raw: body.data };
    } catch {
      return null;
    }
  }

  /** Bouw de effectieve prompt — voor klant- en voorraad-mode voegt deze
   *  automatisch de context toe als die expliciet is ingevuld. */
  function buildEffectivePrompt(): string {
    if (mode === 'voorraad') {
      const voorraad = (modeContext.voorraad || '').trim();
      const userText = prompt.trim();
      if (!voorraad && !userText) return '';
      if (!userText) return `Bedenk een gerecht uit deze restjes: ${voorraad}`;
      if (!voorraad) return userText;
      return `${userText} — uit deze restjes: ${voorraad}`;
    }
    if (mode === 'klant') {
      const userText = prompt.trim();
      const parts: string[] = [];
      if (modeContext.gasten) parts.push(`${modeContext.gasten} gasten`);
      if (modeContext.budget_pp) parts.push(`budget €${modeContext.budget_pp} p.p.`);
      if (modeContext.dieet?.length) parts.push(`dieet: ${modeContext.dieet.join(', ')}`);
      if (modeContext.context) parts.push(modeContext.context);
      const klantCtx = parts.join(' · ');
      if (!userText && !klantCtx) return '';
      if (!userText) return `Bedenk een BBQ-gerecht voor deze klant: ${klantCtx}`;
      if (!klantCtx) return userText;
      return `${userText} — voor klant: ${klantCtx}`;
    }
    return prompt;
  }

  /** Controleer of generatie mogelijk is, ook als alleen context-velden zijn ingevuld. */
  function canGenerate(): boolean {
    if (mode === 'klant') {
      return !!(prompt.trim() || modeContext.gasten || modeContext.budget_pp || modeContext.context);
    }
    if (mode === 'voorraad') {
      return !!(prompt.trim() || (modeContext.voorraad || '').trim());
    }
    return !!prompt.trim();
  }

  async function bedenk() {
    return bedenkWithPrompt(buildEffectivePrompt());
  }

  async function bedenkWithPrompt(p: string) {
    if (!p.trim() || busy) return;
    setBusy(true);
    setError(null);
    setLastPrompt(p);

    try {
      // Fire 3 parallel calls — variety via repeated prompts
      const variants = [p, `${p} (alternatieve aanpak)`, `${p} (creatieve twist)`];
      const results = await Promise.all(variants.map((v) => fetchOneConcept(v)));
      const ok = results.filter((c): c is { concept: Concept; raw: Record<string, unknown> } => c !== null);
      if (ok.length === 0) {
        setError('AI gaf geen geldige concepten terug. Probeer het opnieuw of verfijn de prompt.');
        showToast({ type: 'error', message: 'Geen concepten gegenereerd' });
        return;
      }
      const newConcepts = ok.map((r) => r.concept);
      setConcepts(newConcepts);

      // Persist alle 3 concepten naar concept_history (parallel, fire-and-forget
      // failures want UI moet niet vastlopen op één DB-fout). Mappingstap onthoudt
      // welke concept-id bij welke history-row hoort, voor latere markBewaard.
      const inserts = await Promise.all(
        ok.map((r) =>
          conceptHistory.insertConcept({
            concept: r.concept,
            prompt: p,
            mode,
            modeContext,
            body: r.raw,
          }),
        ),
      );
      const newMap: ConceptHistoryMap = { ...conceptToHistory };
      ok.forEach((r, idx) => {
        const histRow = inserts[idx];
        if (histRow) newMap[r.concept.id] = histRow.id;
      });
      setConceptToHistory(newMap);
    } catch (e) {
      setError((e as Error).message || 'Onbekende fout');
      showToast({ type: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function bewaarConcept(c: Concept) {
    if (!orgId) {
      showToast({ type: 'error', message: 'Geen organisatie-context — opnieuw inloggen?' });
      return;
    }
    setConcepts((prev) => prev.map((p) => (p.id === c.id ? { ...p, saveState: 'saving' } : p)));
    try {
      const payload = conceptToGerechtPayload(c, orgId);
      const { data: inserted, error: dbErr } = await supabase
        .from('gerechten')
        .insert([payload])
        .select('id')
        .single();
      if (dbErr) throw new Error(dbErr.message);
      setConcepts((prev) => prev.map((p) => (p.id === c.id ? { ...p, saveState: 'saved' } : p)));

      // Mark concept_history-row als bewaard zodat KPI-tile updatet en
      // andere team-leden in realtime zien dat er iets is opgeslagen.
      const histId = conceptToHistory[c.id];
      if (histId && inserted?.id) {
        conceptHistory.markBewaard(histId, inserted.id as string);
      }

      showToast({
        type: 'success',
        message: 'Concept opgeslagen',
        title: 'Bewaard',
      });
    } catch (e) {
      setConcepts((prev) =>
        prev.map((p) => (p.id === c.id ? { ...p, saveState: 'error', saveError: (e as Error).message } : p)),
      );
      showToast({ type: 'error', title: 'Fout bij opslaan', message: (e as Error).message });
    }
  }

  const sortedConcepts = useMemo(() => {
    const arr = [...concepts];
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'margin':
          return b.margin - a.margin;
        case 'prep':
          return a.prepTime - b.prepTime;
        case 'risk': {
          const order = { low: 0, medium: 1, high: 2 } as const;
          return order[a.risk] - order[b.risk];
        }
        case 'confidence':
        default:
          return b.confidence - a.confidence;
      }
    });
    return arr;
  }, [concepts, sortBy]);

  const savedConcepts = concepts.filter((c) => c.saveState === 'saved' || c.saved);

  const truncatedPrompt = lastPrompt.length > 40 ? lastPrompt.slice(0, 40) + '…' : lastPrompt;

  // HistoryRail werkt op (prompt, total, saved, date) — aggregeer concept_history
  // rows hierop. Zelfde prompt-tekst binnen 1 sessie = 1 entry.
  const historyAggregated = useMemo(() => {
    const map = new Map<string, { id: string; prompt: string; date: string; total: number; saved: number; created: number }>();
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    conceptHistory.rows
      .filter((r) => r.status !== 'verlopen')
      .forEach((r) => {
        const dt = new Date(r.created_at);
        const dayKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${r.prompt.toLowerCase().slice(0, 60)}`;
        const dateLabel = `${dt.getDate()} ${months[dt.getMonth()]}`;
        const existing = map.get(dayKey);
        if (existing) {
          existing.total += 1;
          if (r.status === 'bewaard') existing.saved += 1;
          if (dt.getTime() > existing.created) existing.created = dt.getTime();
        } else {
          map.set(dayKey, {
            id: r.id,
            prompt: r.prompt,
            date: dateLabel,
            total: 1,
            saved: r.status === 'bewaard' ? 1 : 0,
            created: dt.getTime(),
          });
        }
      });
    return Array.from(map.values())
      .sort((a, b) => b.created - a.created)
      .slice(0, 12);
  }, [conceptHistory.rows]);

  // KPI data — primair uit concept_history (echte multi-tenant data), fallback
  // op huidige sessie als de migration nog niet draait.
  const stats = conceptHistory.stats;
  const sessionInspiraties = useMemo(() => {
    const set = new Set<string>();
    concepts.forEach((c) => c.inspiredBy.forEach((p) => set.add(p.name)));
    return set.size;
  }, [concepts]);

  const totaalBedacht = stats.totaalBedacht || concepts.length;
  const totaalBewaard = stats.totaalBewaard || savedConcepts.length;
  const inspiratiesUniek = stats.inspiratiesUniek || sessionInspiraties;
  const gemConfidence =
    stats.gemConfidence > 0
      ? stats.gemConfidence
      : concepts.length > 0
      ? concepts.reduce((s, c) => s + c.confidence, 0) / concepts.length
      : 0;

  function verrasMe() {
    const pool =
      mode === 'voorraad'
        ? VERRAS_PROMPTS_VOORRAAD
        : mode === 'klant'
        ? VERRAS_PROMPTS_KLANT
        : VERRAS_PROMPTS_VRIJ;
    const random = pool[Math.floor(Math.random() * pool.length)];
    setPrompt(random);

    // In voorraad-mode: vul ook een willekeurige restjes-set, zodat verras-me
    // direct een complete query oplevert zonder dat Sam handmatig moet typen.
    if (mode === 'voorraad' && !modeContext.voorraad?.trim()) {
      const filler = VERRAS_VOORRAAD_FILLERS[Math.floor(Math.random() * VERRAS_VOORRAAD_FILLERS.length)];
      setModeContext({ ...modeContext, voorraad: filler });
    }

    setTimeout(() => {
      // buildEffectivePrompt leest uit state, dus we wachten één tick op de re-render.
      bedenk();
    }, 250);
  }

  return (
    <div className="main-content mobile-safe-bottom" style={{ maxWidth: 1500, position: 'relative', zIndex: 1 }}>
      <StudioBackground />
      <RichKeukenTabs />
      <PageGuideNote
        id="bedenker"
        accent="#a78bfa"
        icon={Sparkles}
        intro="AI-brainstormstudio: laat de bedenker nieuwe gerechten verzinnen — vrij, op basis van voorraad, of voor een specifieke klant."
        actions={[
          { lead: 'Kies een mode bovenin', text: '— Vrij voor verrassingen, Voorraad om restjes weg te werken, Klant voor een gerichte event-vraag.' },
          { lead: 'Sleep een concept naar de tray', text: 'om er later van te maken wat je wilt — opslaan als gerecht of door de wizard halen.' },
          { lead: 'Niets is opgeslagen tot jij dat wilt.', text: 'Concepten zijn brainstorm — pas als je Maak gerecht klikt landt het in de bibliotheek.' },
        ]}
      />
      <BedenkerPageHero onVerrasMe={verrasMe} busy={busy} />

      <BedenkerKpiTiles
        conceptenBedacht={totaalBedacht}
        conceptenBewaard={totaalBewaard}
        inspiratiesUniek={inspiratiesUniek}
        gemConfidence={gemConfidence}
      />

      {latestSavedConcept && (
        <LatestConceptSpotlight
          name={latestSavedConcept.naam}
          tagline={latestSavedConcept.beschrijving}
          glyph={latestSavedConcept.glyph}
          category={latestSavedConcept.gang_naam}
          bewaardOp={latestSavedConcept.created_at}
          kostprijsPp={latestSavedConcept.kostprijs_pp}
          margePct={latestSavedConcept.marge_pct}
          href={`/gerechten`}
        />
      )}

      {showHow && <HowItWorksStrip onDismiss={dismissHow} />}

      <PromptHero
        value={prompt}
        onChange={setPrompt}
        onGenerate={bedenk}
        canGenerate={canGenerate()}
        busy={busy}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          // Wis prompt-state als gebruiker switcht naar voorraad — anders blijft
          // er irrelevante tekst staan die een verkeerde leader-prompt vormt.
          if (m === 'voorraad' && prompt.length > 0) setPrompt('');
        }}
        modeContext={modeContext}
        onModeContextChange={setModeContext}
      />

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 10,
            color: '#fca5a5',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Two-col layout: results + history rail */}
      <div className="bedenker-with-rail">
        <div style={{ minWidth: 0 }}>
          {/* Results header (only when there are concepts or busy) */}
          {(busy || concepts.length > 0) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '.22em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    fontWeight: 700,
                  }}
                >
                  {busy ? 'AI bedenkt…' : `${concepts.length} concepten${truncatedPrompt ? ` voor "${truncatedPrompt}"` : ''}`}
                </span>
                {!busy && concepts.length > 0 && (
                  <button
                    onClick={bedenk}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: 'var(--muted)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <RefreshCw size={11} /> Nog 3
                  </button>
                )}
              </div>
              {!busy && concepts.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                  <Filter size={12} />
                  <span>Sorteer op</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    style={{
                      width: 'auto',
                      padding: '4px 8px',
                      fontSize: 11,
                      background: 'rgba(255,255,255,.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="confidence">Confidence</option>
                    <option value="margin">Marge</option>
                    <option value="prep">Prep-tijd</option>
                    <option value="risk">Risk</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Concept grid */}
          {busy ? (
            <>
              <AIThinkingTrail />
              <div className="bedenker-grid">
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </>
          ) : concepts.length === 0 ? (
            <EmptyConceptArea />
          ) : (
            <>
              <div className="bedenker-grid">
                {sortedConcepts.map((c, idx) => (
                  <ConceptCard
                    key={c.id}
                    concept={c}
                    onSave={bewaarConcept}
                    onOpen={setOpenConcept}
                    revealIndex={idx}
                  />
                ))}
              </div>

              {/* Bottom keep-brainstorming row */}
              <div
                style={{
                  marginTop: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 12,
                  fontSize: 12.5,
                  color: 'var(--muted)',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Lightbulb size={14} color="var(--brand-gold)" />
                  Niets bevalt? Verfijn je prompt of vraag een nieuwe ronde aan.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      // Mark unsaved concepts as 'afgewezen' in history zodat
                      // KPI-tile niet vervuilt en team-rooster zuiver blijft.
                      const unsavedIds = concepts
                        .filter((c) => c.saveState !== 'saved')
                        .map((c) => conceptToHistory[c.id])
                        .filter((id): id is string => Boolean(id));
                      if (unsavedIds.length > 0) conceptHistory.markAfgewezen(unsavedIds);
                      setConcepts([]);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ThumbsDown size={12} /> Niets bevalt
                  </button>
                  <button
                    onClick={bedenk}
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={12} /> 3 nieuwe varianten
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <HistoryRail
          items={historyAggregated}
          onPick={(p) => setPrompt(p)}
          onClear={() => {
            // 'Geschiedenis wissen' = alle nieuw-status rows naar 'afgewezen'
            // markeren zodat ze uit de UI verdwijnen maar audit-trail blijft.
            const ids = conceptHistory.rows.filter((r) => r.status === 'nieuw').map((r) => r.id);
            if (ids.length > 0) conceptHistory.markAfgewezen(ids);
          }}
        />
      </div>

      <ConceptDrawer concept={openConcept} onClose={() => setOpenConcept(null)} onSave={bewaarConcept} />
      <SavedTray saved={savedConcepts} onClear={() => setConcepts((prev) => prev.map((c) => ({ ...c, saveState: 'idle' })))} />

      <style jsx>{`
        .bedenker-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 1280px) {
          .bedenker-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 900px) {
          .bedenker-grid {
            grid-template-columns: 1fr;
          }
        }
        .bedenker-with-rail {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 22px;
          align-items: flex-start;
        }
        @media (max-width: 1100px) {
          .bedenker-with-rail {
            grid-template-columns: 1fr;
          }
          .bedenker-with-rail :global(aside) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

function EmptyConceptArea() {
  return (
    <div
      style={{
        border: '1px dashed var(--border-strong)',
        borderRadius: 16,
        padding: '60px 32px',
        textAlign: 'center',
        background: 'rgba(255,255,255,.01)',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          margin: '0 auto 16px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(255,191,0,.1), rgba(167,139,250,.1))',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
        }}
      >
        🔥
      </div>
      <h3 style={{ margin: '0 0 6px', fontWeight: 300, fontSize: 22 }}>Wat zullen we vandaag bedenken?</h3>
      <p
        style={{
          margin: 0,
          color: 'var(--muted)',
          fontSize: 13,
          maxWidth: 460,
          marginInline: 'auto',
          lineHeight: 1.5,
        }}
      >
        Typ een prompt of pak een chip hierboven. AI verzint 3 concept-gerechten, geleund op jouw bestaande receptuur.
      </p>
    </div>
  );
}
