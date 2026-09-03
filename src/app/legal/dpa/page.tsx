import ConceptMelding from '@/components/legal/ConceptMelding';
import { aanbieder } from '@/lib/legal';

export default function DpaPage() {
  return (
    <>
      <h1>Verwerkersovereenkomst (DPA)</h1>
      <p className="text-[12px] uppercase tracking-[0.15em] text-[var(--muted)]">Versie 1.0 · 2026-04-21</p>

      <ConceptMelding />

      <p>
        Deze verwerkersovereenkomst (DPA) hoort bij de algemene voorwaarden van BBQ Architect en is van kracht
        zodra Klant en Aanbieder een overeenkomst aangaan voor de Dienst. Klant is Verwerkingsverantwoordelijke,
        Aanbieder is Verwerker in de zin van artikel 28 AVG.
      </p>

      <h2>1. Onderwerp</h2>
      <p>De Verwerker verwerkt persoonsgegevens namens de Verwerkingsverantwoordelijke voor het leveren van de SaaS-dienst BBQ Architect.</p>

      <h2>2. Aard van de verwerking</h2>
      <p>Opslag, verwerking en weergave van klant-, event-, factuur- en HACCP-data ten behoeve van de catering-operatie van de Klant.</p>

      <h2>3. Categorieën betrokkenen</h2>
      <ul>
        <li>Eindklanten van de Klant (natuurlijke personen die catering bestellen)</li>
        <li>Medewerkers van de Klant (uren, taken)</li>
        <li>Leveranciers (contactpersonen)</li>
      </ul>

      <h2>4. Categorieën persoonsgegevens</h2>
      <ul>
        <li>NAW-gegevens, e-mail, telefoon</li>
        <li>Bestelgeschiedenis, eventdata</li>
        <li>Geen bijzondere persoonsgegevens (artikel 9 AVG)</li>
      </ul>

      <h2>5. Sub-verwerkers</h2>
      <p>De Verwerker maakt gebruik van de volgende sub-verwerkers. De Klant geeft hiervoor algemene toestemming. Wijzigingen worden minimaal 30 dagen vooraf gemeld; de Klant kan dan bezwaar maken.</p>
      <ul>
        <li><strong>Supabase (Equoid Inc.)</strong> — database, authenticatie, file storage. EU-region (Frankfurt).</li>
        <li><strong>Anthropic, PBC</strong> — AI-completions. US-region. Zero-retention via API-Tier (data wordt niet gebruikt voor training).</li>
        <li><strong>Mollie B.V.</strong> — betalingen. NL.</li>
        <li><strong>Resend Inc.</strong> — transactional e-mail. EU/US.</li>
      </ul>

      <h2>6. Doorgifte buiten de EER</h2>
      <p>Doorgifte naar de VS (Anthropic, Resend) gebeurt onder de EU-US Data Privacy Framework adequaatheidsbesluit, of bij ontbreken daarvan onder Standard Contractual Clauses (SCC&apos;s).</p>

      <h2>7. Beveiligingsmaatregelen (artikel 32 AVG)</h2>
      <ul>
        <li>Versleuteling in transit (TLS 1.3) en at-rest (AES-256)</li>
        <li>Row-Level-Security per organisatie op database-niveau</li>
        <li>Toegangscontrole via auth0/Supabase Auth met bcrypt-wachtwoorden</li>
        <li>Periodieke security-audits en pen-tests vóór GA-launch</li>
        <li>Logging van toegang via service-role tot persoonsgegevens</li>
        <li>Backup-strategie: dagelijkse backups, point-in-time recovery (Supabase Pro)</li>
      </ul>

      <h2>8. Datalek-meldplicht</h2>
      <p>De Verwerker meldt datalekken zonder onnodige vertraging, maar in elk geval binnen 24 uur na ontdekking, aan de Klant via e-mail aan het op het account geregistreerde adres.</p>

      <h2>9. Bewaartermijnen</h2>
      <p>Zoals beschreven in /legal/privacy. Na opzegging: 30 dagen bewaring, daarna definitief verwijderd. De Klant ontvangt vooraf een data-export.</p>

      <h2>10. Audit-recht</h2>
      <p>De Klant heeft het recht om jaarlijks een audit uit te voeren of een derde partij dat te laten doen, na schriftelijk verzoek met minimaal 30 dagen vooraankondiging. Onafhankelijke security-rapportages (bv. SOC2) van sub-verwerkers worden op verzoek gedeeld.</p>

      <h2>11. Beëindiging en data-teruggave</h2>
      <p>Na beëindiging van de overeenkomst kan de Klant alle data downloaden via Instellingen → Data &amp; Privacy. Na 30 dagen wordt de data permanent verwijderd uit alle systemen, inclusief sub-verwerkers (voor zover technisch mogelijk).</p>

      <h2>12. Aansprakelijkheid</h2>
      <p>De aansprakelijkheid van de Verwerker is beperkt zoals omschreven in de algemene voorwaarden. AVG-boetes blijven voor de eigen rekening van de partij die ze veroorzaakt.</p>

      <h2>13. Versie en wijzigingen</h2>
      <p>Deze DPA versie 1.0 is van kracht vanaf 2026-04-21. Wijzigingen worden 30 dagen vooraf gecommuniceerd.</p>
    </>
  );
}
