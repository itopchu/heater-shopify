/**
 * HTML sanitization layer for catalog-sync.
 *
 * Why: xxl-heizung's body_html is fetched over HTTPS but is still untrusted
 * input — if xxl-heizung is compromised (or MITM'd), an attacker can inject
 * <script>, event handlers, or framed overlays that would execute on every
 * customer's PDP because Liquid renders product.description raw. This module
 * is the single chokepoint between upstream HTML and our store/metafields.
 *
 * Two policies:
 *
 *   sanitizeBodyHtml(html)   — used for product descriptions (descriptionHtml)
 *                              and FAQ answers. Keeps a strict allowlist of
 *                              presentational tags + safe href/src schemes
 *                              (https, mailto, tel only). Strips scripts,
 *                              iframes, styles, forms, inline event handlers,
 *                              inline styles, javascript:/data:/http: URLs.
 *
 *   sanitizeShortText(text)  — used for spec-table cells and FAQ questions.
 *                              Strips ALL tags. Returns plain text only.
 *
 * Both functions are nullsafe: non-string / null / undefined inputs return ''.
 *
 * SECURITY NOTE: The allowlist is intentionally narrow. If a future xxl product
 * legitimately needs another tag (e.g. <details>, <summary>), add it here
 * explicitly with a comment — never relax allowedSchemes for href/src.
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS: string[] = [
  'p', 'br',
  'b', 'strong', 'i', 'em', 'u',
  'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'dl', 'dt', 'dd',
  'blockquote', 'code', 'pre',
  'hr',
  'a', 'img', 'figure', 'figcaption',
  'span', 'div',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'rel', 'target'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  '*': ['class', 'id'],
};

const ALLOWED_SCHEMES: string[] = ['https', 'mailto', 'tel'];

const BODY_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // Disallow protocol-relative URLs (//evil.com) — they inherit the page scheme
  // but bypass the allowedSchemes check.
  allowProtocolRelative: false,
  // Drop the entire element + contents (not just the tag) for these. Default
  // sanitize-html behaviour keeps text content of stripped tags, which would
  // leak script bodies into the rendered page.
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  transformTags: {
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      // Force-strip any non-https href that somehow survived (defence in depth).
      if (out.href && !/^(https:|mailto:|tel:)/i.test(out.href)) {
        delete out.href;
      }
      // External link hardening: every <a> that survives gets safe rel + target.
      // No legitimate xxl description needs to navigate the parent frame.
      out.rel = 'noopener noreferrer';
      out.target = '_blank';
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.src && !/^https:/i.test(out.src)) {
        delete out.src;
      }
      return { tagName, attribs: out };
    },
  },
};

const SHORT_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // Same safety: discard contents of script/style entirely.
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
};

/**
 * Sanitize HTML for product descriptions and FAQ answers.
 *
 * Returns '' for null / undefined / non-string input.
 */
export function sanitizeBodyHtml(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  return sanitizeHtml(input, BODY_OPTIONS);
}

/**
 * Strip ALL HTML tags. Use for short text fields where any markup is suspicious:
 * spec-table cell values, FAQ questions, structured metafield string values.
 *
 * Returns '' for null / undefined / non-string input.
 */
export function sanitizeShortText(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  return sanitizeHtml(input, SHORT_TEXT_OPTIONS);
}
