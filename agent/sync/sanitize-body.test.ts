/**
 * Unit tests for sanitize-body.ts (XSS allowlist for catalog-sync).
 *
 * Run with: `npx tsx --test agent/sync/sanitize-body.test.ts`
 *
 * These tests document the security contract — every assertion here represents
 * a real attack surface in the xxl → Shopify pipeline. Don't relax an assertion
 * to "make it pass"; if the allowlist genuinely needs to widen, update both
 * sanitize-body.ts and the matching test in lockstep with a security note.
 *
 * Project convention: node:test runner (no Mocha/Vitest). See normalize.test.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeBodyHtml, sanitizeShortText } from './sanitize-body.js';

// ---------------------------------------------------------------------------
// sanitizeBodyHtml — script / iframe / style / form / event handlers
// ---------------------------------------------------------------------------

test('sanitizeBodyHtml: <script> tag and contents are stripped entirely', () => {
  assert.equal(sanitizeBodyHtml('<script>alert(1)</script>'), '');
});

test('sanitizeBodyHtml: <script> nested in allowed parent has only the script removed', () => {
  assert.equal(sanitizeBodyHtml('<div><script>bad()</script>good</div>'), '<div>good</div>');
});

test('sanitizeBodyHtml: <iframe> is stripped entirely', () => {
  assert.equal(sanitizeBodyHtml('<iframe src="https://evil.com"></iframe>'), '');
});

test('sanitizeBodyHtml: inline <style> block is stripped, surrounding text preserved', () => {
  assert.equal(sanitizeBodyHtml('<style>body{display:none}</style>safe'), 'safe');
});

test('sanitizeBodyHtml: <form> and <input> are stripped, surrounding text preserved', () => {
  assert.equal(sanitizeBodyHtml('<form><input name=foo></form>tail'), 'tail');
});

test('sanitizeBodyHtml: <object> and <embed> are stripped', () => {
  assert.equal(sanitizeBodyHtml('<object data="x.swf"></object>'), '');
  assert.equal(sanitizeBodyHtml('<embed src="x.swf">'), '');
});

test('sanitizeBodyHtml: javascript: href is stripped, anchor text preserved', () => {
  // No href survives, but the <a> wrapper + text remain (with safe rel/target).
  const out = sanitizeBodyHtml('<a href="javascript:alert(1)">x</a>');
  assert.equal(out, '<a rel="noopener noreferrer" target="_blank">x</a>');
  assert.ok(!out.includes('javascript:'), 'javascript: scheme must not appear in output');
});

test('sanitizeBodyHtml: data: URI on <img> is stripped', () => {
  const out = sanitizeBodyHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">');
  assert.ok(!out.includes('data:'), 'data: scheme must not appear in output');
});

test('sanitizeBodyHtml: onerror handler is stripped', () => {
  const out = sanitizeBodyHtml('<img src=x onerror=alert(1)>');
  assert.ok(!/onerror/i.test(out), 'onerror attribute must be removed');
  assert.ok(!out.includes('alert'), 'handler body must not appear in output');
});

test('sanitizeBodyHtml: onclick + inline style are stripped from <p>', () => {
  const out = sanitizeBodyHtml('<p style="color:red" onclick="x()">styled</p>');
  assert.equal(out, '<p>styled</p>');
});

test('sanitizeBodyHtml: protocol-relative href is stripped (no scheme inheritance)', () => {
  const out = sanitizeBodyHtml('<a href="//evil.com">proto-rel</a>');
  assert.ok(!out.includes('//evil.com'), 'protocol-relative URL must not appear');
  assert.ok(!out.includes('href='), 'href must be removed entirely');
});

test('sanitizeBodyHtml: http:// href is rejected — only https/mailto/tel allowed', () => {
  const out = sanitizeBodyHtml('<a href="http://example.com">http</a>');
  assert.ok(!out.includes('http://'), 'http: scheme must not appear in output');
});

// ---------------------------------------------------------------------------
// sanitizeBodyHtml — happy path: allowed presentational markup is preserved
// ---------------------------------------------------------------------------

test('sanitizeBodyHtml: <p>+<b> presentational markup is preserved verbatim', () => {
  assert.equal(sanitizeBodyHtml('<p>hello <b>world</b></p>'), '<p>hello <b>world</b></p>');
});

test('sanitizeBodyHtml: https <a> gets rel=noopener noreferrer + target=_blank', () => {
  const out = sanitizeBodyHtml('<a href="https://example.com">x</a>');
  assert.ok(out.includes('href="https://example.com"'), 'https href preserved');
  assert.ok(out.includes('rel="noopener noreferrer"'), 'rel hardening applied');
  assert.ok(out.includes('target="_blank"'), 'target=_blank applied');
  assert.equal(out, '<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>');
});

test('sanitizeBodyHtml: mailto: link is preserved with rel/target hardening', () => {
  const out = sanitizeBodyHtml('<a href="mailto:x@y.com">mail</a>');
  assert.ok(out.includes('href="mailto:x@y.com"'));
  assert.ok(out.includes('rel="noopener noreferrer"'));
});

test('sanitizeBodyHtml: lists, tables, headings, hr survive', () => {
  const html =
    '<h2>Specs</h2><table><thead><tr><th>k</th><th>v</th></tr></thead>' +
    '<tbody><tr><td>height</td><td>60cm</td></tr></tbody></table>' +
    '<ul><li>a</li><li>b</li></ul><hr>';
  const out = sanitizeBodyHtml(html);
  for (const tag of ['<h2>', '<table>', '<thead>', '<tbody>', '<tr>', '<th>', '<td>', '<ul>', '<li>', '<hr']) {
    assert.ok(out.includes(tag), `expected ${tag} to survive`);
  }
});

test('sanitizeBodyHtml: class and id attributes survive on allowed tags', () => {
  const out = sanitizeBodyHtml('<p class="lead" id="intro">x</p>');
  assert.ok(out.includes('class="lead"'));
  assert.ok(out.includes('id="intro"'));
});

// ---------------------------------------------------------------------------
// sanitizeBodyHtml — null/undefined/non-string handling
// ---------------------------------------------------------------------------

test('sanitizeBodyHtml: null input returns empty string', () => {
  assert.equal(sanitizeBodyHtml(null), '');
});

test('sanitizeBodyHtml: undefined input returns empty string', () => {
  assert.equal(sanitizeBodyHtml(undefined), '');
});

test('sanitizeBodyHtml: number input returns empty string', () => {
  assert.equal(sanitizeBodyHtml(123), '');
});

test('sanitizeBodyHtml: empty string input returns empty string', () => {
  assert.equal(sanitizeBodyHtml(''), '');
});

// ---------------------------------------------------------------------------
// sanitizeShortText — strips ALL tags
// ---------------------------------------------------------------------------

test('sanitizeShortText: strips all tags but keeps text', () => {
  assert.equal(sanitizeShortText('<p>hello <b>world</b></p>'), 'hello world');
});

test('sanitizeShortText: <script> contents are dropped (not leaked as text)', () => {
  assert.equal(sanitizeShortText('<script>alert(1)</script>'), '');
});

test('sanitizeShortText: <style> contents are dropped (not leaked as text)', () => {
  assert.equal(sanitizeShortText('<style>body{display:none}</style>safe'), 'safe');
});

test('sanitizeShortText: anchor + javascript href returns just the link text', () => {
  assert.equal(sanitizeShortText('<a href="javascript:alert(1)">x</a>'), 'x');
});

test('sanitizeShortText: null/undefined/number return empty string', () => {
  assert.equal(sanitizeShortText(null), '');
  assert.equal(sanitizeShortText(undefined), '');
  assert.equal(sanitizeShortText(42), '');
  assert.equal(sanitizeShortText(''), '');
});
