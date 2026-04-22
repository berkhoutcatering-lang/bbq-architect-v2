export default function VoorwaardenPage() {
  return (
    <>
      <h1>Algemene voorwaarden</h1>
      <p className="text-[12px] uppercase tracking-[0.15em] text-[var(--muted)]">Versie 1.0 · 2026-04-21</p>

      <p>
        <strong className="text-[var(--color-accent-gold)]">Concept — nog te reviewen door jurist.</strong>
        Deze voorwaarden gelden voor het gebruik van BBQ Architect (&ldquo;de Dienst&rdquo;) aangeboden door
        Berkhout Catering. Door een account aan te maken accepteer je deze voorwaarden.
      </p>

      <h2>1. Begrippen</h2>
      <ul>
        <li><strong>Aanbieder:</strong> Berkhout Catering, ingeschreven bij de KvK onder nummer [TODO], gevestigd te [TODO Adres].</li>
        <li><strong>Klant:</strong> de natuurlijke persoon of rechtspersoon die een abonnement op de Dienst afsluit.</li>
        <li><strong>Dienst:</strong> de SaaS-applicatie BBQ Architect inclusief alle modules, AI-functies en integraties.</li>
        <li><strong>Tier:</strong> abonnementsniveau (Starter, Pro of Enterprise) zoals gepubliceerd op /pricing.</li>
      </ul>

      <h2>2. Totstandkoming overeenkomst</h2>
      <p>De overeenkomst komt tot stand zodra de Klant zich registreert en de signup voltooit. Een gratis trial van 60 dagen geldt automatisch.</p>

      <h2>3. Betaling</h2>
      <p>Na de trial wordt het gekozen tier maandelijks of jaarlijks vooruit betaald via iDEAL of automatische incasso (Mollie). Prijzen zijn exclusief 21% BTW.</p>

      <h2>4. Looptijd en opzegging</h2>
      <p>Het abonnement loopt maandelijks of jaarlijks en wordt automatisch verlengd. Opzeggen kan op ieder moment via Instellingen → Abonnement, met opzegtermijn aan het einde van de huidige termijn (geen restitutie).</p>

      <h2>5. AI-gebruik</h2>
      <p>De Dienst gebruikt AI (Anthropic Claude) om offertes, recepten en menu&apos;s te genereren. Per tier geldt een maandelijkse cap voor AI-acties (zie /pricing). Bij overschrijding kan de Klant tijdelijk minder AI-acties uitvoeren of upgraden.</p>
      <p>AI-output is een suggestie. De Klant blijft verantwoordelijk voor controle en juiste toepassing.</p>

      <h2>6. Beschikbaarheid en onderhoud</h2>
      <p>De Aanbieder streeft naar minimaal 99,5% uptime per kalendermaand, exclusief gepland onderhoud. Onderhoudsvensters worden minimaal 24 uur vooraf aangekondigd.</p>

      <h2>7. Aansprakelijkheid</h2>
      <p>De aansprakelijkheid van de Aanbieder is beperkt tot het bedrag dat de Klant in de afgelopen 12 maanden voor de Dienst heeft betaald. Indirecte schade (gederfde winst, gemiste kansen) is uitgesloten, voor zover wettelijk toegestaan.</p>

      <h2>8. Eigen data en export</h2>
      <p>Alle data die de Klant in de Dienst plaatst blijft eigendom van de Klant. De Klant heeft op ieder moment het recht een volledige data-export te downloaden via Instellingen → Data &amp; Privacy.</p>

      <h2>9. Beëindiging en data-verwijdering</h2>
      <p>Bij opzegging blijft de data 30 dagen bewaard, daarna wordt deze permanent verwijderd. Een laatste export wordt aangeboden tijdens de opzeg-flow.</p>

      <h2>10. Wijzigingen</h2>
      <p>De Aanbieder mag deze voorwaarden wijzigen. Inhoudelijke wijzigingen worden minimaal 30 dagen vooraf per e-mail gecommuniceerd. De Klant kan dan kosteloos opzeggen.</p>

      <h2>11. Toepasselijk recht</h2>
      <p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement van de Aanbieder.</p>

      <h2>12. Contact</h2>
      <p>Vragen? Mail <a href="mailto:support@bbqarchitect.nl" className="text-[var(--color-accent-gold)]">support@bbqarchitect.nl</a>.</p>
    </>
  );
}
