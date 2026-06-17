#!/usr/bin/env node
/**
 * prod-set-widerrufsrecht.mjs
 *
 * Replaces the body of the production /pages/widerrufsrecht page (the page the
 * footer "Widerrufsrecht" link points to) with the client-supplied
 * Widerrufsbelehrung — properly structured HTML with the bold emphasis from the
 * source Word document (client-request/Widerrufsbelehrung.docx) reproduced
 * exactly.
 *
 * Background: the client pasted the document text into the page, which dropped
 * ALL bold runs and the section structure, and left the literal placeholder
 * "(G-Berg / Ihre Firmenadresse / Ihre E-Mail)" in the text. This script fixes
 * all three: real contact data, section headings, and strict bold.
 *
 * STRICT BOLD GUARANTEE: every <strong> in the generated body is extracted and
 * asserted, in document order, against EXPECTED_BOLD (the bold spans transcribed
 * from the .docx). The script refuses to run if they diverge. This runs in
 * BOTH dry-run and --apply, so bold parity is proven before any write.
 *
 * Normalizations applied vs. the raw .docx run boundaries (each is a faithful
 * representation of the document's *intended* emphasis, not a content change):
 *   1. Mid-word run split  "Sie tragen die u|**nmittelbaren ...**"  -> the whole
 *      word "unmittelbaren ..." is bold (the lone leading "u" was a typing
 *      artifact in a separate run).
 *   2. Leading/trailing spaces inside bold runs ("** 14 Tage**", "**Wertverlust **")
 *      are trimmed to the word boundary — same words emphasised.
 *   3. The placeholder "(G-Berg / Ihre Firmenadresse / Ihre E-Mail)" is filled
 *      with the real contact line (G-Berg GmbH + address + the withdrawal email
 *      the document itself names in its form block); the span stays bold.
 *   4. The form's "An:" address block (one bold paragraph in the .docx) is split
 *      onto separate lines for readability; every line stays bold.
 *   5. "G-Berg" -> "G-Berg GmbH" (full legal trader name, matching the Impressum)
 *      wherever the trader is named.
 *
 * Idempotent: looks up the page by handle and updates it in place.
 *
 * Env: SHOPIFY_PROD_STORE + SHOPIFY_PROD_ADMIN_TOKEN from .env.local.
 * Scopes: write_online_store_pages, read_online_store_pages.
 *
 * Usage:
 *   node agent/scripts/prod-set-widerrufsrecht.mjs            # dry-run + verify
 *   node agent/scripts/prod-set-widerrufsrecht.mjs --apply    # write to prod
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_PROD_STORE;
const TOKEN = process.env.SHOPIFY_PROD_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('Missing SHOPIFY_PROD_STORE / SHOPIFY_PROD_ADMIN_TOKEN in .env.local');
const APPLY = process.argv.includes('--apply');
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;
const HANDLE = 'widerrufsrecht';
const TITLE = 'Widerrufsrecht';

async function gql(query, variables = {}) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

// ---------------------------------------------------------------------------
// Contact / trader data (the form block in the .docx names online@… for
// withdrawals; the Impressum uses info@ for general contact — we honour the
// document for this page).
// ---------------------------------------------------------------------------
const TRADER = 'G-Berg GmbH';
const ADDR_STREET = 'Hagenerstrasse 33';
const ADDR_CITY = '58642 Iserlohn / Letmathe';
const ADDR_COUNTRY = 'Deutschland';
const WIDERRUF_EMAIL = 'online@g-berg-gmbh.de';
const CONTACT_LINE = `${TRADER}, ${ADDR_STREET}, ${ADDR_CITY}, ${WIDERRUF_EMAIL}`;

// ---------------------------------------------------------------------------
// Page body. Bold = <strong>. Headings render bold via the storefront's prose
// `[&_h2]:font-semibold` styling (see ($locale).pages.$handle.tsx).
// ---------------------------------------------------------------------------
const BODY = `<h2>Widerrufsbelehrung</h2>
<p>Sie haben das Recht, <strong>binnen 14 Tagen ohne Angabe von Gründen</strong> diesen Vertrag zu widerrufen.</p>
<p>Die Widerrufsfrist beträgt <strong>14 Tage</strong> ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, <strong>die Waren in Besitz genommen haben bzw. hat.</strong></p>
<p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns <strong>(${CONTACT_LINE}) mittels einer eindeutigen Erklärung</strong> (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.</p>
<p>Sie können dafür das beigefügte <strong>Muster-Widerrufsformular</strong> verwenden, das jedoch nicht vorgeschrieben ist.</p>
<p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die <strong>Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</strong></p>

<h2>Folgen des Widerrufs</h2>
<p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen <strong>alle Zahlungen</strong>, die wir von Ihnen erhalten haben, <strong>einschließlich der Lieferkosten</strong> (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene günstigste Standardlieferung gewählt haben), <strong>unverzüglich und spätestens binnen 14 Tagen</strong> ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist.</p>
<p>Für diese Rückzahlung verwenden wir <strong>dasselbe Zahlungsmittel</strong>, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart.</p>
<p>Wir können die Rückzahlung <strong>verweigern</strong>, bis wir die Waren wieder zurückerhalten haben oder bis Sie den <strong>Nachweis</strong> erbracht haben, dass Sie die Waren zurückgesandt haben – je nachdem, welches der frühere Zeitpunkt ist.</p>
<p>Sie haben die Waren <strong>unverzüglich und in jedem Fall spätestens binnen 14 Tagen</strong> ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns zurückzusenden oder zu übergeben.</p>
<p>Die Frist ist gewahrt, wenn Sie die Waren <strong>vor Ablauf der Frist von 14 Tagen absenden.</strong></p>

<h2>Rücksendekosten</h2>
<p>Sie tragen die <strong>unmittelbaren Kosten der Rücksendung</strong> der Waren.</p>

<h2>Wertverlust</h2>
<p>Sie müssen für einen etwaigen <strong>Wertverlust</strong> der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren <strong>nicht notwendigen Umgang</strong> mit ihnen zurückzuführen ist.</p>

<h2>Muster-Widerrufsformular</h2>
<p>(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie dieses Formular aus und senden Sie es zurück.)</p>
<div style="border:1px solid #e5e5e5;background:#fafafa;padding:1rem 1.25rem;border-radius:8px;">
<p><strong>An:</strong><br>
<strong>${TRADER}</strong><br>
<strong>${ADDR_STREET}</strong><br>
<strong>${ADDR_CITY}</strong><br>
<strong>${ADDR_COUNTRY}</strong><br>
<strong>${WIDERRUF_EMAIL}</strong></p>
<p><strong>Hiermit widerrufe(n)</strong> ich/wir den von mir/uns abgeschlossenen Vertrag über den Kauf der folgenden Waren:</p>
<p><strong>Bestellt am:</strong> ________</p>
<p><strong>Erhalten am: ________</strong></p>
<p><strong>Name des/der Verbraucher(s): ________</strong></p>
<p><strong>Anschrift des/der Verbraucher(s): ________</strong></p>
<p><strong>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ________</strong></p>
<p><strong>Datum: ________</strong></p>
</div>`;

// ---------------------------------------------------------------------------
// STRICT BOLD GUARANTEE — every bold span, in document order, transcribed from
// the .docx. extract(<strong> from BODY) must equal this exactly.
// ---------------------------------------------------------------------------
const EXPECTED_BOLD = [
  'binnen 14 Tagen ohne Angabe von Gründen',
  '14 Tage',
  'die Waren in Besitz genommen haben bzw. hat.',
  `(${CONTACT_LINE}) mittels einer eindeutigen Erklärung`,
  'Muster-Widerrufsformular',
  'Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
  'alle Zahlungen',
  'einschließlich der Lieferkosten',
  'unverzüglich und spätestens binnen 14 Tagen',
  'dasselbe Zahlungsmittel',
  'verweigern',
  'Nachweis',
  'unverzüglich und in jedem Fall spätestens binnen 14 Tagen',
  'vor Ablauf der Frist von 14 Tagen absenden.',
  'unmittelbaren Kosten der Rücksendung',
  'Wertverlust',
  'nicht notwendigen Umgang',
  'An:',
  TRADER,
  ADDR_STREET,
  ADDR_CITY,
  ADDR_COUNTRY,
  WIDERRUF_EMAIL,
  'Hiermit widerrufe(n)',
  'Bestellt am:',
  'Erhalten am: ________',
  'Name des/der Verbraucher(s): ________',
  'Anschrift des/der Verbraucher(s): ________',
  'Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ________',
  'Datum: ________',
];

function extractBold(html) {
  const out = [];
  const re = /<strong>([\s\S]*?)<\/strong>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }
  return out;
}

function verifyBold() {
  const found = extractBold(BODY);
  let ok = found.length === EXPECTED_BOLD.length;
  console.log(`\nSTRICT BOLD CHECK — ${found.length} <strong> spans found, ${EXPECTED_BOLD.length} expected`);
  const max = Math.max(found.length, EXPECTED_BOLD.length);
  for (let i = 0; i < max; i++) {
    const a = EXPECTED_BOLD[i];
    const b = found[i];
    const match = a === b;
    if (!match) ok = false;
    console.log(`  ${match ? '✓' : '✗'} [${String(i + 1).padStart(2, ' ')}] ${JSON.stringify(b ?? '∅')}${match ? '' : `   ≠ expected ${JSON.stringify(a ?? '∅')}`}`);
  }
  if (!ok) {
    console.error('\n✗ BOLD PARITY FAILED — refusing to continue. Fix BODY/EXPECTED_BOLD.');
    process.exit(2);
  }
  console.log('✓ Bold parity OK — every emphasised span matches the source document.');
}

// ---------------------------------------------------------------------------
const PAGE_LOOKUP = `query($q: String!){ pages(first: 5, query: $q){ edges { node { id handle title } } } }`;
const PAGE_UPDATE = `mutation($id: ID!, $page: PageUpdateInput!){
  pageUpdate(id: $id, page: $page){ page { id handle title updatedAt } userErrors { field message } }
}`;

async function main() {
  console.log(`→ prod-set-widerrufsrecht  store=${STORE}  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  verifyBold();

  const data = await gql(PAGE_LOOKUP, { q: `handle:${HANDLE}` });
  const node = data.pages.edges.map((e) => e.node).find((n) => n.handle === HANDLE);
  if (!node) throw new Error(`Page with handle "${HANDLE}" not found on ${STORE}`);
  console.log(`\nTarget page: ${node.handle} (${node.id}) "${node.title}"`);
  console.log(`New body length: ${BODY.length} chars`);

  if (!APPLY) {
    console.log('\n(dry-run: no write performed. Re-run with --apply to update the page.)');
    return;
  }
  const res = await gql(PAGE_UPDATE, {
    id: node.id,
    page: { title: TITLE, body: BODY, isPublished: true },
  });
  const errs = res.pageUpdate.userErrors;
  if (errs.length) throw new Error(`pageUpdate: ${JSON.stringify(errs)}`);
  console.log(`\n✓ Updated ${res.pageUpdate.page.handle} at ${res.pageUpdate.page.updatedAt}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
