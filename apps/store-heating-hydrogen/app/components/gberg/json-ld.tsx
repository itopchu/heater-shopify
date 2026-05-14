/**
 * <JsonLd> — renders schema.org structured data as `<script type="application/ld+json">`.
 *
 * WHY THIS EXISTS (and isn't done via `meta()`):
 * React Router 7's `<Meta />` component only honours meta descriptors with
 * `tagName: 'link'` or `tagName: 'meta'` — a `{tagName: 'script', ...}`
 * descriptor is silently discarded (it logs "invalid tagName: script" in
 * dev). So JSON-LD must be emitted from the component tree, not the route
 * `meta()` export. The builders in `~/lib/gberg/jsonld` still return the
 * `{tagName:'script', type, children}` descriptor shape; this component
 * just takes their `children` (the already-stringified JSON) and renders a
 * real `<script>` element. Route components call the same builders with
 * their loader data and pass the results here.
 *
 * The scripts render inside the route component (so, in `<body>`), which
 * Google, Bing and AI crawlers all accept for JSON-LD.
 */
import type {JsonLdScriptDescriptor} from '~/lib/gberg/jsonld';

export function JsonLd({
  items,
}: {
  /** Builder outputs; `null` entries (e.g. empty FAQ/breadcrumb) are skipped. */
  items: Array<JsonLdScriptDescriptor | null | undefined>;
}) {
  const scripts = items.filter(
    (i): i is JsonLdScriptDescriptor => Boolean(i && i.children),
  );
  if (scripts.length === 0) return null;
  return (
    <>
      {scripts.map((s, i) => (
        <script
          key={i}
          type="application/ld+json"
          // The payload is built server-side from typed loader data via the
          // jsonld.ts builders — it's already JSON.stringify'd, never raw
          // user input. suppressHydrationWarning because the markup is
          // byte-identical between SSR and the (no-op) client render.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{__html: s.children}}
        />
      ))}
    </>
  );
}
