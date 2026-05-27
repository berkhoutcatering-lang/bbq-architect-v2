/**
 * KIA 2026 — Kleinschaligheidsinvesteringsaftrek
 * ──────────────────────────────────────────────
 * Pillar #1 (Server-truth) — KIA-bedragen NOOIT AI-derived. Altijd via deze tabel,
 * server-side. AI mag suggereren "zou je willen investeren?", code rekent.
 *
 * Bron: Belastingdienst KIA-tabel 2026
 * https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/
 *   winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/
 *   investeringsaftrek-2026/kleinschaligheidsinvesteringsaftrek-2026
 *
 * Vijf brackets (cumulatieve totaal-investering per jaar):
 *   ≤ €2.900            → 0%
 *   €2.901 – €71.683    → 28% van investering
 *   €71.684 – €132.746  → vaste aftrek €20.072
 *   €132.747 – €398.236 → €20.072 minus 7,56% × (investering - €132.746)
 *   > €398.236          → 0%
 *
 * KIA is een vermindering van fiscale winst — belastingvoordeel = aftrek × IB-tarief.
 * Default IB-tarief voor indicatie: 37% (laagste schijf eenmanszaak/ZZP MKB).
 */

export const KIA_2026 = {
  threshold_min: 2901,
  bracket1_min: 2901,
  bracket1_max: 71683,
  bracket1_pct: 0.28,
  bracket2_min: 71684,
  bracket2_max: 132746,
  bracket2_fixed: 20072,
  bracket3_min: 132747,
  bracket3_max: 398236,
  bracket3_reduction_rate: 0.0756,
  threshold_max: 398236,
} as const;

export const KIA_DEFAULT_TAX_RATE = 0.37;

export type KiaBracket =
  | 'onder_drempel'      // ≤ €2.900
  | 'percentueel'        // €2.901 – €71.683 (28%)
  | 'vast_maximum'       // €71.684 – €132.746 (€20.072 vast)
  | 'aflopend'           // €132.747 – €398.236
  | 'boven_drempel';     // > €398.236

export interface KiaResult {
  amount: number;
  aftrek: number;
  bracket: KiaBracket;
  bracket_label: string;
  message: string;
  /** Indicatieve belasting-besparing bij default 37% IB-tarief. */
  indicative_tax_saving: number;
}

/**
 * Bereken KIA-aftrek voor een gegeven cumulatieve investerings-totaal in het jaar.
 *
 * @param amount totale investeringen in het lopende jaar (in euro)
 * @param taxRate optioneel IB-tarief voor besparing-indicatie (default 0.37)
 */
export function computeKia(amount: number, taxRate: number = KIA_DEFAULT_TAX_RATE): KiaResult {
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      amount: 0,
      aftrek: 0,
      bracket: 'onder_drempel',
      bracket_label: 'Onder drempel',
      message: 'Bedrag ongeldig — voer een positief bedrag in.',
      indicative_tax_saving: 0,
    };
  }

  let aftrek = 0;
  let bracket: KiaBracket = 'onder_drempel';
  let bracket_label = 'Onder drempel';
  let message = '';

  if (amount < KIA_2026.threshold_min) {
    bracket = 'onder_drempel';
    bracket_label = `Onder drempel (≤ €${(KIA_2026.threshold_min - 1).toLocaleString('nl-NL')})`;
    message = `Geen KIA-aftrek. Drempel ligt op €${KIA_2026.threshold_min.toLocaleString('nl-NL')} cumulatief per jaar.`;
  } else if (amount <= KIA_2026.bracket1_max) {
    aftrek = Math.round(amount * KIA_2026.bracket1_pct);
    bracket = 'percentueel';
    bracket_label = '28% van investering';
    message = `€${amount.toLocaleString('nl-NL')} × 28% = €${aftrek.toLocaleString('nl-NL')} aftrek.`;
  } else if (amount <= KIA_2026.bracket2_max) {
    aftrek = KIA_2026.bracket2_fixed;
    bracket = 'vast_maximum';
    bracket_label = `Vaste aftrek €${KIA_2026.bracket2_fixed.toLocaleString('nl-NL')}`;
    message = `Maximale KIA-aftrek bereikt: €${KIA_2026.bracket2_fixed.toLocaleString('nl-NL')} (vast).`;
  } else if (amount <= KIA_2026.bracket3_max) {
    const reduction = (amount - KIA_2026.bracket2_max) * KIA_2026.bracket3_reduction_rate;
    aftrek = Math.max(0, Math.round(KIA_2026.bracket2_fixed - reduction));
    bracket = 'aflopend';
    bracket_label = 'Aflopend';
    message = `Aftrek daalt van €${KIA_2026.bracket2_fixed.toLocaleString('nl-NL')} met 7,56% per extra euro boven €${KIA_2026.bracket2_max.toLocaleString('nl-NL')}.`;
  } else {
    aftrek = 0;
    bracket = 'boven_drempel';
    bracket_label = `Boven drempel (> €${KIA_2026.threshold_max.toLocaleString('nl-NL')})`;
    message = 'Investering boven KIA-bovengrens — geen aftrek meer toepasbaar.';
  }

  const indicative_tax_saving = Math.round(aftrek * taxRate);

  return {
    amount,
    aftrek,
    bracket,
    bracket_label,
    message,
    indicative_tax_saving,
  };
}

export interface KiaScenario {
  label: string;
  description: string;
  investment_amount: number;
  result: KiaResult;
  /** Extra te investeren om dit scenario te bereiken (vergelijking met huidige). */
  extra_investment: number;
  /** Belasting-bespaard verschil t.o.v. huidige situatie. */
  extra_tax_saving: number;
}

/**
 * Bouw drie standaard scenarios:
 *   1. Niets doen (huidige investering)
 *   2. Tot vast-maximum bracket (€71.684 voor max €20.072 aftrek)
 *   3. Topgrens-scenario (€132.746, max effectieve aftrek nog steeds €20.072)
 */
export function buildKiaScenarios(currentInvestment: number, taxRate: number = KIA_DEFAULT_TAX_RATE): KiaScenario[] {
  const current = computeKia(currentInvestment, taxRate);

  const target_vast = Math.max(currentInvestment, KIA_2026.bracket2_min);
  const vast = computeKia(target_vast, taxRate);

  const target_topgrens = Math.max(currentInvestment, KIA_2026.bracket2_max);
  const topgrens = computeKia(target_topgrens, taxRate);

  return [
    {
      label: 'Niets doen',
      description: 'Huidige situatie — geen extra investering',
      investment_amount: currentInvestment,
      result: current,
      extra_investment: 0,
      extra_tax_saving: 0,
    },
    {
      label: `Tot €${KIA_2026.bracket2_min.toLocaleString('nl-NL')} optimaal`,
      description: 'Maximale aftrek bereiken met de minste extra investering',
      investment_amount: target_vast,
      result: vast,
      extra_investment: Math.max(0, target_vast - currentInvestment),
      extra_tax_saving: vast.indicative_tax_saving - current.indicative_tax_saving,
    },
    {
      label: `Tot €${KIA_2026.bracket2_max.toLocaleString('nl-NL')} topgrens`,
      description: 'Bovengrens vast-maximum bracket — daarna start aflopende fase',
      investment_amount: target_topgrens,
      result: topgrens,
      extra_investment: Math.max(0, target_topgrens - currentInvestment),
      extra_tax_saving: topgrens.indicative_tax_saving - current.indicative_tax_saving,
    },
  ];
}
