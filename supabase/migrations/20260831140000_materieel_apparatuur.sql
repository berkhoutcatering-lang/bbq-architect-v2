-- ════════════════════════════════════════════════════════════════════════
-- Materieel wordt de hele keuken — niet alleen het servies
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/agent-architectuur-plan.md hoofdstuk 4.3 en 6.8.
--
-- Waarom hier en niet in een nieuwe `equipment`-tabel: `materieel` heeft al
-- afmetingen, locatie, aantal, foto én een AI-scan die een productpagina of
-- productfoto uitleest. Een tweede spullenlijst ernaast is precies het soort
-- splitsing waar je later spijt van krijgt — dat gebeurde eerder al met
-- gerechten en recepten. Eén plek voor alles wat je hebt, met een `soort` dat
-- zegt wat het ís.
--
-- De gedachte achter de nieuwe velden: apparatuur is geen controlelijst maar
-- een ONTWERPBRON. Een machine die stilstaat is betaald en levert niets op.
-- `maakt_mogelijk`, `versnelling_factor` en `hulpstukken_aanwezig` maken van
-- "past dit in de smoker?" de nuttigere vraag "wat kan ik hiermee maken dat
-- met de hand te duur is?".
--
-- Splitsing die veel invoerwerk scheelt: WAT IETS IS staat in de kennisbank
-- (een GN 1/1-65 is overal 530×325×65 mm), WAT JIJ ERVAN HEBT staat hier
-- (er liggen er zeven, in de bus, waarvan één met een scheur).
--
-- Alle kolommen met `if not exists`: een deel van deze tabel is ooit buiten de
-- migraties om aangemaakt, dus we nemen niets aan over wat er al staat.

-- ─── 1. Wat voor soort spul is het ─────────────────────────────────────
alter table public.materieel
  add column if not exists soort text;

comment on column public.materieel.soort is
  'servies | apparatuur | opslag | meubilair | transport | gn_bak. Bepaalt '
  'welke velden hieronder zinvol zijn en welk scherm het item toont.';

-- ─── 2. Productidentiteit — wordt gevuld door de link-lezer ────────────
alter table public.materieel
  add column if not exists merk text,
  add column if not exists model text,
  add column if not exists artikelnummer text,
  add column if not exists product_url text;

comment on column public.materieel.product_url is
  'De productpagina waar de specificaties vandaan komen. De scan-route leest '
  'die uit; hier bewaard zodat je later kunt nazoeken waar een maat op berust.';

-- ─── 3. Maten om mee te rekenen ────────────────────────────────────────
-- `afmetingen` blijft bestaan voor wat een mens leest ("25cm rond"). Deze
-- velden zijn om mee te rekenen: past de bak in de cambro, past de cambro in
-- de bus.
alter table public.materieel
  add column if not exists breedte_mm integer,
  add column if not exists diepte_mm  integer,
  add column if not exists hoogte_mm  integer,
  add column if not exists gewicht_g  integer;

-- ─── 4. Capaciteit en temperatuur ──────────────────────────────────────
alter table public.materieel
  add column if not exists capaciteit_waarde  numeric,
  add column if not exists capaciteit_eenheid text,
  add column if not exists temp_min_c numeric,
  add column if not exists temp_max_c numeric,
  add column if not exists concurrent_jobs integer;

comment on column public.materieel.capaciteit_eenheid is
  'liter | gn_slots | kg | m2 | borden. Bepaalt hoe capaciteit_waarde gelezen '
  'wordt bij de "past dit erin?"-berekening.';

comment on column public.materieel.concurrent_jobs is
  'Hoeveel processen tegelijk. Smoker = 1, werkbank = 1, stelling = veel. '
  'Zonder dit getal kan een planning twee dingen tegelijk in één smoker zetten.';

-- ─── 5. Gastronorm ─────────────────────────────────────────────────────
-- Twee kanten: iets IS een GN-bak (gn_code), of er PASSEN GN-bakken in
-- (gn_compatibel) — een cambro, een koeling, een transportkist.
alter table public.materieel
  add column if not exists gn_code text,
  add column if not exists gn_compatibel text[];

