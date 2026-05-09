export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy-statement</h1>
      <p className="text-[12px] uppercase tracking-[0.15em] text-[var(--muted)]">Versie 1.0 · 2026-04-21</p>

      <p>
        <strong className="text-[var(--color-accent-gold)]">Concept — nog te reviewen door jurist.</strong>
        BBQ Architect respecteert je privacy. Hieronder leggen we uit welke gegevens we verzamelen,
        waarom, hoe lang we ze bewaren en welke rechten je hebt onder de AVG.
      </p>

      <h2>1. Verwerkingsverantwoordelijke</h2>
      <p>Berkhout Catering, KvK {process.env.NEXT_PUBLIC_KVK_NUMBER ?? '—'}, {process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? '—'}. Vragen via <a href="mailto:privacy@bbqarchitect.nl" className="text-[var(--color-accent-gold)]">privacy@bbqarchitect.nl</a>.</p>

      <h2>2. Welke gegevens verwerken we?</h2>
      <ul>
        <li><strong>Account:</strong> e-mailadres, naam, organisatienaam, hashed wachtwoord</li>
        <li><strong>Bedrijf:</strong> KvK-nummer, BTW-nummer, vestigingsadres (indien ingevuld)</li>
        <li><strong>Klantdata van jou:</strong> klanten, gerechten, offertes, facturen, events, HACCP-logs</li>
        <li><strong>Gebruiksdata:</strong> activatie-events, AI-actie-tellers, foutmeldingen (alleen technisch)</li>
        <li><strong>Betaling:</strong> alleen referenties (geen kaartnummers — die staan bij Mollie)</li>
      </ul>

      <h2>3. Waarom?</h2>
      <ul>
        <li><strong>Uitvoering overeenkomst</strong> (artikel 6.1.b AVG): account-beheer, factureren, support</li>
        <li><strong>Wettelijke verplichting</strong> (6.1.c): bewaarplicht boekhouding, BTW</li>
        <li><strong>Gerechtvaardigd belang</strong> (6.1.f): productverbetering via geanonimiseerde gebruiksdata</li>
      </ul>

      <h2>4. Sub-verwerkers</h2>
      <p>We delen data met de volgende verwerkers (allen onder verwerkersovereenkomst, zie /legal/dpa):</p>
      <ul>
        <li><strong>Supabase (Equoid Inc, EU)</strong> — database, authenticatie, file storage. Data-residency: eu-central-1 (Frankfurt).</li>
        <li><strong>Anthropic (US)</strong> — AI-completions voor offerte-wizard, chat, recept-AI. Data wordt niet gebruikt voor model-training (zero-retention via API-Tier).</li>
        <li><strong>Mollie (NL)</strong> — betalingen iDEAL, abonnementen.</li>
        <li><strong>Resend (US/EU)</strong> — verzending transactional e-mails (offertes, facturen).</li>
      </ul>

      <h2>5. Bewaartermijnen</h2>
      <ul>
        <li>Actieve klantdata: zo lang het abonnement loopt</li>
        <li>Na opzegging: 30 dagen bewaard, daarna verwijderd</li>
        <li>Boekhoudkundige documenten (facturen): 7 jaar (wettelijke bewaarplicht)</li>
        <li>Activatie-events en error-logs: 12 maanden</li>
      </ul>

      <h2>6. Jouw rechten (AVG hoofdstuk 3)</h2>
      <ul>
        <li><strong>Inzage:</strong> overzicht van data via Instellingen → Data &amp; Privacy</li>
        <li><strong>Rectificatie:</strong> alle data is bewerkbaar in de app</li>
        <li><strong>Verwijdering:</strong> opzeggen + verzoek tot verwijdering binnen 30 dagen</li>
        <li><strong>Dataportabiliteit:</strong> 1-klik JSON-export via Instellingen → Data &amp; Privacy</li>
        <li><strong>Bezwaar:</strong> mail privacy@bbqarchitect.nl</li>
        <li><strong>Klacht bij de AP:</strong> <a href="https://www.autoriteitpersoonsgegevens.nl/" className="text-[var(--color-accent-gold)]">autoriteitpersoonsgegevens.nl</a></li>
      </ul>

      <h2>7. Beveiliging</h2>
      <ul>
        <li>HTTPS overal</li>
        <li>Wachtwoorden gehashed met bcrypt</li>
        <li>Row-Level-Security: elke organisatie ziet alleen eigen data, gegarandeerd op database-niveau</li>
        <li>Periodieke penetratie-tests vóór commerciële launch</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>We gebruiken alleen functionele cookies (sessie, voorkeuren). Geen tracking-cookies, geen advertising-cookies. Daarom geen consent-banner verplicht.</p>

      <h2>9. Wijzigingen</h2>
      <p>Bij inhoudelijke wijzigingen melden we dit per e-mail én bij eerstvolgende inlog.</p>
    </>
  );
}
