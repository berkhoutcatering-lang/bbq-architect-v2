'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Filter, Lightbulb, ThumbsDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import RichKeukenTabs from '@/components/RichKeukenTabs';

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
import type { Concept, HistoryItem } from './_components/types';

const VERRAS_PROMPTS = [
  'Verrassend hoofdgerecht in BBQ-stijl voor 60 personen — gebruik een seizoens-ingredient',
  'Borrelhapje dat niemand nog op een BBQ heeft gedaan',
  'Smoke-dessert dat past bij een zomeravond',
  'Plantaardig hoofdgerecht dat vleeseters wegblaast',
  'Aziatische twist op een Hop & Bites-klassieker',
  'Streetfood-concept met pulled pork in een nieuw jasje',
  'Side-dish die de hoofdgerechten steelt — comfort food twist',
  'Fine-dining hapje uit BBQ-restjes (zero-waste, signature)',
];

interface ExistingDish {
  id?: number | string;
  naam: string;
  gang_slug?: string;
  tags?: string[];
}

const HISTORY_KEY = 'bbq.bedenker.history.v1';
const HOWTO_DISMISS_KEY = 'bbq.bedenker.howto.dismissed.v1';
const MAX_HISTORY = 12;

type SortKey = 'confidence' | 'margin' | 'prep' | 'risk';

export default function BedenkerPage() {
  const showToast = useToast();
  const { orgId } = useOrg();

  const [prompt, setPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [bestaande, setBestaande] = useState<ExistingDish[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openConcept, setOpenConcept] = useState<Concept | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHow, setShowHow] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('confidence');

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
    // Pak meest recent toegevoegde gerecht — `bron` kolom bestaat niet in
    // huidige DB-schema, dus fallback op meest recent overall.
    supabase
      .from('gerechten')
      .select('id, naam, beschrijving, gang_slug, created_at, kostprijs_pp, marge_pct')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then((res) => {
        if (res.data && res.data.length > 0) {
          const r = res.data[0];
          // Smart glyph keyword match (light version)
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
  }, [orgId]);

  // Load existing dishes (style reference)
  useEffect(() => {
    supabase
      .from('gerechten')
      .select('id,naam,gang_slug,tags')
      .limit(80)
      .then((res) => setBestaande((res.data as ExistingDish[]) || []));
  }, []);

  // Load history + howto-dismiss from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
      if (localStorage.getItem(HOWTO_DISMISS_KEY) === '1') setShowHow(false);
    } catch {
      /* noop */
    }
  }, []);

  function persistHistory(items: HistoryItem[]) {
    setHistory(items);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
    } catch {
      /* noop */
    }
  }

  function dismissHow() {
    setShowHow(false);
    try {
      localStorage.setItem(HOWTO_DISMISS_KEY, '1');
    } catch {
      /* noop */
    }
  }

  async function fetchOneConcept(p: string): Promise<Concept | null> {
    try {
      const res = await fetch('/api/recipe-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p,
          mode: 'recipe',
          existing: bestaande.map((g) => ({ naam: g.naam, gang: g.gang_slug, tags: g.tags })),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.data) return null;
      return mapApiToConcept(body.data, p, bestaande);
    } catch {
      return null;
    }
  }

  async function bedenk() {
    return bedenkWithPrompt(prompt);
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
      const ok = results.filter((c): c is Concept => c !== null);
      if (ok.length === 0) {
        setError('AI gaf geen geldige concepten terug. Probeer het opnieuw of verfijn de prompt.');
        showToast({ type: 'error', message: 'Geen concepten gegenereerd' });
        return;
      }
      setConcepts(ok);
      // Add to history
      const today = new Date();
      const dateLabel = `${today.getDate()} ${['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][today.getMonth()]}`;
      persistHistory([
        {
          id: 'h_' + Date.now(),
          prompt: p,
          date: dateLabel,
          total: ok.length,
          saved: 0,
        },
        ...history,
      ]);
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
      const { error: dbErr } = await supabase.from('gerechten').insert([payload]);
      if (dbErr) throw new Error(dbErr.message);
      setConcepts((prev) => prev.map((p) => (p.id === c.id ? { ...p, saveState: 'saved' } : p)));
      // Update history saved count
      if (history[0]?.prompt === lastPrompt) {
        persistHistory([{ ...history[0], saved: history[0].saved + 1 }, ...history.slice(1)]);
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

  // KPI data uit history + saved + current session
  const totaalBedacht = history.reduce((s, h) => s + (h.total || 0), 0) + concepts.length;
  const totaalBewaard = history.reduce((s, h) => s + (h.saved || 0), 0) + savedConcepts.length;
  const inspiratiesUniek = useMemo(() => {
    const set = new Set<string>();
    concepts.forEach((c) => c.inspiredBy.forEach((p) => set.add(p.name)));
    return set.size;
  }, [concepts]);
  const gemConfidence =
    concepts.length > 0 ? concepts.reduce((s, c) => s + c.confidence, 0) / concepts.length : 0;

  function verrasMe() {
    const random = VERRAS_PROMPTS[Math.floor(Math.random() * VERRAS_PROMPTS.length)];
    setPrompt(random);
    setTimeout(() => {
      setPrompt(random);
      bedenkWithPrompt(random);
    }, 250);
  }

  return (
    <div className="main-content mobile-safe-bottom" style={{ maxWidth: 1500, position: 'relative', zIndex: 1 }}>
      <StudioBackground />
      <RichKeukenTabs />
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

      <PromptHero value={prompt} onChange={setPrompt} onGenerate={bedenk} busy={busy} />

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
                    onClick={() => setConcepts([])}
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
          items={history}
          onPick={(p) => setPrompt(p)}
          onClear={() => persistHistory([])}
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
