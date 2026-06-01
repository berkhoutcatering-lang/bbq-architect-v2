/* NL-14 allergenen — Europese voorgeschreven lijst (EU 1169/2011).
   Mono-stroke SVG paths op 16×16 grid. Komt uit DB via gerechten.allergenen[]. */

export interface AllergenDef {
  id: string;
  label: string;
  paths: string;
}

export const ALLERGENS: Record<string, AllergenDef> = {
  gluten:       { id: 'gluten',       label: 'Gluten',       paths: 'M8 1.5v11 M8 3.2 5.4 4.6 M8 3.2l2.6 1.4 M8 6 5.4 7.4 M8 6l2.6 1.4 M8 8.8 5.4 10.2 M8 8.8l2.6 1.4' },
  lactose:      { id: 'lactose',      label: 'Lactose',      paths: 'M5 2h6 M5.4 2 5 6.2v6.3h6V6.2L10.6 2 M5 6.2h6' },
  ei:           { id: 'ei',           label: 'Ei',           paths: 'M8 2C6 2 4.5 6 4.5 8.8a3.5 3.5 0 0 0 7 0C11.5 6 10 2 8 2Z' },
  noten:        { id: 'noten',        label: 'Noten',        paths: 'M8 2.2a4.6 4.6 0 0 0-4.6 5.6c.4 2.4 2.3 4 4.6 4s4.2-1.6 4.6-4A4.6 4.6 0 0 0 8 2.2Z M8 4v7.6' },
  soja:         { id: 'soja',         label: 'Soja',         paths: 'M11.5 3c-3 0-5 1.8-5 4.4 M6.5 11.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M9.4 6.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z' },
  vis:          { id: 'vis',          label: 'Vis',          paths: 'M2.5 8c2.5-3 6.5-3.6 9-1.4.9-1 1.5-1.1 1.5-1.1s.2 1.2-.2 2.1c.4.9.2 2.1.2 2.1s-.6-.1-1.5-1.1c-2.5 2.2-6.5 1.6-9-1.4Z M5.4 7.6h.01' },
  schaaldieren: { id: 'schaaldieren', label: 'Schaaldieren', paths: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M5.6 6 3 3.5 M10.4 6 13 3.5 M5.8 9.5 3.5 12 M10.2 9.5 12.5 12' },
  schelpdieren: { id: 'schelpdieren', label: 'Schelpdieren', paths: 'M8 12.5C4 12.5 2 9.5 2 6.5L8 3l6 3.5c0 3-2 6-6 6Z M8 3.2v9 M5 4.7l1.2 7.4 M11 4.7 9.8 12.1' },
  selderij:     { id: 'selderij',     label: 'Selderij',     paths: 'M8 13V5 M8 6.5 5 5 M8 6.5 11 5 M8 9 5.5 7.6 M8 9l2.5-1.4 M8 5c0-1.6 1-2.6 2.4-2.6' },
  mosterd:      { id: 'mosterd',      label: 'Mosterd',      paths: 'M6 4h4l-.4 8.5H6.4L6 4Z M6.4 4c0-1 .7-1.6 1.6-1.6S9.6 3 9.6 4 M6.2 7h3.6' },
  sesam:        { id: 'sesam',        label: 'Sesam',        paths: 'M8 3.4c-1.2 0-2 1-2 2.4s.8 2.4 2 2.4 2-1 2-2.4-.8-2.4-2-2.4Z M5.5 9.6c-1 0-1.7.8-1.7 1.9 M10.5 9.6c1 0 1.7.8 1.7 1.9' },
  sulfiet:      { id: 'sulfiet',      label: 'Sulfiet',      paths: 'M8 2.4 13 11a1 1 0 0 1-.9 1.5H3.9A1 1 0 0 1 3 11L8 2.4Z M8 6.2v3 M8 10.8h.01' },
  lupine:       { id: 'lupine',       label: 'Lupine',       paths: 'M8 13V6 M8 6c0-1.2-1-2-2.2-2S3.6 4.8 3.6 6 4.6 8 5.8 8 M8 6c0-1.2 1-2 2.2-2s2.2.8 2.2 2-1 2-2.2 2' },
  weekdieren:   { id: 'weekdieren',   label: 'Weekdieren',   paths: 'M8 2.5a3.5 3.5 0 0 0-3.5 3.5v3.5 M4.5 9.5c0 1 .7 1.6 1.4 1.6.6 0 1-.5 1-1.2V8 M11.5 6a3.5 3.5 0 0 0-3.5-3.5 M11.5 6v3.5c0 1-.7 1.6-1.4 1.6-.6 0-1-.5-1-1.2V8' },
};

export function allergensFor(ids: string[]): AllergenDef[] {
  return ids
    .map((i) => ALLERGENS[i.toLowerCase()])
    .filter((a): a is AllergenDef => Boolean(a));
}
