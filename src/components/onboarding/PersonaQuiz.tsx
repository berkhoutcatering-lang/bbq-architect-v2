'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { track } from '@/lib/track';
import { useOrg } from '@/lib/OrgContext';
import { seedDemoData } from '@/lib/onboardingSeed';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'bbq_persona_quiz_v1';

interface QuizAnswers {
  eventsPerYear?: '<10' | '10-50' | '50+';
  biggestPain?: 'offertes' | 'event-dag' | 'boekhouding' | 'klantcomm';
  bedrijfsnaam?: string;
}

interface Props {
  /** Toon modal alleen als nog niet ingevuld. Override via prop voor preview. */
  forceShow?: boolean;
  onComplete?: (answers: QuizAnswers) => void;
}

const QUESTIONS = [
  {
    key: 'eventsPerYear' as const,
    title: 'Hoeveel events plan je per jaar?',
    desc: 'Helpt ons de demo afstemmen op jouw schaal.',
    options: [
      { value: '<10', label: 'Minder dan 10', hint: 'Ik begin net of doe het erbij' },
      { value: '10-50', label: '10 tot 50', hint: 'Mijn hoofdwerk' },
      { value: '50+', label: 'Meer dan 50', hint: 'Druk seizoen, vaak meerdere per week' },
    ],
  },
  {
    key: 'biggestPain' as const,
    title: 'Wat is je grootste pijn nu?',
    desc: 'We zetten die hub als eerste in de spotlight.',
    options: [
      { value: 'offertes', label: 'Offertes snel maken', hint: 'Veel verzoeken, weinig tijd' },
      { value: 'event-dag', label: 'Event-dag stress', hint: 'Prep, service en HACCP tegelijk' },
      { value: 'boekhouding', label: 'Boekhouding bijhouden', hint: 'BTW, facturen, marges' },
      { value: 'klantcomm', label: 'Klantcommunicatie', hint: 'Mailen, opvolgen, bevestigen' },
    ],
  },
  {
    key: 'bedrijfsnaam' as const,
    title: 'Wat is je bedrijfsnaam?',
    desc: 'Voor je logo, offertes en het gevoel: dit is jouw app.',
    options: null,
  },
];

export default function PersonaQuiz({ forceShow, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [bedrijfsnaam, setBedrijfsnaam] = useState('');
  const { orgId } = useOrg();

  useEffect(() => {
    if (forceShow) {
      setOpen(true);
      return;
    }
    // Eerst localStorage (snel), dan settings.persona_result (cross-device).
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && saved !== '{}') return; // al ingevuld
        // Cross-device check: heeft deze tenant elders al ingevuld?
        if (orgId && supabase) {
          const { data } = await supabase
            .from('settings')
            .select('persona_result')
            .eq('organization_id', orgId)
            .maybeSingle();
          if (!cancelled && data?.persona_result && Object.keys(data.persona_result).length > 0) {
            // Hydrate localStorage zodat volgende load nog sneller is
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.persona_result)); } catch { /* */ }
            return;
          }
        }
        if (!cancelled) setOpen(true);
      } catch {
        if (!cancelled) setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [forceShow, orgId]);

  if (!open) return null;

  function handleAnswer(value: string) {
    const q = QUESTIONS[step];
    const next: QuizAnswers = { ...answers, [q.key]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      finalize(next);
    }
  }

  function handleSubmitName() {
    if (!bedrijfsnaam.trim()) return;
    finalize({ ...answers, bedrijfsnaam: bedrijfsnaam.trim() });
  }

  function finalize(final: QuizAnswers) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(final)); } catch { /* */ }
    /* Track activation: quiz voltooid. Metadata zonder bedrijfsnaam (privacy). */
    track('quiz_completed', {
      eventsPerYear: final.eventsPerYear,
      biggestPain: final.biggestPain,
      hasName: !!final.bedrijfsnaam,
    });
    /* Persist server-side zodat het quiz-resultaat cross-device beschikbaar is
       en /admin/funnel kan rapporteren. Fire-and-forget. */
    if (orgId && supabase) {
      void supabase
        .from('settings')
        .update({ persona_result: final })
        .eq('organization_id', orgId);
    }
    /* Demo-data seed: idempotent — vult lege hubs met realistische voorbeeld-events,
       gerechten, klanten, offertes en 1 factuur. Fire-and-forget zodat modal direct
       sluit; de seed werkt op de achtergrond via RLS (geen service-role nodig). */
    if (orgId) {
      void seedDemoData(orgId);
    }
    onComplete?.(final);
    setOpen(false);
  }

  function handleSkip() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({})); } catch { /* */ }
    setOpen(false);
  }

  const q = QUESTIONS[step];
  const isNameStep = q.options === null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welkom-vragen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        background: 'var(--overlay)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--card-solid)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          position: 'relative',
        }}
      >
        <button
          onClick={handleSkip}
          aria-label="Overslaan"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
          <Sparkles size={16} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Welkom · vraag {step + 1} van {QUESTIONS.length}
          </span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, lineHeight: 1.2 }}>{q.title}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 'var(--space-5)' }}>{q.desc}</p>

        {isNameStep ? (
          <>
            <input
              type="text"
              value={bedrijfsnaam}
              onChange={(e) => setBedrijfsnaam(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitName(); }}
              placeholder="Bijv. Hop & Bites"
              autoFocus
              aria-label="Bedrijfsnaam"
              style={{
                width: '100%',
                padding: 'var(--space-4)',
                fontSize: 15,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
                marginBottom: 'var(--space-4)',
              }}
            />
            <button
              onClick={handleSubmitName}
              disabled={!bedrijfsnaam.trim()}
              className="btn btn-brand"
              style={{ width: '100%' }}
            >
              Klaar — laat de app zien <ArrowRight size={14} />
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {q.options?.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleAnswer(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  minHeight: 48,
                  transition: 'border-color 120ms, background 120ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand-tint-border)';
                  e.currentTarget.style.background = 'var(--brand-tint-subtle)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--card)';
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{opt.hint}</div>
                </div>
                <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleSkip}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 12,
            cursor: 'pointer',
            marginTop: 'var(--space-4)',
            display: 'block',
            marginInline: 'auto',
          }}
        >
          Overslaan
        </button>
      </div>
    </div>
  );
}
