/* ═══════════════════════════════════════════════════════════════════
   Archief Bonnenkistje — Realistic Data
   Dutch BBQ catering receipts: Sligro, Hanos, Jumbo, etc.
   ═══════════════════════════════════════════════════════════════════ */

const ARCHIEF_BONNEN = [
  { id:'bon-001', supplier:'Sligro', date:'2026-05-22', amount:487.30, btw9:28.40, btw21:12.80, category:'Vlees & vis', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['bbq-seizoen','event-jansen'], items:18, snippet:'Spareribs 10kg, pulled pork 8kg, ⟨baktotaal⟩ hout 25kg ingekocht voor seizoensvoorraad...', locked:false, hasEvent:'Jansen BBQ' },
  { id:'bon-002', supplier:'Hanos', date:'2026-05-20', amount:312.55, btw9:22.10, btw21:8.50, category:'Kruiden & sauzen', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['sauzen','voorraad'], items:24, snippet:'Memphis dry rub 5kg, hickory BBQ sauce 4L, chimichurri bulk...', locked:false, hasEvent:null },
  { id:'bon-003', supplier:'Sligro', date:'2026-05-18', amount:234.50, btw9:14.20, btw21:6.30, category:'Houtskool & rookhout', rgs:'WInkMat', status:'bevestigd', type:'pdf', tags:['rookhout','materiaal'], items:8, snippet:'Heeft het ⟨baktotaal⟩ hout 25kg ingekocht voor BBQ Architect seizoensopening...', locked:false, hasEvent:'Seizoensopening' },
  { id:'bon-004', supplier:'Jumbo', date:'2026-05-17', amount:67.82, btw9:4.80, btw21:2.10, category:'Zuivel & bakkerij', rgs:'WInkVrd', status:'bevestigd', type:'image', tags:['last-minute'], items:12, snippet:'Roomboter 6×250g, eieren scharrel 60st, volle melk 4L...', locked:false, hasEvent:'Buurtfeest' },
  { id:'bon-005', supplier:'Hanos', date:'2026-05-15', amount:589.20, btw9:38.60, btw21:14.20, category:'Vlees & vis', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['event-corporate','brisket'], items:14, snippet:'Black angus brisket 12kg, wagyu burgers 80st, zalm filet 5kg...', locked:true, hasEvent:'Corporate BBQ TechCo' },
  { id:'bon-006', supplier:'Makro', date:'2026-05-14', amount:156.40, btw9:10.20, btw21:4.80, category:'Dranken', rgs:'WInkVrd', status:'twijfel', type:'pdf', tags:['dranken','event-corporate'], items:32, snippet:'Cola zero 48×330ml, Spa blauw 24×500ml, Heineken 0.0 24×...', locked:false, hasEvent:'Corporate BBQ TechCo' },
  { id:'bon-007', supplier:'Sligro', date:'2026-05-12', amount:423.10, btw9:26.80, btw21:11.40, category:'Vlees & vis', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['bbq-seizoen','spareribs'], items:16, snippet:'Baby back ribs 15kg, kippenvleugels 10kg, merguez worst 5kg...', locked:false, hasEvent:null },
  { id:'bon-008', supplier:'Shell', date:'2026-05-11', amount:89.50, btw9:0, btw21:15.50, category:'Brandstof', rgs:'WAutKst', status:'bevestigd', type:'image', tags:['logistiek','bus'], items:1, snippet:'Diesel 52.3L, BP Ultimate diesel, km-stand: 124.892...', locked:false, hasEvent:null },
  { id:'bon-009', supplier:'Hanos', date:'2026-05-10', amount:278.90, btw9:18.40, btw21:7.60, category:'Groenten & fruit', rgs:'WInkVrd', status:'pending', type:'pdf', tags:['vers','salade'], items:22, snippet:'Coleslaw mix 8kg, mais kolven 100st, paprika driekleur 5kg, tomaten...', locked:false, hasEvent:'Festival Zomer' },
  { id:'bon-010', supplier:'Albert Heijn', date:'2026-05-09', amount:34.20, btw9:2.40, btw21:1.10, category:'Zuivel & bakkerij', rgs:'WInkVrd', status:'bevestigd', type:'image', tags:['last-minute'], items:6, snippet:'Brioche buns 24st, knoflookboter 4×100g...', locked:false, hasEvent:null },
  { id:'bon-011', supplier:'Sligro', date:'2026-05-08', amount:645.80, btw9:42.10, btw21:16.80, category:'Vlees & vis', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['brisket','pulled-pork','bulk'], items:20, snippet:'Whole brisket USDA Choice 3×6kg, pork shoulder 4×5kg, beef ribs...', locked:true, hasEvent:'Bruiloft De Vries' },
  { id:'bon-012', supplier:'Hanos', date:'2026-05-06', amount:198.30, btw9:12.80, btw21:5.40, category:'Disposables', rgs:'WInkMat', status:'bevestigd', type:'pdf', tags:['materiaal','disposable'], items:15, snippet:'Kraft bowls 500st, houten bestek sets 200st, servetten zwart 1000st...', locked:false, hasEvent:null },
  { id:'bon-013', supplier:'Makro', date:'2026-05-04', amount:112.60, btw9:7.20, btw21:3.40, category:'Dranken', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['dranken'], items:18, snippet:'Limonade huismerk 20L, tonic 24×200ml, ginger beer 12×...', locked:false, hasEvent:null },
  { id:'bon-014', supplier:'Sligro', date:'2026-05-02', amount:367.40, btw9:24.20, btw21:9.80, category:'Vlees & vis', rgs:'WInkVrd', status:'vergrendeld', type:'pdf', tags:['spareribs','event-buurt'], items:14, snippet:'St. Louis ribs 12kg, kipfilet 8kg, garnalen black tiger 3kg...', locked:true, hasEvent:'Buurtfeest' },
  { id:'bon-015', supplier:'Total', date:'2026-04-30', amount:94.20, btw9:0, btw21:16.36, category:'Brandstof', rgs:'WAutKst', status:'bevestigd', type:'image', tags:['logistiek'], items:1, snippet:'Diesel 55.1L, Total Excellium, km-stand: 124.340...', locked:false, hasEvent:null },
  { id:'bon-016', supplier:'Hanos', date:'2026-04-28', amount:445.70, btw9:30.20, btw21:12.10, category:'Kruiden & sauzen', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['sauzen','marinades','bulk'], items:28, snippet:'Carolina gold mustard 6L, apple cider vinegar 10L, ⟨baktotaal⟩ meel...', locked:false, hasEvent:null },
  { id:'bon-017', supplier:'Jumbo', date:'2026-04-26', amount:45.30, btw9:3.20, btw21:1.40, category:'Zuivel & bakkerij', rgs:'WInkVrd', status:'bevestigd', type:'image', tags:['last-minute','zuivel'], items:8, snippet:'Crème fraîche 6×200ml, boter ongezouten 4×250g...', locked:false, hasEvent:null },
  { id:'bon-018', supplier:'Sligro', date:'2026-04-24', amount:523.60, btw9:34.80, btw21:13.60, category:'Vlees & vis', rgs:'WInkVrd', status:'bevestigd', type:'pdf', tags:['event-corporate','wagyu'], items:16, snippet:'Wagyu ribeye A5 2kg, dry-aged tomahawk 8st, lamb rack...', locked:true, hasEvent:'Gala Diner VIP' },
];

