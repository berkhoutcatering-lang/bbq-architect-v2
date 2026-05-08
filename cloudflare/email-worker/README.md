# bbqarchitect email-router (Cloudflare Worker)

De inbound-route voor `/price-intelligence` Inbox-lane. Vangt elke mail
op `in.bbqarchitect.app` op, parsest attachments, en POST't een ondertekende
payload naar `/api/email/inbound` van de hoofd-app.

## Eenmalige setup

1. Op Cloudflare dashboard:
   - Voeg de domein `bbqarchitect.app` toe (of zone die je al hebt)
   - DNS → maak subdomein `in.bbqarchitect.app` met MX → `route.mx.cloudflare.net`
   - Email → Email Routing → enable
   - Email → Routing rules → catch-all → "Send to Worker" → `bbqarchitect-email-router`

2. Lokale install:
   ```bash
   cd cloudflare/email-worker
   pnpm install
   pnpm add postal-mime
   ```

3. Secrets zetten:
   ```bash
   pnpm exec wrangler secret put EMAIL_INBOUND_SECRET
   # plak hier dezelfde string als EMAIL_INBOUND_SECRET in je .env van de Next-app
   pnpm exec wrangler secret put APP_URL
   # plak: https://app.bbqarchitect.app
   ```

4. Deploy:
   ```bash
   pnpm exec wrangler deploy
   ```

## Sam: zo werkt het in de praktijk

Per organisatie krijg je een eigen inbox-adres in de UI:
`pl-{jouw-org-slug}@in.bbqarchitect.app`. Voorbeeld:
`pl-hopbites@in.bbqarchitect.app`.

Wat je doet:
1. Open de mail van je leverancier (Hanos / Sligro / wat dan ook).
2. Druk op **Doorsturen** en plak het adres.
3. Of beter: zet een filter in Gmail/Outlook zodat álle mail van
   `vlees@hanos.nl` automatisch hier naartoe wordt geforward — dan hoef je
   het nooit meer met de hand te doen.

Binnen ~30 seconden verschijnt de mail in **Price Intelligence → Inbox**
met een knop "Review N prijsmutaties".

## Wat de Worker doet

1. Ontvangt mail op `pl-*@in.bbqarchitect.app`
2. Leest SPF/DKIM-resultaat (anti-spoofing)
3. Parsed MIME via `postal-mime` → list of attachments + body
4. Schrijft een JSON-payload, ondertekend met HMAC-SHA256
5. POST naar `/api/email/inbound` van de Next-app
6. Klaar — Next-app dedupt op message-id en triggert vision-parsing

## Wat de Worker NIET doet

- Geen DB-toegang — alle storage gaat via de Next-app
- Geen attachments-cache — elke mail one-shot doorgestuurd
- Geen retry — als forward faalt, mail is vergeten (P2: dead-letter queue
  via Cloudflare Queues)
