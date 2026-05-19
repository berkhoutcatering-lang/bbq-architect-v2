/* NL-15 — EU AI Act 2026: transparency disclosure voor "limited-risk" AI-output.
 *
 * Eis: gebruiker moet expliciet weten dat content door AI is samengesteld.
 * Wij implementeren dit als een subtiele inline-badge bij elke AI-output:
 *
 *   <AiBadge model="claude-haiku-4-5" />
 *   <AiBadge text="Suggestie van AI" />
 *
 * Plekken waar dit moet (audit zal extra plekken vinden):
 *   - AiOfferteWizard output (offerte-regels)
 *   - AI Pitmaster chat-response
 *   - AI Bedenker concept-cards
 *   - /api/today-briefing rendering
 *   - Bon-extract review-modal
 *   - Pricelist-extract review-queue
 *   - AIQuickPrompts drawer-output
 *
 * Niet voor: gewone CTA-knop met label "Vraag AI" (= initiator, geen output).
 */

'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

interface Props {
  /** Korte label-tekst. Default: 'Door AI samengesteld' */
  text?: string;
  /** Optioneel: toon model-info in tooltip voor transparantie. */
  model?: string;
  /** Compactere weergave (zonder achtergrond). */
  inline?: boolean;
  className?: string;
}

export default function AiBadge({
  text = 'Door AI samengesteld',
  model,
  inline = false,
  className,
}: Props): React.ReactElement {
  const title = model
    ? `${text} · model: ${model}. Controleer altijd de inhoud — AI kan fouten maken.`
    : `${text}. Controleer altijd de inhoud — AI kan fouten maken.`;

  if (inline) {
    return (
      <span
        className={className}
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          color: 'var(--muted-light, #9ca3af)',
          fontWeight: 500,
          letterSpacing: '.04em',
        }}
      >
        <Sparkles size={10} aria-hidden="true" />
        {text}
      </span>
    );
  }

  return (
    <span
      className={className}
      title={title}
      role="note"
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        background: 'rgba(196, 163, 90, 0.08)',
        border: '1px solid rgba(196, 163, 90, 0.25)',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-accent-gold, #c4a35a)',
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      <Sparkles size={10} aria-hidden="true" />
      {text}
    </span>
  );
}