comment on column public.materieel.gn_code is
  'Verwijst naar gn_maten.code als dit item zelf een GN-bak is. De maten en '
  'inhoud staan daar — hier alleen hoeveel je er hebt en waar ze liggen.';

-- ─── 6. Waar het staat en of het meegaat ───────────────────────────────
alter table public.materieel
  add column if not exists gaat_mee_op_locatie boolean;

comment on column public.materieel.gaat_mee_op_locatie is
  'Blijft dit thuis of gaat het de bus in. Bepaalt wat er op locatie kán, en '
  'daarmee welke afwerkstappen daar ingepland mogen worden.';

-- ─── 7. Wat een machine mogelijk maakt ─────────────────────────────────
-- Dit is het blok dat van de lijst een ontwerpbron maakt.
alter table public.materieel
  add column if not exists maakt_mogelijk text[],
  add column if not exists hulpstukken_aanwezig text[],
  add column if not exists hulpstukken_beschikbaar jsonb,
  add column if not exists versnelling_factor numeric,
  add column if not exists gelijkmatig boolean,
  add column if not exists capaciteit_per_uur numeric,
  add column if not exists min_porties_rendabel integer,
  add column if not exists aanschafprijs_cents integer;

comment on column public.materieel.maakt_mogelijk is
  'Welke bewerkingen dit apparaat aankan: brunoise 3 mm, julienne, flinterdun '
  'schaven. Een machine kan alleen wat zijn hulpstukken kunnen — vandaar dat '
  'hulpstukken_aanwezig hiernaast staat.';

comment on column public.materieel.hulpstukken_beschikbaar is
  'Wat er te koop is voor dit apparaat, met prijs: [{"naam":"brunoise-blad '
  '3mm","prijs_cents":24500}]. Voedt het investeringsadvies — een blad voor '
  'een machine die je al hebt verslaat vrijwel altijd een nieuwe machine.';

comment on column public.materieel.min_porties_rendabel is
  'Vanaf hoeveel porties het loont om dit apparaat op te bouwen en schoon te '
  'maken. Voor twaalf porties is snijden sneller dan de machine klaarzetten.';

comment on column public.materieel.versnelling_factor is
  'Hoeveel sneller dan met de hand. De factor die een gerecht betaalbaar maakt '
  'en dus de terugverdientijd bepaalt.';

-- ─── 8. Gastronorm-referentie ──────────────────────────────────────────
-- Wereldstandaard (EN 631-1), dus naslag zonder organization_id — zelfde
-- keuze als smaak_assen en technieken. Wordt gevuld uit
-- data/kennisbank/gn-maten.json.
create table if not exists public.gn_maten (
  code              text primary key,
  naam              text    not null,
  lengte_mm         integer not null,
  breedte_mm        integer not null,
  diepte_mm         integer not null,
  inhoud_liter      numeric,
  vulgraad          numeric default 0.85,
  stapelbaar        boolean default true,
  bron              text,
  created_at        timestamptz not null default now()
);

comment on table public.gn_maten is
  'Gastronorm-maten volgens EN 631-1. Buitenmaten liggen vast; inhoud is '
  'nominaal en verschilt licht per fabrikant. vulgraad is de realistische '
  'vulling — een bak tot de rand vullen kan niet met vloeistof op een bus.';

comment on column public.gn_maten.vulgraad is
  'Realistisch vulbaar deel. Vast product mag hoger (0,90), vloeistof lager '
  '(0,80). Zonder dit getal rekent een capaciteitscheck zich rijk.';

alter table public.gn_maten enable row level security;

drop policy if exists gn_maten_select on public.gn_maten;
create policy gn_maten_select on public.gn_maten
  for select to authenticated using (true);

-- ─── 9. Zoeken op soort ────────────────────────────────────────────────
create index if not exists idx_materieel_soort
  on public.materieel (organization_id, soort);

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
