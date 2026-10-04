/**
 * De echte opslag van de Toonbank-API: Supabase met de service-role client.
 *
 * Service_role gaat langs RLS. Daarom filtert elke query hier zelf op
 * organization_id (die van de apparaatsleutel), en lopen schrijfacties die
 * atomair moeten zijn via de databasefuncties uit
 * 20261006130000_toonbank_apparaten (koppelen, inlogteller, apparaat gezien).
 * Gooit bij een databasefout: de route maakt er 500 serverfout van; een getal
 * of uitkomst wordt nooit geraden.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabase } from '@/lib/supabase-server';
import {
    OngeldigeMelding,
    type Apparaat, type CatalogusRuw, type DagstaatStand, type InlogTeller, type JournaalOpslagRuw, type KoppelKandidaat, type Koppeling, type Medewerker,
    type OphaalVraagRuw, type Sessie, type StatusBron, type ToonbankStore, type VerwerktRij, type WegzetTaakRij, type WegzetVraagRuw,
} from './store';

const APPARAAT_KOLOMMEN = 'id, organization_id, naam, code, locatie, ingetrokken_at, hoogste_volgnummer_gemeld, bevestigd_tot_volgnummer';
const SESSIE_KOLOMMEN = 'id, organization_id, apparaat_id, medewerker_id, rol, doel, geldig_tot, beeindigd_at';

export class OpslagFout extends Error {
    constructor(waar: string, public readonly oorzaak: { code?: string | null; message?: string } | null) {
        super(`${waar}: ${oorzaak?.message ?? 'onbekende fout'}`);
        this.name = 'OpslagFout';
    }
}

function naarApparaat(r: Record<string, unknown>): Apparaat {
    return {
        id: String(r.id),
        organization_id: String(r.organization_id),
        naam: String(r.naam),
        code: String(r.code),
        locatie: r.locatie === 'event' ? 'event' : 'winkel',
        ingetrokken_at: (r.ingetrokken_at as string | null) ?? null,
        hoogste_volgnummer_gemeld: Number(r.hoogste_volgnummer_gemeld ?? 0),
        bevestigd_tot_volgnummer: Number(r.bevestigd_tot_volgnummer ?? 0),
    };
}

export function maakToonbankSupabaseStore(client?: SupabaseClient): ToonbankStore {
    const sb = client ?? createServiceSupabase();

    return {
        async koppelKandidaten() {
            const { data, error } = await sb.rpc('toonbank_koppel_kandidaten');
            if (error) throw new OpslagFout('toonbank_koppel_kandidaten', error);
            return ((data ?? []) as Record<string, unknown>[]).map((r): KoppelKandidaat => ({
                apparaat_id: String(r.apparaat_id),
                organization_id: String(r.organization_id),
                koppelcode_hash: String(r.koppelcode_hash),
            }));
        },

        async koppelMislukt() {
            const { data, error } = await sb.rpc('toonbank_koppel_mislukt');
            if (error) throw new OpslagFout('toonbank_koppel_mislukt', error);
            return Number(data ?? 0);
        },

        async koppelAf(apparaatId, sleutelHash, sleutelPrefix) {
            const { data, error } = await sb.rpc('toonbank_koppel_af', { p_apparaat_id: apparaatId, p_sleutel_hash: sleutelHash, p_sleutel_prefix: sleutelPrefix });
            if (error) throw new OpslagFout('toonbank_koppel_af', error);
            if (!data) return null;
            const r = data as Record<string, unknown>;
            return { apparaat_id: String(r.apparaat_id), organization_id: String(r.organization_id), code: String(r.code), naam: String(r.naam) } satisfies Koppeling;
        },

        async apparaatOpSleutel(sleutelHash) {
            const { data, error } = await sb.from('toonbank_apparaten').select(APPARAAT_KOLOMMEN).eq('sleutel_hash', sleutelHash).maybeSingle();
            if (error) throw new OpslagFout('toonbank_apparaten', error);
            return data ? naarApparaat(data as Record<string, unknown>) : null;
        },

        async medewerkers(orgId) {
            const { data, error } = await sb.from('personeel')
                .select('id, naam, toonbank_rol')
                .eq('organization_id', orgId)
                .eq('actief', true)
                .not('toonbank_rol', 'is', null)
                .order('naam');
            if (error) throw new OpslagFout('personeel', error);
            return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
                id: String(r.id),
                naam: String(r.naam),
                toonbank_rol: r.toonbank_rol === 'eigenaar' ? 'eigenaar' as const : 'medewerker' as const,
            }));
        },

        async medewerker(orgId, id) {
            const { data, error } = await sb.from('personeel')
                .select('id, organization_id, naam, actief, toonbank_rol, kds_pin_hash, kds_pin_lockout_until')
                .eq('organization_id', orgId)
                .eq('id', id)
                .maybeSingle();
            if (error) throw new OpslagFout('personeel', error);
            if (!data) return null;
            const r = data as Record<string, unknown>;
            return {
                id: String(r.id),
                organization_id: String(r.organization_id),
                naam: String(r.naam),
                actief: !!r.actief,
                toonbank_rol: r.toonbank_rol === 'eigenaar' || r.toonbank_rol === 'medewerker' ? r.toonbank_rol : null,
                kds_pin_hash: (r.kds_pin_hash as string | null) ?? null,
                kds_pin_lockout_until: (r.kds_pin_lockout_until as string | null) ?? null,
            } satisfies Medewerker;
        },

        async inlogcodeMislukt(orgId, medewerkerId, apparaatId) {
            const { data, error } = await sb.rpc('toonbank_inlogcode_mislukt', { p_org: orgId, p_medewerker_id: medewerkerId, p_apparaat_id: apparaatId });
            if (error) throw new OpslagFout('toonbank_inlogcode_mislukt', error);
            const r = (data ?? {}) as Record<string, unknown>;
            return { mislukt: Number(r.mislukt ?? 0), over: Number(r.over ?? 0), geblokkeerd_tot: (r.geblokkeerd_tot as string | null) ?? null } satisfies InlogTeller;
        },

        async maakSessie(s) {
            const { data, error } = await sb.from('toonbank_sessies').insert(s).select('id').single();
            if (error || !data) throw new OpslagFout('toonbank_sessies', error);
            return { id: String((data as { id: string }).id) };
        },

        async sessieOpToken(orgId, apparaatId, tokenHash) {
            /* Review M2 K7: alleen zolang de persoon actief is en een Toonbank-rol heeft. Gaat de
               rol op NULL of actief op false, dan werkt een lopende dienst van 12 uur niet meer
               (de trigger op personeel beëindigt hem ook; dit is de tweede dam). */
            const { data, error } = await sb.from('toonbank_sessies')
                .select(`${SESSIE_KOLOMMEN}, personeel!inner(actief, toonbank_rol)`)
                .eq('organization_id', orgId)
                .eq('apparaat_id', apparaatId)
                .eq('token_hash', tokenHash)
                .eq('personeel.actief', true)
                .not('personeel.toonbank_rol', 'is', null)
                .maybeSingle();
            if (error) throw new OpslagFout('toonbank_sessies', error);
            if (!data) return null;
            const { personeel: _p, ...sessie } = data as unknown as Sessie & { personeel: unknown };
            void _p;
            return sessie;
        },

        async status(orgId, apparaatId, gezien) {
            const { data, error } = await sb.rpc('toonbank_status', {
                p_org: orgId, p_apparaat_id: apparaatId, p_volgnummer: gezien.volgnummer,
                p_app_versie: gezien.app_versie, p_contract_versie: gezien.contract_versie,
            });
            if (error) throw new OpslagFout('toonbank_status', error);
            return naarStatus(data as Record<string, unknown>);
        },

        async catalogusVersie(orgId) {
            const { data, error } = await sb.from('winkel_catalogus_versie').select('versie').eq('organization_id', orgId).maybeSingle();
            if (error) throw new OpslagFout('winkel_catalogus_versie', error);
            return Number((data as { versie?: unknown } | null)?.versie ?? 0);
        },

        async catalogus(orgId) {
            const { data, error } = await sb.rpc('toonbank_catalogus', { p_org: orgId });
            if (error) throw new OpslagFout('toonbank_catalogus', error);
            return data as CatalogusRuw;
        },

        async voorraadStand(orgId) {
            const { data, error } = await sb.rpc('winkel_voorraad_stand', { p_org: orgId });
            if (error) throw new OpslagFout('winkel_voorraad_stand', error);
            const r = (data ?? {}) as Record<string, unknown>;
            return { versie: Number(r.versie ?? 0), vrij_verloopt_at: (r.vrij_verloopt_at as string | null) ?? null };
        },

        async vrij(orgId) {
            const { data, error } = await sb.rpc('toonbank_vrij', { p_org: orgId });
            if (error) throw new OpslagFout('toonbank_vrij', error);
            return data as { versie: number; volledig: boolean; vrij_verloopt_at: string | null; producten: unknown[] };
        },

        async wegzetTaken(orgId) {
            const { data, error } = await sb.from('winkel_wegzet_taken')
                .select('order_id, nummer, naam, afhaalmoment, ophalen_binnen_24u, regels')
                .eq('organization_id', orgId)
                .order('afhaalmoment', { ascending: true, nullsFirst: false })
                .order('order_id');
            if (error) throw new OpslagFout('winkel_wegzet_taken', error);
            return (data ?? []) as WegzetTaakRij[];
        },

        async wegzetVraag(v) {
            const { data, error } = await sb.rpc('toonbank_wegzet_vraag', {
                p_org: v.orgId, p_apparaat_id: v.apparaatId, p_order_id: v.orderId, p_actie: v.actie,
                p_gebeurtenis_id: v.gebeurtenisId, p_moment: v.moment, p_medewerker_id: v.medewerkerId,
                p_contract_versie: v.contractVersie, p_reden: v.reden,
            });
            if (error) throw new OpslagFout('toonbank_wegzet_vraag', error);
            return data as WegzetVraagRuw;
        },

        async afhaallijst(orgId, datum) {
            const { data, error } = await sb.rpc('toonbank_afhaallijst', { p_org: orgId, p_datum: datum });
            if (error) throw new OpslagFout('toonbank_afhaallijst', error);
            return data as { versie: number; datum: string; orders: unknown[] };
        },

        async scan(orgId, code) {
            const { data, error } = await sb.rpc('scan_resolve', { p_org: orgId, p_code: code });
            if (error) throw new OpslagFout('scan_resolve', error);
            return (data ?? { soort: 'onbekend', code }) as Record<string, unknown>;
        },

        /* ── BA-9 ── */
        async journaalOpslaan(o) {
            const { data, error } = await sb.rpc('toonbank_journaal_opslaan', {
                p_org: o.orgId, p_apparaat: o.apparaatId, p_meldingen: o.meldingen,
                p_contract_versie: o.contractVersie, p_contract_verouderd: o.verouderd,
            });
            if (error) {
                if (error.code === '22023') {
                    let index: number | null = null;
                    try { index = Number((JSON.parse(error.details ?? '{}') as { index?: unknown }).index ?? NaN); } catch { /* geen details */ }
                    throw new OngeldigeMelding(error.message, Number.isInteger(index) ? index : null);
                }
                throw new OpslagFout('toonbank_journaal_opslaan', error);
            }
            return naarJournaalOpslag(data as Record<string, unknown>);
        },

        async journaalMarkeer(orgId, journaalId, code, melding) {
            const { data, error } = await sb.rpc('toonbank_journaal_markeer', { p_org: orgId, p_journaal_id: journaalId, p_code: code, p_melding: melding });
            if (error) throw new OpslagFout('toonbank_journaal_markeer', error);
            return String(data ?? 'fout');
        },

        async verwerkWachtrij(orgId, apparaatId) {
            const { data, error } = await sb.rpc('toonbank_verwerk_wachtrij', { p_org: orgId, p_apparaat: apparaatId });
            if (error) throw new OpslagFout('toonbank_verwerk_wachtrij', error);
            return naarVerwerkt((data as { verwerkt?: unknown } | null)?.verwerkt);
        },

        /* ── BA-10 ── */
        async ophaalVraag(v) {
            const { data, error } = await sb.rpc('toonbank_ophaal_vraag', {
                p_org: v.orgId, p_apparaat_id: v.apparaatId, p_soort: v.soort, p_order_id: v.orderId, p_code: v.code,
                p_gebeurtenis_id: v.gebeurtenisId, p_moment: v.moment, p_medewerker_id: v.medewerkerId, p_bon_id: v.bonId,
                p_rest_methode: v.restMethode, p_rest_bedrag_cents: v.restBedragCents, p_leeftijd: v.leeftijd, p_contract_versie: v.contractVersie,
            });
            if (error) throw new OpslagFout('toonbank_ophaal_vraag', error);
            return data as OphaalVraagRuw;
        },

        async dagstaatOverzicht(orgId, apparaatId, datum) {
            const { data, error } = await sb.rpc('toonbank_dagstaat_overzicht', { p_org: orgId, p_apparaat_id: apparaatId, p_datum: datum });
            if (error) throw new OpslagFout('toonbank_dagstaat_overzicht', error);
            return (data ?? {}) as Record<string, unknown>;
        },

        async dagstaatStand(orgId, dagstaatId) {
            const { data, error } = await sb.from('toonbank_dagstaten').select('status, verschillen').eq('organization_id', orgId).eq('id', dagstaatId).maybeSingle();
            if (error) throw new OpslagFout('toonbank_dagstaten', error);
            if (!data) return null;
            const r = data as { status: string; verschillen: { veld: string; tablet_cents: unknown; ba_cents: unknown }[] | null };
            return {
                status: String(r.status),
                verschillen: (r.verschillen ?? []).map((x) => ({ veld: String(x.veld), tablet_cents: Number(x.tablet_cents), ba_cents: Number(x.ba_cents) })),
            } satisfies DagstaatStand;
        },
    };
}

