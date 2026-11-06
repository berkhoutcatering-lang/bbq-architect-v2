-- Inkomende klantmail met conceptantwoord.
-- Plan: docs/een-geheel-plan.md, "Inkomende mail en concepten".
--
-- Bouwt voort op org_email_inbox, die tot nu toe alleen prijslijsten kende.
-- Een concept verlaat de app alleen nadat iemand op Versturen drukt.

alter table public.org_email_inbox
    add column if not exists bron text not null default 'prijslijst'
        check (bron in ('prijslijst', 'klantmail')),
    add column if not exists body_text text,
    add column if not exists antwoord_aan text,
    add column if not exists klant_id integer references public.klanten(id) on delete set null,
    add column if not exists lead_id bigint references public.leads(id) on delete set null,
    add column if not exists winkel_order_id bigint references public.winkel_orders(id) on delete set null,
    add column if not exists concept_onderwerp text,
    add column if not exists concept_tekst text,
    add column if not exists concept_vragen text,
    add column if not exists concept_status text not null default 'geen'
        check (concept_status in ('geen', 'bezig', 'klaar', 'verstuurd', 'genegeerd', 'mislukt')),
    add column if not exists concept_fout text,
    add column if not exists behandeld_at timestamptz;

create index if not exists org_email_inbox_klantmail_idx
    on public.org_email_inbox (organization_id, received_at desc) where bron = 'klantmail';
create index if not exists org_email_inbox_klant_id_idx
    on public.org_email_inbox (klant_id) where klant_id is not null;

alter table public.settings
    add column if not exists mail_schrijfstijl text,
    add column if not exists mail_handtekening text;
