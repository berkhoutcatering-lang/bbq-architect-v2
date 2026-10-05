// Historische afwijkingen tussen de repo en live, voor de testdatabase.
//
// Twee soorten, allebei alleen voor migraties die al op live staan:
//
//   1. `vooraf`: een wijziging die op live buiten de migraties om is gedaan
//      (SQL-editor, MCP) en waar een latere migratie op rekent. Testdb voert
//      die SQL uit vlak vóór die migratie, in dezelfde transactie, zodat de
//      volgorde klopt met de geschiedenis.
//   2. `zoek` (+ `vervang`): een oude migratie die in de repo anders staat dan
//      hij ooit op live is gedraaid, en daardoor op een lege database niet
//      meer werkt. Testdb past alleen in het geheugen de tekst aan; het
//      bestand zelf blijft zoals het is. Elke `zoek` moet precies `aantal`
//      keer passen; past hij niet meer (de migratie is veranderd), dan stopt
//      `migreer` liever dan dat een afwijking stil verrot.
//
// Een fout in een NIEUWE migratie hoort hier niet: die repareer je in de
// migratie zelf.

const AUDIT_SEED = /DO \$\$\s*BEGIN\s*IF EXISTS \(SELECT 1 FROM information_schema\.tables WHERE table_name = 'audit_log'\) THEN\s*INSERT INTO audit_log \(entity_type[\s\S]*?END \$\$;/g;
const AUDIT_REDEN = 'logblok schrijft in audit_log met kolommen (entity_type, entity_id, created_at) die audit_log uit 017 niet heeft; zo kan de migratie nooit op live zijn gedraaid. Testdb slaat alleen dit logblok over.';

// 20260508084409 herschrijft policies naar private.user_org_ids(). Staat er
// auth.user_org_ids() of public.user_org_ids() in (zo deparset Postgres het
// als dat schema niet in het zoekpad staat), dan maakt de vervangreeks er
// private.private.user_org_ids() van en faalt de migratie. Op live stonden de
// policies op dat moment kennelijk anders. Testdb laat die vormen via de
// tijdelijke merktekens lopen die de migratie zelf al gebruikt.
const ORG_HELPER_HERSCHRIJVING = /replace\((new_qual|new_check), '(auth|public)\.(user_org_ids|current_org_id)\(\)', 'private\.(?:user_org_ids|current_org_id)\(\)'\)/g;

export const AFWIJKINGEN = [
    {
        migratie: '20260508084409_security_advisor_hardening.sql',
        zoek: ORG_HELPER_HERSCHRIJVING,
        aantal: 8,
        vervang: (_m, v, schema, fn) => `replace(${v}, '${schema}.${fn}()', '__PRIVATE_${fn.toUpperCase()}__')`,
        reden: 'vervangreeks maakt van auth./public.user_org_ids() private.private.user_org_ids(); testdb laat die via de merktekens lopen',
    },
    { migratie: '024_email_inbox_and_review_queue.sql', zoek: AUDIT_SEED, aantal: 1, reden: AUDIT_REDEN },
    { migratie: '025_leveranciers_extension_sync.sql', zoek: AUDIT_SEED, aantal: 1, reden: AUDIT_REDEN },
    { migratie: '026_fix_price_mutations_leverancier_id.sql', zoek: AUDIT_SEED, aantal: 1, reden: AUDIT_REDEN },
    { migratie: '027_leveranciers_scope_filter.sql', zoek: AUDIT_SEED, aantal: 1, reden: AUDIT_REDEN },
    { migratie: '028_dedup_constraints.sql', zoek: AUDIT_SEED, aantal: 1, reden: AUDIT_REDEN },
    {
        migratie: '20260601100000_price_intelligence_application_layer.sql',
        vooraf: "ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;",
        reden: 'organizations.feature_flags bestond op live al ("already exists", regel 569) maar geen migratie maakt hem aan',
    },
];

export function pasAfwijkingenToe(bestand, sql) {
    const toegepast = [];
    for (const a of AFWIJKINGEN.filter((x) => x.migratie === bestand)) {
        if (a.zoek) {
            const treffers = sql.match(a.zoek)?.length ?? 0;
            if (treffers !== a.aantal) {
                throw new Error(`Afwijking voor ${bestand} past ${treffers} keer i.p.v. ${a.aantal} (tools/testdb/afwijkingen.mjs). Is de migratie veranderd?`);
            }
            // Zonder `vervang`: het blok wegcommentariëren, met hetzelfde aantal
            // regels, zodat regelnummers in foutmeldingen blijven kloppen.
            sql = sql.replace(a.zoek, a.vervang ?? ((m) => m.split('\n').map((_, i) => (i === 0 ? '-- [testdb] overgeslagen, zie afwijkingen.mjs' : '--')).join('\n')));
        }
        if (a.vooraf) {
            // Op dezelfde eerste regel, zodat regelnummers blijven kloppen.
            sql = `${a.vooraf.replace(/\s*\n\s*/g, ' ').trim()} ${sql}`;
        }
        toegepast.push(a.reden);
    }
    return { sql, toegepast };
}
