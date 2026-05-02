/**
 * Pillar #4 (Phase 2 — 2026-05-02): tarieven NOOIT AI-derive.
 * Hard-coded uit Belastingdienst.
 *
 * Bron: https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/zakelijk-gebruik-privevervoermiddel-2026
 *
 * Recheck Q3 2026: wetsvoorstel kan tarief retroactief verhogen naar €0,25
 * vanaf 1-1-2026. Bij wijziging: bump KM_TARIEF_PER_JAAR[2026] en deploy.
 */

export const KM_TARIEF_PER_JAAR = {
  2024: 0.23,
  2025: 0.23,
  2026: 0.23, // mogelijk 0.25 retroactief — recheck Q3 2026
} as const;

export type RittenJaar = keyof typeof KM_TARIEF_PER_JAAR;

export function tariefVoorJaar(jaar: number): number {
  if (jaar in KM_TARIEF_PER_JAAR) {
    return KM_TARIEF_PER_JAAR[jaar as RittenJaar];
  }
  // Default: laatste bekende tarief. Bij toekomstige jaren expliciet toevoegen.
  return 0.23;
}

export interface BedragOpts {
  kilometers: number;
  zakelijk: boolean;
  priveOmleidingKm?: number;
  datum: string | Date;
}

export function bedragAftrekbaar(opts: BedragOpts): number {
  if (!opts.zakelijk) return 0;
  const datumObj = typeof opts.datum === 'string' ? new Date(opts.datum) : opts.datum;
  const jaar = datumObj.getFullYear();
  const tarief = tariefVoorJaar(jaar);
  const zakelijkeKm = Math.max(0, opts.kilometers - (opts.priveOmleidingKm ?? 0));
  return Math.round(zakelijkeKm * tarief * 100) / 100;
}

export function kwartaalRange(jaar: number, kwartaal: 1 | 2 | 3 | 4): { start: string; eind: string } {
  const startMaand = (kwartaal - 1) * 3;
  const start = new Date(jaar, startMaand, 1);
  const eind = new Date(jaar, startMaand + 3, 0);
  return {
    start: start.toISOString().slice(0, 10),
    eind: eind.toISOString().slice(0, 10),
  };
}

export function huidigKwartaal(date: Date = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}
