-- HACCP aan de partij (plan glistening-brewing-heron, fase 3).
--
-- Een meting hoort bij wat er gemaakt is. Tot nu hing haccp_records aan een
-- event, een gerecht of een plan-item; nu ook aan de taak (tablet) en de
-- partij. Zo is vanaf één zak terug te vinden welke kerntemperatuur erbij
-- gemeten is — en andersom. De rijen blijven append-only: een nieuwe meting
-- is een nieuwe rij, nooit een overschrijving.
--
-- component_haccp_points.verplicht_voor_vrijgave: welke punten er gemeten
-- moeten zijn vóór een partij vrijgegeven wordt. Standaard uit: het systeem
-- verzint geen regels, Mathijs zet ze zelf aan per bouwsteen.

alter table public.haccp_records
    add column if not exists prep_task_id integer references public.prep_tasks(id) on delete set null,
    add column if not exists partij_id uuid references public.productie_partijen(id) on delete set null,
    add column if not exists component_id bigint references public.components(id) on delete set null;

create index if not exists haccp_records_prep_task_idx on public.haccp_records (prep_task_id) where prep_task_id is not null;
create index if not exists haccp_records_partij_idx on public.haccp_records (partij_id) where partij_id is not null;

alter table public.component_haccp_points
    add column if not exists verplicht_voor_vrijgave boolean not null default false;

comment on column public.component_haccp_points.verplicht_voor_vrijgave is
    'Moet gemeten (en akkoord) zijn voordat een partij van deze bouwsteen wordt afgerond. Standaard false — geen verzonnen regels.';
comment on column public.haccp_records.partij_id is
    'De productiepartij waar deze meting bij hoort. Append-only: een nieuwe meting is een nieuwe rij.';
