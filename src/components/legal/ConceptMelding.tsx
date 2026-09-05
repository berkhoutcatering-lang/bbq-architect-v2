import { juridischGereviewd } from '@/lib/legal';

/** Toont de concept-melding zolang de teksten niet door een jurist zijn gezien. */
export default function ConceptMelding() {
  if (juridischGereviewd) return null;
  return (
    <p
      role="note"
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: 'rgba(255,191,0,.06)',
        border: '1px solid rgba(255,191,0,.22)',
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <strong style={{ color: 'var(--brand-gold)' }}>Concept.</strong>{' '}
      Deze tekst is nog niet door een jurist beoordeeld. Je kunt er nog geen
      rechten aan ontlenen.
    </p>
  );
}