/** jsonb van toonbank_journaal_opslaan → JournaalOpslagRuw (bigint kan als tekst komen). */
export function naarJournaalOpslag(r: Record<string, unknown>): JournaalOpslagRuw {
    return {
        resultaten: ((r.resultaten as Record<string, unknown>[] | null) ?? []).map((x) => ({
            gebeurtenis_id: String(x.gebeurtenis_id),
            journaal: x.journaal === 'bestond' ? 'bestond' as const : 'nieuw' as const,
            journaal_id: Number(x.journaal_id),
            verwerking: String(x.verwerking ?? 'wacht'),
            soort: String(x.soort ?? ''),
        })),
        bevestigd_tot_volgnummer: Number(r.bevestigd_tot_volgnummer ?? 0),
    };
}

/** De lijst uit toonbank_verwerk_wachtrij → VerwerktRij[]. */
export function naarVerwerkt(lijst: unknown): VerwerktRij[] {
    return ((lijst as Record<string, unknown>[] | null) ?? []).map((x) => ({
        journaal_id: Number(x.journaal_id),
        gebeurtenis_id: String(x.gebeurtenis_id),
        soort: String(x.soort ?? ''),
        status: String(x.status ?? 'wacht'),
        product_ids: ((x.product_ids as unknown[] | null) ?? []).map(String),
    }));
}