const ARCHIEF_LEVERANCIERS = [
  { name: 'Sligro', count: 6, total: 2681.70 },
  { name: 'Hanos', count: 5, total: 1824.65 },
  { name: 'Makro', count: 2, total: 269.00 },
  { name: 'Jumbo', count: 2, total: 113.12 },
  { name: 'Shell', count: 1, total: 89.50 },
  { name: 'Total', count: 1, total: 94.20 },
  { name: 'Albert Heijn', count: 1, total: 34.20 },
];

const ARCHIEF_TAGS = [
  'bbq-seizoen', 'event-corporate', 'spareribs', 'brisket', 'pulled-pork',
  'sauzen', 'voorraad', 'last-minute', 'logistiek', 'dranken',
  'materiaal', 'bulk', 'zuivel', 'marinades', 'rookhout',
];

const ARCHIEF_RGS = [
  { code: 'WInkVrd', label: 'Inkoop voorraad', count: 14 },
  { code: 'WInkMat', label: 'Inkoop materiaal', count: 2 },
  { code: 'WAutKst', label: 'Autokosten', count: 2 },
  { code: 'WOvBdk', label: 'Overige bedrijfskosten', count: 0 },
  { code: 'WPerKst', label: 'Personeelskosten', count: 0 },
];

const ARCHIEF_INBOX = [
  { id: 'inb-1', from: 'facturen@sligro.nl', subject: 'Factuur F2026-0892 — mei levering', date: '2026-05-24', size: '2.4 MB', type: 'pdf', status: 'nieuw' },
  { id: 'inb-2', from: 'noreply@hanos.nl', subject: 'Uw bestelling #H-44891 bevestiging + factuur', date: '2026-05-23', size: '1.8 MB', type: 'pdf', status: 'nieuw' },
  { id: 'inb-3', from: 'admin@makro.nl', subject: 'Creditnota CN-2026-112', date: '2026-05-21', size: '890 KB', type: 'pdf', status: 'verwerkt' },
  { id: 'inb-4', from: 'facturen@shell.nl', subject: 'Tankbon mei 2026', date: '2026-05-19', size: '340 KB', type: 'pdf', status: 'verwerkt' },
];

