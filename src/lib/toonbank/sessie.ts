/**
 * Inloggen op de Toonbank (BA-7a). Contract: datacontract-toonbank-v1.md §3.3
 * (POST inloggen) en §2 (medewerker-inlogcode).
 *
 * - De inlogcode is de bestaande personeel.kds_pin_hash (scrypt), met de
 *   bestaande blokkade kds_pin_lockout_until: één code per persoon, voor de
 *   KDS en de Toonbank. De code stel je in BBQ Architect in, nooit op de tablet.
 * - Een foute code telt de database (toonbank_inlogcode_mislukt): na 5 keer
 *   is de persoon 5 minuten geblokkeerd, ook als twee tablets tegelijk raden.
 * - Fouten zijn 403, nooit 401 (dat is alleen de apparaatsleutel):
 *   inlogcode_onjuist, eigenaarcode_onjuist, medewerker_geblokkeerd, geen_recht.
 * - doel 'sessie' (contract) of 'dienst' (de naam in toonbank_sessies): een
 *   sessie van 12 uur. doel 'vrij_overschrijden': alleen voor rol eigenaar,
 *   60 seconden; het id van die sessie is het goedkeuring_id.
 * - Het token gaat één keer naar de tablet; de database kent alleen de hash.
 *   De inlogcode zelf wordt nergens bewaard of gelogd.
 */
import { verifyPin } from '@/lib/prep/deviceAuth';
import { genereerSessieToken, hashSessieToken, isSessieToken } from './sleutel';
import type { Sessie, SessieDoel, ToonbankRol, ToonbankStore } from './store';

export const DIENST_UREN = 12;
export const GOEDKEURING_SECONDEN = 60;

/** Wat een rol mag; de tablet toont er knoppen mee, BBQ Architect controleert zelf. */
export const RECHTEN: Record<ToonbankRol, string[]> = {
    medewerker: ['verkopen', 'afhalen', 'wegzetten', 'dag_afsluiten'],
    eigenaar: ['verkopen', 'afhalen', 'wegzetten', 'dag_afsluiten', 'vrij_overschrijden'],
};

/** Voor een even lange scrypt als er geen echte hash is (onbekend of geen code). */
const NEP_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

export interface InlogContext {
    orgId: string;
    apparaatId: string;
}

export interface InlogVerzoek {
    medewerker_id: string;
    inlogcode: string;
    /** 'sessie' is de naam in het contract, 'dienst' die in de database. */
    doel: 'sessie' | 'dienst' | 'vrij_overschrijden';
}

export interface InlogAntwoord {
    sessie: string;
    geldig_tot: string;
    medewerker_id: string;
    naam: string;
    rechten: string[];
}

export interface EigenaarcodeAntwoord {
    eigenaar_token: string;
    geldig_tot: string;
    medewerker_id: string;
    goedkeuring_id: string;
}

export type InlogFoutCode = 'inlogcode_onjuist' | 'eigenaarcode_onjuist' | 'medewerker_geblokkeerd' | 'geen_recht';

export type InlogUitkomst =
    | { ok: true; doel: 'dienst'; antwoord: InlogAntwoord }
    | { ok: true; doel: 'vrij_overschrijden'; antwoord: EigenaarcodeAntwoord }
    | { ok: false; code: InlogFoutCode; melding: string; details: Record<string, unknown> };

export function sessieDoel(doel: InlogVerzoek['doel']): SessieDoel {
    return doel === 'vrij_overschrijden' ? 'vrij_overschrijden' : 'dienst';
}

function fout(code: InlogFoutCode, melding: string, details: Record<string, unknown> = {}): InlogUitkomst {
    return { ok: false, code, melding, details };
}

