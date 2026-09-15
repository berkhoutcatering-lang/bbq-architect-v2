/* De detectie-route (/api/detect-allergens) antwoordt in lettercodes (E, M,
   G …); het gerecht en de rest van de app werken met woorden (ei, mosterd,
   gluten — lib/constants ALLERGENEN). Vertalen op de grens, anders staan er
   twee talen door elkaar in gerechten.allergenen en herkent een filter "E"
   niet als ei. V/VE zijn dieetwensen, geen allergenen: die vallen weg. */
export const ALLERGEEN_CODE_NAAR_WOORD: Record<string, string> = {
    G: 'gluten', L: 'lactose', N: 'noten', E: 'ei', S: 'soja', F: 'vis', M: 'mosterd',
};

export function allergeenCodesNaarWoorden(codes: unknown): string[] {
    if (!Array.isArray(codes)) return [];
    return [...new Set(codes.map((c) => ALLERGEEN_CODE_NAAR_WOORD[String(c).toUpperCase()]).filter(Boolean))];
}
