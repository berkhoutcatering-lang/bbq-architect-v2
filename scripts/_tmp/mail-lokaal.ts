import { maakSupabaseStore } from '../../src/lib/winkel/supabaseStore';
import { stuurBevestigingsmail } from '../../src/lib/winkel/mail';
async function main() {
    const store = maakSupabaseStore();
    const tenant = (await store.laadTenant('hop-en-bites'))!;
    const order = (await store.vindOrderOpToken(tenant.orgId, process.argv[2]!))!;
    const regels = await store.laadRegels(order.id);
    const moment = order.moment_id ? await store.laadMoment(order.moment_id) : null;
    const r = await stuurBevestigingsmail({ tenant, order, regels, moment });
    console.log(r);
    await store.noteerMail(order.id, r.success ? 'verstuurd' : 'mislukt', r.success ? null : r.error ?? 'onbekend');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
