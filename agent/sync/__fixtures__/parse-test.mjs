import { readFileSync } from 'node:fs';
import { parseSpecTable, parseFaqs, parseDeliveryContents, extractGrundpreis, parseVariantDimensions } from '../parse-body.ts';
const fx = JSON.parse(readFileSync(new URL('./xxl-products.json', import.meta.url), 'utf8'));
for (const [label, p] of Object.entries(fx)) {
  console.log(`\n=== ${label} (${p.handle}) ===`);
  const specs = parseSpecTable(p.body_html);
  const faqs  = parseFaqs(p.body_html);
  const deliv = parseDeliveryContents(p.body_html);
  const gp    = extractGrundpreis(p.body_html);
  const dims  = parseVariantDimensions(p.variants, p.options);
  console.log('  specs:', specs ? `keys=${Object.keys(specs).filter(k=>k!=='extra').length} extras=${Object.keys(specs.extra).length}` : 'null');
  if (specs) console.log('         color:', JSON.stringify(specs.color), 'material:', JSON.stringify(specs.material));
  console.log('  faqs:', faqs.length);
  for (const f of faqs.slice(0, 2)) console.log(`    Q: ${f.question.slice(0, 70)}`);
  console.log('  delivery:', deliv.length, '→', deliv.slice(0, 4));
  console.log('  grundpreis:', gp);
  console.log('  dimensions:', dims.length, 'rows; sample:', dims.slice(0, 2));
}
