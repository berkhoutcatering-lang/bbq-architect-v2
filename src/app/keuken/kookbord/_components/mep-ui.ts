/* Gedeelde visuele helpers voor het MEP-keukenscherm.
   Smoke & Ember-thema: amber-goud basis (#FFBF00) + ember-gloed voor "bezig".
   Geen React — puur stijl/format-logica, gedeeld tussen kaart, sheet en client. */

type Status = 'todo' | 'bezig' | 'klaar';

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

/** Schaal portiegrootte × gasten en geef getal + eenheid los terug (voor groot getal). */
export function formatQty(baseQty: number, baseUnit: string, guests: number): { value: string; unit: string } {
  const total = Number(baseQty ?? 0) * Number(guests ?? 0);
  const u = (baseUnit || 'stuks').toLowerCase();
  if (u === 'g' && total >= 1000) return { value: nf.format(total / 1000), unit: 'kg' };
  if (u === 'ml' && total >= 1000) return { value: nf.format(total / 1000), unit: 'L' };
  const unit = !baseUnit || baseUnit === 'stuks' ? 'st' : baseUnit;
  return { value: nf.format(total), unit };
}

export function nextStatus(s: Status): Status {
  if (s === 'todo') return 'bezig';
  if (s === 'bezig') return 'klaar';
  return 'todo';
}

export interface Pal {
  rail: string; tintTop: string; border: string; label: string;
  pillBg: string; pillBd: string; pillFg: string; glow: boolean;
}

/** Statuspalet — koud staal (todo) → ember (bezig) → gaar/groen (klaar). */
export function pal(status: Status): Pal {
  if (status === 'bezig') return {
    rail: 'linear-gradient(180deg,#FFC83a,#f97316)', tintTop: 'rgba(249,115,22,.13)', border: 'rgba(249,115,22,.4)',
    label: 'Bezig', pillBg: 'rgba(249,115,22,.16)', pillBd: 'rgba(249,115,22,.42)', pillFg: '#ffb37a', glow: true,
  };
  if (status === 'klaar') return {
    rail: 'linear-gradient(180deg,#34d36b,#1faa53)', tintTop: 'rgba(34,197,94,.085)', border: 'rgba(34,197,94,.3)',
    label: 'Klaar', pillBg: 'rgba(34,197,94,.14)', pillBd: 'rgba(34,197,94,.4)', pillFg: '#74e29a', glow: false,
  };
  return {
    rail: 'linear-gradient(180deg,rgba(150,164,184,.7),rgba(110,124,144,.55))', tintTop: 'rgba(124,140,160,.045)', border: 'rgba(130,130,130,.16)',
    label: 'Te doen', pillBg: 'rgba(124,140,160,.1)', pillBd: 'rgba(124,140,160,.28)', pillFg: '#aab3c0', glow: false,
  };
}

export const ACCENT = '#FFBF00';
export const ACCENT_DARK = '#231a05';

export interface BtnSpec { bg: string; fg: string; border: string; shadow: string; label: string; }

/** Statusknop op de kaart: amber start → groen klaar → grijs terug. */
export function btnSpec(status: Status): BtnSpec {
  if (status === 'todo') return { label: 'Start bereiding', bg: ACCENT, fg: ACCENT_DARK, border: 'none', shadow: '0 5px 16px rgba(255,191,0,.3)' };
  if (status === 'bezig') return { label: 'Markeer klaar', bg: 'linear-gradient(180deg,#37d56e,#1fa852)', fg: '#06210f', border: 'none', shadow: '0 5px 16px rgba(34,197,94,.26)' };
  return { label: 'Zet terug', bg: 'rgba(130,130,130,.08)', fg: '#9aa0a8', border: '1px solid rgba(130,130,130,.22)', shadow: 'none' };
}

/** Statische CSS (keyframes, scrollbar, hover) — eenmalig geïnjecteerd. Geen interpolatie. */
export const MEP_CSS = `
@keyframes mepEmber{0%,100%{opacity:.82}50%{opacity:1}}
@keyframes mepPop{0%{transform:scale(.97)}55%{transform:scale(1.012)}100%{transform:scale(1)}}
@keyframes mepShimmer{0%{background-position:-460px 0}100%{background-position:460px 0}}
@keyframes mepUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes mepFade{from{opacity:0}to{opacity:1}}
@keyframes mepRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.mep-sc::-webkit-scrollbar{width:11px;height:11px}
.mep-sc::-webkit-scrollbar-thumb{background:rgba(130,130,130,.22);border-radius:8px;border:3px solid transparent;background-clip:content-box}
.mep-sc::-webkit-scrollbar-thumb:hover{background:rgba(130,130,130,.4);background-clip:content-box}
.mep-card{transition:transform .18s ease,box-shadow .28s ease,border-color .2s}
.mep-card:hover{transform:translateY(-2px)}
.mep-cta{transition:filter .15s ease,transform .1s ease,background .15s ease}
.mep-cta:hover{filter:brightness(1.07)}
.mep-cta:active{transform:scale(.975)}
.mep-ghost{transition:background .15s ease,color .15s ease,border-color .15s ease}
.mep-ghost:hover{background:rgba(130,130,130,.14);color:#cfcfcf}
.mep-flash{animation:mepPop .5s ease}
`;
