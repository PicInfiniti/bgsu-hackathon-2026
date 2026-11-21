import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBrief } from '../src/brief-format.js';

test('formats the Aivana brief title, sections, and list without visible Markdown markers', () => {
  const html = formatBrief('**Coaching Meeting Brief: Jordan Ellis**\n\n**Recent Feedback & Actions:**\n* Review **two** clips (2026-11-19).\n* Clear communication.\n\n### Suggested discussion\n1. Ask about progress.');
  assert.match(html, /class="brief-title">Coaching Meeting Brief: Jordan Ellis/);
  assert.match(html, /class="brief-heading">Recent Feedback &amp; Actions:/);
  assert.match(html, /<ul><li>Review <strong>two<\/strong> clips \(2026-11-19\)\.<\/li><li>Clear communication\.<\/li><\/ul>/);
  assert.match(html, /<ol><li>Ask about progress\.<\/li><\/ol>/);
  assert.ok(!html.includes('**'));
});

test('escapes model-supplied HTML and never turns URLs into active content', () => {
  const html = formatBrief('**<img src=x onerror=alert(1)>**\n\n<script>alert(1)</script>\n\n- [click](javascript:alert(1))');
  assert.ok(!/<(?:img|script|a)\b/.test(html));
  assert.match(html, /&lt;script&gt;/);
});

test('accepts unfinished streaming text and reformats it when the next chunk completes it', () => {
  assert.equal(formatBrief('**Recent'), '<p>**Recent</p>');
  assert.match(formatBrief('**Recent actions**\n- Review clips'), /<h4.*Recent actions<\/h4><ul><li>Review clips<\/li><\/ul>/);
});
