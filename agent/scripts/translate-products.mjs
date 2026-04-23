#!/usr/bin/env node
/**
 * Converts Havn products + collections to English-source with German
 * registered as DE translations via Translate & Adapt.
 *
 * Before: products/collections seeded in German; EN customers see German.
 * After: EN source (matches EN-default charter); DE locale serves German via
 * translationsRegister.
 *
 * Idempotent: translationsRegister replaces per-key. Source productUpdate
 * calls are safe to re-run — if title already matches EN target, Shopify
 * no-ops on title but still rebumps updatedAt.
 *
 * Scopes: write_products, read_translations, write_translations.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2026-04';
const LOCALE = 'de';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '..', '.env.local');

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

const STORE = process.env.SHOPIFY_DEV_STORE;
const TOKEN = process.env.SHOPIFY_DEV_ADMIN_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing env vars'); process.exit(1); }
const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

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

// =============================================================================
// Source data — English becomes the source of truth. German becomes DE override.
// =============================================================================

const PRODUCT_MAP = {
  'havn-nord': {
    en: {
      title: 'Havn Nord — Vertical Bathroom Radiator',
      descriptionHtml: `<p>The <strong>Havn Nord</strong> is our vertical bathroom radiator with clean Scandinavian lines. Built from high-grade steel and finished with heat-resistant silk-matt white powder coating (RAL 9016), it slots into any modern bathroom and delivers heat reliably where you need it.</p>
<p>The vertical format makes the most of narrow wall space — perfect for small bathrooms, guest WCs, or the nook next to the shower. A factory-fitted center connection allows left- or right-side installation and makes swapping out an existing radiator straightforward.</p>
<p>All Havn radiators ship with a <strong>10-year warranty</strong> on material and workmanship, plus free delivery within the EU. Supplied with wall brackets and bleed valve — ready for your plumber to install.</p>`,
    },
    de: {
      title: 'Havn Nord — Vertikaler Badheizkörper',
      descriptionHtml: `<p>Der <strong>Havn Nord</strong> ist unser vertikaler Badheizkörper mit klarer, skandinavischer Linienführung. Gefertigt aus hochwertigem Stahl mit hitzebeständiger Pulverbeschichtung in seidenmattem Weiß (RAL 9016) fügt er sich harmonisch in jedes moderne Bad ein und liefert zuverlässig Wärme, wo du sie brauchst.</p>
<p>Durch die vertikale Bauform nutzt der Nord auch schmale Wandflächen optimal — ideal für kleine Bäder, Gäste-WCs oder Nischen neben der Dusche. Der werkseitige Mittelanschluss erlaubt flexible Installation von links oder rechts und vereinfacht den Austausch bestehender Heizkörper erheblich.</p>
<p>Alle Havn Heizkörper kommen mit <strong>10 Jahren Garantie</strong> auf Material und Verarbeitung sowie kostenlosem Versand innerhalb der EU. Lieferung erfolgt inkl. Befestigungsmaterial und Entlüftungsventil — bereit für die Montage durch deinen Fachbetrieb.</p>`,
    },
  },
  'havn-fjord': {
    en: {
      title: 'Havn Fjord — Horizontal Living Room Radiator',
      descriptionHtml: `<p>The <strong>Havn Fjord</strong> is the classic choice for living rooms, bedrooms, and hallways. The horizontal format fits under any windowsill and delivers strong output thanks to doubled convector plates and premium steel — in compact dimensions.</p>
<p>The powder-coated RAL 9016 surface is scratch-resistant, easy to clean, and color-stable even after years of daily use. The center connection keeps the install visually tidy and is compatible with most standard heating systems, including heat pumps running at low temperatures.</p>
<p>Shipped with a <strong>10-year manufacturer warranty</strong>, full wall brackets, and bleed valve. Paired with a matching thermostat head (sold separately), it's a drop-in replacement radiator for your next renovation project.</p>`,
    },
    de: {
      title: 'Havn Fjord — Horizontaler Wohnraumheizkörper',
      descriptionHtml: `<p>Der <strong>Havn Fjord</strong> ist der Klassiker für Wohnzimmer, Schlafzimmer und Flure. Die horizontale Bauweise passt unter jede Fensterbank und liefert dank doppelter Konvektorbleche und hochwertigem Stahl eine hohe Heizleistung bei kompakten Abmessungen.</p>
<p>Die pulverbeschichtete Oberfläche in RAL 9016 ist kratzfest, pflegeleicht und farbstabil — auch nach Jahren im Dauereinsatz. Der Mittelanschluss sorgt für optisch saubere Installation und ist zu den meisten Standard-Heizungssystemen kompatibel, inklusive Wärmepumpen im Niedertemperaturbetrieb.</p>
<p>Lieferung mit <strong>10 Jahren Herstellergarantie</strong>, kompletten Wandkonsolen und Entlüfter. Zusammen mit dem passenden Thermostatkopf (separat erhältlich) ein vollwertiger Austauschheizkörper für dein nächstes Renovierungsprojekt.</p>`,
    },
  },
  'havn-skagen': {
    en: {
      title: 'Havn Skagen — Towel Warmer',
      descriptionHtml: `<p>The <strong>Havn Skagen</strong> is a classic ladder-style towel warmer — designed for anyone who wants to step out of the bath and straight into a pre-warmed towel. Horizontal round tubes distribute heat evenly and provide plenty of hang space for hand and bath towels.</p>
<p>Seamlessly welded steel construction, powder coated in silk-matt white (RAL 9016). The center connection makes it a direct swap for an existing radiator — a plumber usually completes the change in under an hour.</p>
<p>Includes a <strong>10-year warranty</strong>, wall brackets, bleed valve, and blanking plug. An electric heating element is available as an accessory if you want to use the towel warmer outside the heating season.</p>`,
    },
    de: {
      title: 'Havn Skagen — Handtuchwärmer',
      descriptionHtml: `<p>Der <strong>Havn Skagen</strong> ist ein klassischer Handtuchwärmer im Sprossendesign — entwickelt für alle, die aus dem Bad in ein vorgewärmtes Handtuch steigen möchten. Die horizontalen Rundrohre sorgen für gleichmäßige Wärmeverteilung und bieten gleichzeitig ausreichend Ablagefläche für Hand- und Badetücher.</p>
<p>Konstruktion aus nahtlos verschweißtem Stahl, pulverbeschichtet in seidenmattem Weiß (RAL 9016). Dank Mittelanschluss lässt sich der Skagen problemlos gegen einen bestehenden Heizkörper tauschen — ein Fachbetrieb erledigt den Wechsel in der Regel in unter einer Stunde.</p>
<p>Inklusive <strong>10 Jahren Garantie</strong>, Wandhalterungen, Entlüftungsventil und Blindstopfen. Ein elektrischer Heizstab ist als Zubehör erhältlich, falls du den Handtuchwärmer auch außerhalb der Heizperiode nutzen möchtest.</p>`,
    },
  },
  'havn-bris': {
    en: {
      title: 'Havn Bris — Compact Living Room Radiator',
      descriptionHtml: `<p>The <strong>Havn Bris</strong> is our entry-level model — compact, efficient, and affordable. Built for smaller rooms like home offices, utility rooms, or hobby spaces where a discreet radiator makes more sense than a big heating surface.</p>
<p>Affordable price, no quality trade-off: solid steel, RAL 9016 powder coating, and a center connection for flexible installation. The slim profile fits under low windowsills or between furniture and the wall.</p>
<p>Backed by a <strong>10-year manufacturer warranty</strong> and built from the same material as our larger models. A solid everyday radiator that does exactly what it should — no bells and whistles.</p>`,
    },
    de: {
      title: 'Havn Bris — Kompakter Wohnraumheizkörper',
      descriptionHtml: `<p>Der <strong>Havn Bris</strong> ist unser Einstiegsmodell — kompakt, effizient und preiswert. Entwickelt für kleinere Räume wie Arbeitszimmer, Abstellkammern oder Hobbyräume, in denen ein dezenter Heizkörper mehr Sinn ergibt als eine großzügige Wärmefläche.</p>
<p>Trotz des günstigen Einstiegspreises verzichten wir nicht auf Qualität: massiver Stahl, Pulverbeschichtung in RAL 9016 und Mittelanschluss für flexible Montage. Die schlanke Bauweise passt auch unter niedrige Fensterbänke oder zwischen Möbel und Wand.</p>
<p>Mit <strong>10 Jahren Herstellergarantie</strong> und der gleichen Materialqualität wie unsere größeren Modelle. Ein solider Alltagsheizkörper, der genau das tut, was er soll — ohne Schnickschnack.</p>`,
    },
  },
  'havn-storm': {
    en: {
      title: 'Havn Storm — Large-Format Radiator',
      descriptionHtml: `<p>The <strong>Havn Storm</strong> is our heavyweight for large rooms, period apartments, and open-plan spaces. Up to 120 × 160 cm of heating surface with doubled convector plates delivers the output a loft or a poorly insulated room actually needs.</p>
<p>Powder coated in RAL 9016, built from solid steel, with a center connection. Clean workmanship and modern lines mean the Storm becomes a design feature in its own right — not a necessary evil on the wall.</p>
<p>Ships with a <strong>10-year warranty</strong>, reinforced wall brackets (matched to the heavier weight), and bleed valve. We recommend professional installation — depending on size, the Storm can weigh over 30 kg.</p>`,
    },
    de: {
      title: 'Havn Storm — Großflächen-Heizkörper',
      descriptionHtml: `<p>Der <strong>Havn Storm</strong> ist unser Schwergewicht für große Räume, Altbauwohnungen und offene Wohnbereiche. Mit bis zu 120 × 160 cm Heizfläche und verdoppelten Konvektorblechen liefert er die Wärmeleistung, die ein Loft oder ein schlecht gedämmter Raum tatsächlich braucht.</p>
<p>Pulverbeschichtet in RAL 9016, aus massivem Stahl gefertigt und mit Mittelanschluss versehen. Dank sauberer Verarbeitung und moderner Linienführung wird der Storm selbst zur Designfläche — und nicht zu einem notwendigen Übel an der Wand.</p>
<p>Lieferung inkl. <strong>10 Jahren Garantie</strong>, verstärkten Wandkonsolen (passend zum höheren Gewicht) und Entlüftungsventil. Empfehlung: Installation durch einen Fachbetrieb, da der Storm je nach Größe über 30 kg wiegen kann.</p>`,
    },
  },
};

const COLLECTION_MAP = {
  badheizkorper: {
    en: { title: 'Bathroom Radiators', descriptionHtml: '<p>Vertical and horizontal radiators built for bathrooms — TÜV-tested, powder coated, 10-year warranty.</p>' },
    de: { title: 'Badheizkörper', descriptionHtml: '<p>Vertikale und horizontale Heizkörper für das Badezimmer — TÜV-geprüft, pulverbeschichtet, 10 Jahre Garantie.</p>' },
  },
  wohnraumheizkorper: {
    en: { title: 'Living Room Radiators', descriptionHtml: '<p>Horizontal radiators for living rooms, bedrooms, and hallways. Compact dimensions, premium output.</p>' },
    de: { title: 'Wohnraumheizkörper', descriptionHtml: '<p>Horizontale Heizkörper für Wohnzimmer, Schlafzimmer und Flure. Kompakte Abmessungen, hohe Leistung.</p>' },
  },
  handtuchwaermer: {
    en: { title: 'Towel Warmers', descriptionHtml: '<p>Ladder-style towel warmers — warm towels, even heat distribution, easy swap for existing radiators.</p>' },
    de: { title: 'Handtuchwärmer', descriptionHtml: '<p>Handtuchwärmer im Sprossendesign — vorgewärmte Handtücher, gleichmäßige Wärme, einfacher Austausch bestehender Heizkörper.</p>' },
  },
  austauschheizkorper: {
    en: { title: 'Replacement Radiators', descriptionHtml: '<p>Drop-in replacement radiators with center connections. Keep your existing pipes; upgrade the heat source.</p>' },
    de: { title: 'Austauschheizkörper', descriptionHtml: '<p>Heizkörper zum direkten Austausch mit Mittelanschluss. Bestehende Anschlüsse bleiben, nur der Heizkörper wird erneuert.</p>' },
  },
  zubehoer: {
    en: { title: 'Accessories', descriptionHtml: '<p>Thermostat heads, electric elements, wall brackets — everything you need alongside a Havn radiator.</p>' },
    de: { title: 'Zubehör', descriptionHtml: '<p>Thermostatköpfe, elektrische Heizstäbe, Wandhalterungen — alles Zubehör für deinen Havn Heizkörper.</p>' },
  },
};

// Option name: "Größe" (current source) → "Size" (EN source), DE translation = "Größe"
const OPTION_NAME_EN = 'Size';
const OPTION_NAME_DE = 'Größe';

// =============================================================================

async function fetchProducts() {
  const data = await gql(`{
    products(first: 50) {
      nodes { id handle title descriptionHtml options { id name } }
    }
  }`);
  return data.products.nodes;
}

async function fetchCollections() {
  const data = await gql(`{
    collections(first: 50) {
      nodes { id handle title descriptionHtml }
    }
  }`);
  return data.collections.nodes;
}

async function updateProductToEN(product, target) {
  // Rename "Größe" option → "Size" if present
  const gr = product.options.find((o) => o.name === OPTION_NAME_DE);
  const optionInput = gr
    ? [{ id: gr.id, name: OPTION_NAME_EN }]
    : undefined;

  const input = {
    id: product.id,
    title: target.en.title,
    descriptionHtml: target.en.descriptionHtml,
  };
  const data = await gql(
    `mutation($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id title }
        userErrors { field message }
      }
    }`,
    { product: input },
  );
  const errs = data.productUpdate.userErrors;
  if (errs.length) console.warn(`  ⚠ productUpdate ${product.handle}: ${JSON.stringify(errs)}`);

  if (optionInput) {
    const optRes = await gql(
      `mutation($productId: ID!, $option: OptionUpdateInput!, $variantStrategy: ProductOptionUpdateVariantStrategy) {
        productOptionUpdate(productId: $productId, option: $option, variantStrategy: $variantStrategy) {
          userErrors { field message }
        }
      }`,
      { productId: product.id, option: { id: gr.id, name: OPTION_NAME_EN }, variantStrategy: 'LEAVE_AS_IS' },
    );
    const oErrs = optRes.productOptionUpdate.userErrors;
    if (oErrs.length && !oErrs.every((e) => /already/i.test(e.message))) {
      console.warn(`  ⚠ option rename ${product.handle}: ${JSON.stringify(oErrs)}`);
    }
  }
}

async function updateCollectionToEN(collection, target) {
  const data = await gql(
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id title }
        userErrors { field message }
      }
    }`,
    { input: { id: collection.id, title: target.en.title, descriptionHtml: target.en.descriptionHtml } },
  );
  const errs = data.collectionUpdate.userErrors;
  if (errs.length) console.warn(`  ⚠ collectionUpdate ${collection.handle}: ${JSON.stringify(errs)}`);
}

async function fetchTranslatableDigests(resourceId) {
  const data = await gql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: resourceId },
  );
  return data.translatableResource?.translatableContent ?? [];
}

async function registerDE(resourceId, map) {
  const content = await fetchTranslatableDigests(resourceId);
  const translations = [];
  for (const entry of content) {
    if (map.byKey && map.byKey[entry.key] !== undefined) {
      translations.push({
        locale: LOCALE,
        key: entry.key,
        value: map.byKey[entry.key],
        translatableContentDigest: entry.digest,
      });
    }
  }
  if (translations.length === 0) return 0;
  const data = await gql(
    `mutation($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key value locale }
        userErrors { field message }
      }
    }`,
    { resourceId, translations },
  );
  const errs = data.translationsRegister.userErrors;
  if (errs.length) throw new Error(`translationsRegister ${resourceId}: ${JSON.stringify(errs)}`);
  return data.translationsRegister.translations.length;
}

async function main() {
  console.log(`→ Translating products + collections on ${STORE}\n`);

  // ---- Products ----
  console.log('Step 1/4  Update product source data to English');
  const products = await fetchProducts();
  const havnProducts = products.filter((p) => PRODUCT_MAP[p.handle]);
  for (const p of havnProducts) {
    await updateProductToEN(p, PRODUCT_MAP[p.handle]);
    console.log(`  ok  ${p.handle}`);
  }

  console.log('\nStep 2/4  Register DE translations on products');
  for (const p of havnProducts) {
    const de = PRODUCT_MAP[p.handle].de;
    const n = await registerDE(p.id, {
      byKey: { title: de.title, body_html: de.descriptionHtml },
    });
    console.log(`  ${p.handle}: ${n} translation(s) registered`);
  }

  // ---- Collections ----
  console.log('\nStep 3/4  Update collection source data to English');
  const collections = await fetchCollections();
  const havnCollections = collections.filter((c) => COLLECTION_MAP[c.handle]);
  for (const c of havnCollections) {
    await updateCollectionToEN(c, COLLECTION_MAP[c.handle]);
    console.log(`  ok  ${c.handle}`);
  }

  console.log('\nStep 4/4  Register DE translations on collections');
  for (const c of havnCollections) {
    const de = COLLECTION_MAP[c.handle].de;
    const n = await registerDE(c.id, {
      byKey: { title: de.title, body_html: de.descriptionHtml },
    });
    console.log(`  ${c.handle}: ${n} translation(s) registered`);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
