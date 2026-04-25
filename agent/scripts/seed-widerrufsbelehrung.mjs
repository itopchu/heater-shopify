#!/usr/bin/env node
/**
 * seed-widerrufsbelehrung.mjs
 *
 * Seeds the Widerrufsbelehrung (right-of-withdrawal) legal page that
 * configure-phase-6.mjs and seed-legal-extra.mjs do not provision under the
 * canonical handle expected by the legal-menu link list.
 *
 *   Source (DE):     /pages/widerrufsbelehrung
 *   Translation (EN):/pages/right-of-withdrawal  (registered via Translate &
 *                    Adapt — Admin GraphQL translationsRegister)
 *
 * Page content is a clearly-marked PLACEHOLDER per BGB §312g and embeds the
 * official model withdrawal form template from EU Directive 2011/83/EU
 * Annex I(B) verbatim (DE + EN). The page MUST be reviewed by legal counsel
 * before launch — the rendered banner makes that explicit.
 *
 * Idempotent: upserts by handle. If a page with the target handle already
 * exists, it is updated in place. If a translation row already exists,
 * translationsRegister replaces per-key without duplicating.
 *
 * Env: SHOPIFY_DEV_STORE + SHOPIFY_DEV_ADMIN_TOKEN from .env.local.
 * Scopes required: write_online_store_pages, read_online_store_pages,
 *                  write_translations, read_translations.
 *
 * Flags:
 *   --apply        actually mutate the store (default is dry-run)
 *   --store <key>  informational; we always read the dev creds from env
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env.local');

function loadEnvLocal(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(ENV_PATH);

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const storeFlagIdx = ARGV.indexOf('--store');
const STORE_FLAG = storeFlagIdx >= 0 ? ARGV[storeFlagIdx + 1] : 'dev';

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) {
  console.error('Missing env vars: SHOPIFY_DEV_STORE and/or SHOPIFY_DEV_ADMIN_TOKEN');
  console.error('Add them to .env.local at the repo root.');
  process.exit(1);
}
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

console.log(`→ seed-widerrufsbelehrung  store=${STORE_FLAG} (${STORE})  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
if (!APPLY) {
  console.log('  (dry-run: no mutations will be sent. Re-run with --apply to write.)');
}

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Placeholder warning banners
// ---------------------------------------------------------------------------
const PLACEHOLDER_WARNING_DE = `
<div style="background:#fff8e6;border:2px dashed #d97706;padding:1rem;">⚠️ PLACEHOLDER — Diese Seite wurde NICHT von einem Anwalt geprüft. Vor dem Launch durch G-Berg GmbH Rechtsabteilung freigeben lassen.</div>
`.trim();

const PLACEHOLDER_WARNING_EN = `
<div style="background:#fff8e6;border:2px dashed #d97706;padding:1rem;">⚠️ PLACEHOLDER — This page has NOT been reviewed by a lawyer. Must be approved by G-Berg GmbH legal counsel before launch.</div>
`.trim();

const RETURN_ADDRESS_PLACEHOLDER_DE =
  '[PLATZHALTER — vor dem Launch mit der Rücksende-Anschrift der G-Berg GmbH ersetzen]';
const RETURN_ADDRESS_PLACEHOLDER_EN =
  '[PLACEHOLDER — replace with G-Berg GmbH return-shipping address before launch]';

const CONTACT_PHONE_PLACEHOLDER = '[PLACEHOLDER — +49 (0) 000 000 000]';
const CONTACT_EMAIL_PLACEHOLDER = '[PLACEHOLDER — widerruf@gberg-heizung.de]';

// ---------------------------------------------------------------------------
// Page bodies
//
// Both bodies follow BGB §312g + EU Directive 2011/83/EU Annex I(B).
// The Muster-Widerrufsformular / model withdrawal form text is the
// public-domain template from the Directive, embedded verbatim.
// ---------------------------------------------------------------------------
const PAGE_DE = {
  handle: 'widerrufsbelehrung',
  title: 'Widerrufsbelehrung',
  body: `${PLACEHOLDER_WARNING_DE}

<h1>Widerrufsbelehrung</h1>

<h2>Widerrufsrecht</h2>
<p>
  Sie haben das Recht, binnen <strong>vierzehn Tagen</strong> ohne Angabe von Gründen
  diesen Vertrag zu widerrufen.
</p>
<p>
  Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen
  benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben
  bzw. hat.
</p>
<p>
  Um Ihr Widerrufsrecht auszuüben, müssen Sie uns
</p>
<p>
  <strong>G-Berg GmbH</strong><br>
  ${RETURN_ADDRESS_PLACEHOLDER_DE}<br>
  Telefon: ${CONTACT_PHONE_PLACEHOLDER}<br>
  E-Mail: ${CONTACT_EMAIL_PLACEHOLDER}
</p>
<p>
  mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief, Telefax
  oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie
  können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht
  vorgeschrieben ist.
</p>
<p>
  Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die
  Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
</p>

<h2>Folgen des Widerrufs</h2>
<p>
  Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
  erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten,
  die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns
  angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens
  binnen <strong>vierzehn Tagen</strong> ab dem Tag zurückzuzahlen, an dem die Mitteilung
  über Ihren Widerruf dieses Vertrags bei uns eingegangen ist.
</p>
<p>
  Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der
  ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich
  etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte
  berechnet.
</p>
<p>
  Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben
  oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je
  nachdem, welches der frühere Zeitpunkt ist.
</p>
<p>
  Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab
  dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an
</p>
<p>
  <strong>G-Berg GmbH</strong><br>
  ${RETURN_ADDRESS_PLACEHOLDER_DE}
</p>
<p>
  zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf
  der Frist von vierzehn Tagen absenden.
</p>
<p>
  <strong>Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.</strong>
</p>
<p>
  Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser
  Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise
  der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.
</p>

<h2>Muster-Widerrufsformular</h2>
<p>
  (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und
  senden Sie es zurück.)
</p>
<pre style="white-space:pre-wrap;font-family:inherit;border:1px solid #e5e5e5;padding:1rem;background:#fafafa;">
An:
G-Berg GmbH
${RETURN_ADDRESS_PLACEHOLDER_DE}
E-Mail: ${CONTACT_EMAIL_PLACEHOLDER}

— Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über
  den Kauf der folgenden Waren (*) / die Erbringung der folgenden Dienstleistung (*):

— Bestellt am (*) / erhalten am (*):

— Name des/der Verbraucher(s):

— Anschrift des/der Verbraucher(s):

— Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):

— Datum:

(*) Unzutreffendes streichen.
</pre>

<h2>Kontakt</h2>
<p>
  Telefon: ${CONTACT_PHONE_PLACEHOLDER}<br>
  E-Mail: ${CONTACT_EMAIL_PLACEHOLDER}
</p>
`,
};

const PAGE_EN = {
  handle: 'right-of-withdrawal',
  title: 'Right of Withdrawal',
  body: `${PLACEHOLDER_WARNING_EN}

<h1>Right of Withdrawal</h1>

<h2>Right of withdrawal</h2>
<p>
  You have the right to withdraw from this contract within <strong>14 days</strong>
  without giving any reason.
</p>
<p>
  The withdrawal period will expire after 14 days from the day on which you acquire,
  or a third party other than the carrier and indicated by you acquires, physical
  possession of the goods.
</p>
<p>
  To exercise the right of withdrawal, you must inform us
</p>
<p>
  <strong>G-Berg GmbH</strong><br>
  ${RETURN_ADDRESS_PLACEHOLDER_EN}<br>
  Phone: ${CONTACT_PHONE_PLACEHOLDER}<br>
  Email: ${CONTACT_EMAIL_PLACEHOLDER}
</p>
<p>
  of your decision to withdraw from this contract by an unequivocal statement
  (e.g. a letter sent by post, fax or e-mail). You may use the attached model
  withdrawal form, but it is not obligatory.
</p>
<p>
  To meet the withdrawal deadline, it is sufficient for you to send your communication
  concerning your exercise of the right of withdrawal before the withdrawal period has
  expired.
</p>

<h2>Effects of withdrawal</h2>
<p>
  If you withdraw from this contract, we shall reimburse to you all payments received
  from you, including the costs of delivery (with the exception of the supplementary
  costs resulting from your choice of a type of delivery other than the least expensive
  type of standard delivery offered by us), without undue delay and in any event not
  later than <strong>14 days</strong> from the day on which we are informed about your
  decision to withdraw from this contract.
</p>
<p>
  We will carry out such reimbursement using the same means of payment as you used for
  the initial transaction, unless you have expressly agreed otherwise; in any event,
  you will not incur any fees as a result of such reimbursement.
</p>
<p>
  We may withhold reimbursement until we have received the goods back or you have
  supplied evidence of having sent back the goods, whichever is the earliest.
</p>
<p>
  You shall send back the goods or hand them over to us, without undue delay and in any
  event not later than 14 days from the day on which you communicate your withdrawal
  from this contract to us. The deadline is met if you send back the goods before the
  period of 14 days has expired.
</p>
<p>
  Return address:
</p>
<p>
  <strong>G-Berg GmbH</strong><br>
  ${RETURN_ADDRESS_PLACEHOLDER_EN}
</p>
<p>
  <strong>You will have to bear the direct cost of returning the goods.</strong>
</p>
<p>
  You are only liable for any diminished value of the goods resulting from the handling
  other than what is necessary to establish the nature, characteristics and functioning
  of the goods.
</p>

<h2>Model withdrawal form</h2>
<p>
  (Complete and return this form only if you wish to withdraw from the contract.)
</p>
<pre style="white-space:pre-wrap;font-family:inherit;border:1px solid #e5e5e5;padding:1rem;background:#fafafa;">
To:
G-Berg GmbH
${RETURN_ADDRESS_PLACEHOLDER_EN}
Email: ${CONTACT_EMAIL_PLACEHOLDER}

— I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale
  of the following goods (*) / for the provision of the following service (*),

— Ordered on (*) / received on (*),

— Name of consumer(s),

— Address of consumer(s),

— Signature of consumer(s) (only if this form is notified on paper),

— Date

(*) Delete as appropriate.
</pre>

<h2>Contact</h2>
<p>
  Phone: ${CONTACT_PHONE_PLACEHOLDER}<br>
  Email: ${CONTACT_EMAIL_PLACEHOLDER}
</p>
`,
};

// Translatable keys on a Shopify OnlineStorePage resource
const TRANSLATION_KEYS = ['title', 'body_html'];

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------
const PAGE_LOOKUP = `
  query($h: String!) {
    pages(first: 1, query: $h) {
      edges { node { id handle title } }
    }
  }
`;
const PAGE_CREATE = `
  mutation($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;
const PAGE_UPDATE = `
  mutation($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;
const TRANSLATABLE_RESOURCE = `
  query($id: ID!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent { key value digest locale type }
    }
  }
`;
const TRANSLATIONS_REGISTER = `
  mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key value locale }
      userErrors { field message }
    }
  }
`;

// ---------------------------------------------------------------------------
// Page upsert (idempotent by handle)
// ---------------------------------------------------------------------------
async function findPage(handle) {
  const data = await gql(PAGE_LOOKUP, { h: `handle:${handle}` });
  const match = data.pages.edges.find((e) => e.node.handle === handle);
  return match ? match.node : null;
}

async function upsertPage({ handle, title, body }) {
  const existing = await findPage(handle);
  if (existing) {
    if (!APPLY) {
      console.log(`  · would update existing page: ${handle} (${existing.id})`);
      return existing.id;
    }
    const res = await gql(PAGE_UPDATE, {
      id: existing.id,
      page: { title, body, isPublished: true },
    });
    const errs = res.pageUpdate.userErrors;
    if (errs.length) throw new Error(`pageUpdate ${handle}: ${JSON.stringify(errs)}`);
    console.log(`  ✓ page updated: ${handle}`);
    return existing.id;
  }
  if (!APPLY) {
    console.log(`  · would create new page: ${handle}`);
    return null;
  }
  const res = await gql(PAGE_CREATE, {
    page: { title, handle, body, isPublished: true },
  });
  const errs = res.pageCreate.userErrors;
  if (errs.length) throw new Error(`pageCreate ${handle}: ${JSON.stringify(errs)}`);
  console.log(`  ✓ page created: ${handle}`);
  return res.pageCreate.page.id;
}

// ---------------------------------------------------------------------------
// Register the EN page as a translation of the DE source page
// ---------------------------------------------------------------------------
async function registerEnglishTranslation(deResourceId, enPage) {
  if (!deResourceId) {
    console.log('  · skipping translation register — DE page id not yet known (dry-run)');
    return;
  }
  const data = await gql(TRANSLATABLE_RESOURCE, { id: deResourceId });
  const resource = data.translatableResource;
  if (!resource) {
    console.warn(`  ! no translatableResource for ${deResourceId} — skipping EN translation`);
    return;
  }
  const byKey = new Map(resource.translatableContent.map((c) => [c.key, c]));
  const translations = [];
  const wantValueByKey = { title: enPage.title, body_html: enPage.body };

  for (const key of TRANSLATION_KEYS) {
    const content = byKey.get(key);
    if (!content) {
      console.warn(`  ! source has no translatable key "${key}" — skipping`);
      continue;
    }
    translations.push({
      locale: 'en',
      key,
      value: wantValueByKey[key],
      translatableContentDigest: content.digest,
    });
  }
  if (translations.length === 0) {
    console.log('  · no translatable keys to register');
    return;
  }
  if (!APPLY) {
    console.log(`  · would register ${translations.length} EN translation(s) on ${deResourceId}`);
    return;
  }
  const res = await gql(TRANSLATIONS_REGISTER, { resourceId: deResourceId, translations });
  const errs = res.translationsRegister.userErrors;
  if (errs.length) throw new Error(`translationsRegister: ${JSON.stringify(errs)}`);
  console.log(`  ✓ EN translation registered (${res.translationsRegister.translations.length} keys)`);
}

// ---------------------------------------------------------------------------
// Optionally also create a standalone EN page at /pages/right-of-withdrawal.
//
// Rationale: Translate & Adapt resolves /pages/widerrufsbelehrung to the EN
// translation when the storefront locale is EN — that covers the common path.
// However, customers (and the legal-menu link list) may also link directly to
// the English handle. We therefore upsert a thin EN-only page at the EN handle
// as a safety net. It is idempotent and will simply mirror the EN body.
// ---------------------------------------------------------------------------
async function upsertEnglishHandlePage() {
  return upsertPage(PAGE_EN);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n→ Step 1: Upsert DE source page /pages/widerrufsbelehrung');
  const deId = await upsertPage(PAGE_DE);

  console.log('\n→ Step 2: Register EN translation on the DE page (Translate & Adapt)');
  try {
    await registerEnglishTranslation(deId, PAGE_EN);
  } catch (err) {
    if (String(err.message).includes('Locale cannot be the same as the shop')) {
      console.log('  ⚠ Skipped — shop primary locale is EN, so DE page acts as standalone');
      console.log('    (the standalone EN page in Step 3 covers /pages/right-of-withdrawal)');
    } else {
      throw err;
    }
  }

  console.log('\n→ Step 3: Upsert standalone EN page /pages/right-of-withdrawal (link-list safety net)');
  await upsertEnglishHandlePage();

  console.log('\nDone.');
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('NEXT STEP — footer link reminder:');
  console.log('  Add /pages/widerrufsbelehrung to the legal-menu link list');
  console.log('  (configured by the theme i18n agent).');
  console.log('────────────────────────────────────────────────────────────');
  if (!APPLY) {
    console.log('\n(dry-run only — re-run with --apply to perform the writes.)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