/** jsonb van toonbank_status → StatusBron; bigint/numeric kan als tekst komen, tijden als ISO met Z. */
export function naarStatus(r: Record<string, unknown>): StatusBron {
    const n = (v: unknown) => Number(v ?? 0);
    const t = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());
    const a = (r.apparaat ?? {}) as Record<string, unknown>;
    const i = (r.instellingen ?? {}) as Record<string, unknown>;
    return {
        servertijd: t(r.servertijd) ?? new Date().toISOString(),
        apparaat: { apparaat_id: String(a.apparaat_id), code: String(a.code), naam: String(a.naam) },
        catalogus_versie: n(r.catalogus_versie),
        voorraad_versie: n(r.voorraad_versie),
        vrij_verloopt_at: t(r.vrij_verloopt_at),
        afhaallijst_versie: n(r.afhaallijst_versie),
        wegzetten_open: n(r.wegzetten_open),
        wegzetten_binnen_24u: n(r.wegzetten_binnen_24u),
        hoogste_volgnummer_gemeld: n(r.hoogste_volgnummer_gemeld),
        bevestigd_tot_volgnummer: n(r.bevestigd_tot_volgnummer),
        hoogste_bon_volgnummer: n(r.hoogste_bon_volgnummer),
        instellingen: {
            alcohol_toegestaan: i.alcohol_toegestaan === true,
            contant_aan: i.contant_aan !== false,
            contant_limiet_cents: Math.min(n(i.contant_limiet_cents) || 300_000, 300_000),
            beschikbaar_grens: n(i.beschikbaar_grens) || 5,
        },
        te_controleren: n(r.te_controleren),
    };
}
