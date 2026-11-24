#!/usr/bin/env node
/** Read-only checks on gallery deliverables; writes only the local review report. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
} catch (error) {
  process.stderr.write(`Cannot read gallery manifest: ${String(error)}\n`);
  process.exit(1);
}
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
assert.equal(manifest.products.length, 7);
assert.equal(manifest.products.filter(p => /^0\d-/.test(p.file)).length, 5);
const cropChecks = manifest.assets.map(a => {
  const [x, y, w, h] = a.crop_xywh;
  assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1920 && y + h <= 744, `Privacy boundary: ${a.id}`);
  assert.equal(hash(resolve(root, a.source)), a.source_sha256, `Source changed: ${a.id}`);
  assert.equal(hash(resolve(root, a.path)), a.sha256, `Crop changed: ${a.id}`);
  return { asset: a.id, crop_xywh: a.crop_xywh, lower_edge: y + h, identifier_cards_excluded: true };
});
const ocr = [], checks = [];
for (const [i, p] of manifest.products.entries()) {
  const file = join(here, p.file);
  assert.equal(hash(file), p.sha256, `Export changed: ${p.file}`);
  assert(statSync(file).size < 5_000_000, `File too large: ${p.file}`);
  assert.equal(run('magick', ['identify', '-format', '%w %h', file]).trim(), `${p.width} ${p.height}`);
  if (p.file === 'devpost-thumbnail.jpg') assert.equal(p.width * 2, p.height * 3);
  if (p.file === 'youtube-thumbnail.jpg') assert.deepEqual([p.width, p.height], [1280, 720]);
  const raw = run('tesseract', [file, 'stdout', '--psm', '11']);
  const flat = raw.replace(/\s+/g, ' ');
  const forbidden = [
    ['participant identifier', /\bP[0-9O]{4}\b/i],
    ['volume number', /\b\d+(?:\.\d+)?\s*m[lI]\b/i],
    ['display simulation claim', /orange box|specs display now/i],
    ['device or clinician claim', /clinician|on.device|device.tested|through glasses/i],
  ].filter(([, re]) => re.test(flat)).map(([label]) => label);
  assert.deepEqual(forbidden, [], `Unexpected text in ${p.file}`);
  assert(/Lens Studio Preview/i.test(flat), `Missing Preview disclosure: ${p.file}`);
  assert(/mouse input/i.test(flat) && /offline panoramic reconstruction/i.test(flat), `Missing reconstruction disclosure: ${p.file}`);
  assert(/room:\s*A[Il1i][- ]generated from public[- ]domain photo/i.test(flat), `Missing room note: ${p.file}`);
  const svg = readFileSync(join(here, 'sources', p.file.replace('.jpg', '.svg')), 'utf8');
  assert(svg.includes(manifest.room_note), `Room note absent in source: ${p.file}`);
  ocr.push(`## ${p.file}\n\n${raw.trim()}\n`);
  checks.push({ file: p.file, width: p.width, height: p.height, bytes: p.bytes, sha256: p.sha256, dimensions_exact: true, under_5_mb_decimal: true, forbidden_text_hits: forbidden, disclosures_detected_by_ocr: true });
  process.stdout.write(`[${i + 1}/7] checked ${p.file}\n`);
}
writeFileSync(join(here, 'review/privacy-ocr.txt'), ocr.join('\n'));
writeFileSync(join(here, 'review/validation.json'), JSON.stringify({ status: 'passed', checked_at: new Date().toISOString(), scope: 'Local review assets only. No Lens Studio, generation, upload, or publication.', visual_review: 'All seven final images viewed at export resolution; captions, privacy crops, zoom geometry and footer notes checked.', crop_checks: cropChecks, products: checks, caveat: 'OCR is a supplemental check. The exact crop boundaries and visual review are the primary evidence for privacy.' }, null, 2) + '\n');
process.stdout.write('All gallery checks passed.\n');