export async function inloggen(store: ToonbankStore, ctx: InlogContext, v: InlogVerzoek, nu: Date = new Date()): Promise<InlogUitkomst> {
    const doel = sessieDoel(v.doel);
    const codeFout: InlogFoutCode = doel === 'vrij_overschrijden' ? 'eigenaarcode_onjuist' : 'inlogcode_onjuist';
    const m = await store.medewerker(ctx.orgId, v.medewerker_id);

    if (!m || !m.actief || !m.toonbank_rol) {
        await verifyPin(v.inlogcode, NEP_HASH);
        return fout('geen_recht', 'Deze medewerker heeft geen toegang tot de Toonbank. Stel de rol in BBQ Architect in.');
    }
    if (m.kds_pin_lockout_until && new Date(m.kds_pin_lockout_until).getTime() > nu.getTime()) {
        return fout('medewerker_geblokkeerd', 'Te vaak een verkeerde code. Probeer het over een paar minuten opnieuw.', { geblokkeerd_tot: m.kds_pin_lockout_until });
    }
    if (!m.kds_pin_hash) {
        await verifyPin(v.inlogcode, NEP_HASH);
        return fout(codeFout, 'Voor deze medewerker is nog geen inlogcode ingesteld. Dat doe je in BBQ Architect → Instellingen → Toonbank.', { reden: 'geen_code' });
    }

    const klopt = await verifyPin(v.inlogcode, m.kds_pin_hash);
    if (!klopt) {
        const teller = await store.inlogcodeMislukt(ctx.orgId, m.id, ctx.apparaatId);
        if (teller.geblokkeerd_tot) {
            return fout('medewerker_geblokkeerd', 'Te vaak een verkeerde code. Probeer het over 5 minuten opnieuw.', { geblokkeerd_tot: teller.geblokkeerd_tot });
        }
        return fout(codeFout, doel === 'vrij_overschrijden' ? 'De code van de eigenaar klopt niet.' : 'Deze code klopt niet.', { pogingen_over: teller.over });
    }

    if (doel === 'vrij_overschrijden' && m.toonbank_rol !== 'eigenaar') {
        return fout('geen_recht', 'Alleen de eigenaar mag verkopen boven vrij goedkeuren.');
    }

    const { token, hash } = genereerSessieToken();
    const geldigTot = new Date(nu.getTime() + (doel === 'dienst' ? DIENST_UREN * 3_600_000 : GOEDKEURING_SECONDEN * 1000)).toISOString();
    const { id } = await store.maakSessie({
        organization_id: ctx.orgId,
        apparaat_id: ctx.apparaatId,
        medewerker_id: m.id,
        token_hash: hash,
        rol: m.toonbank_rol,
        doel,
        geldig_tot: geldigTot,
    });

    if (doel === 'vrij_overschrijden') {
        return { ok: true, doel, antwoord: { eigenaar_token: token, geldig_tot: geldigTot, medewerker_id: m.id, goedkeuring_id: id } };
    }
    return { ok: true, doel, antwoord: { sessie: token, geldig_tot: geldigTot, medewerker_id: m.id, naam: m.naam, rechten: RECHTEN[m.toonbank_rol] } };
}

/**
 * De sessie achter de header x-toonbank-medewerker, als die bij dit apparaat
 * hoort, een dienst is, niet beëindigd en nog geldig, en de persoon nog
 * actief is met een Toonbank-rol (store.sessieOpToken, review M2 K7). Een
 * nieuwe rol of inlogcode beëindigt de open sessies ook in de database
 * (trigger op personeel). Anders null: de route antwoordt dan 403
 * medewerker_sessie_verlopen.
 */
export async function controleerSessie(store: ToonbankStore, ctx: InlogContext, token: string | null, nu: Date = new Date()): Promise<Sessie | null> {
    if (!token || !isSessieToken(token.trim())) return null;
    const s = await store.sessieOpToken(ctx.orgId, ctx.apparaatId, hashSessieToken(token));
    if (!s || s.doel !== 'dienst' || s.beeindigd_at) return null;
    if (new Date(s.geldig_tot).getTime() <= nu.getTime()) return null;
    return s;
}