const ARCHIEF_AUDIT_LOG = [
  { ts: '2026-05-22 14:32', user: 'Mathijs B.', action: 'Bon gescand via camera', detail: 'OCR + AI categorisatie in 4.2s' },
  { ts: '2026-05-22 14:33', user: 'AI', action: 'Auto-categorisatie: Vlees & vis', detail: 'Confidence 94% — Sligro herkend via KvK' },
  { ts: '2026-05-22 14:33', user: 'AI', action: 'Event-koppeling: Jansen BBQ', detail: 'Match op datum + leverancier patroon' },
  { ts: '2026-05-22 14:35', user: 'Mathijs B.', action: 'Status → Bevestigd', detail: '' },
  { ts: '2026-05-22 14:36', user: 'Systeem', action: 'Voorraad bijgewerkt', detail: '+10kg spareribs, +8kg pulled pork' },
];

const ARCHIEF_STOCK_MOVEMENTS = [
  { item: 'Spareribs', qty: '+10 kg', bon: 'bon-001', date: '2026-05-22', warehouse: 'Koeling A' },
  { item: 'Pulled pork (rauw)', qty: '+8 kg', bon: 'bon-001', date: '2026-05-22', warehouse: 'Koeling A' },
  { item: 'Rookhout hickory', qty: '+25 kg', bon: 'bon-001', date: '2026-05-22', warehouse: 'Opslag droog' },
];

/* Computed totals */
const ARCHIEF_TOTALS = {
  count: ARCHIEF_BONNEN.length,
  total: ARCHIEF_BONNEN.reduce((s, b) => s + b.amount, 0),
  btw9: ARCHIEF_BONNEN.reduce((s, b) => s + b.btw9, 0),
  btw21: ARCHIEF_BONNEN.reduce((s, b) => s + b.btw21, 0),
};

Object.assign(window, {
  ARCHIEF_BONNEN, ARCHIEF_LEVERANCIERS, ARCHIEF_TAGS, ARCHIEF_RGS,
  ARCHIEF_INBOX, ARCHIEF_AUDIT_LOG, ARCHIEF_STOCK_MOVEMENTS, ARCHIEF_TOTALS,
});
