/**
 * De streepjescode op een eigen sticker van de Toonbank (kaas, voorverpakt vlees): Code 128, 28
 * cijfers, `29 PPPPP GGGGG KKKKK JJMMDD VVVV C` (stickernummer, gewicht in gram, kiloprijs in
 * centen, THT, volgnummer, controlecijfer). Dezelfde regel staat in de database
 * (private.stickercode_geldig) en in de Toonbank (packages/kern/src/sticker.ts).
 */

/** Het controlecijfer zoals bij een EAN: van rechts af om en om ×3 en ×1, aanvullen tot een tiental. */
export function stickerControlecijfer(cijfers: string): number {
    let som = 0;
    for (let i = 0; i < cijfers.length; i++) som += Number(cijfers[cijfers.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (som % 10)) % 10;
}

/** Een sticker van de Toonbank (29…, 28 cijfers) met een kloppend controlecijfer. */
export function stickerCodeGeldig(code: string): boolean {
    return /^29\d{26}$/.test(code) && stickerControlecijfer(code.slice(0, 27)) === Number(code[27]);
}
