#!/usr/bin/env node
/** Build review-only gallery art from existing Preview captures; no Lens Studio connection. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const helpers = process.env.SLICE_ZOOM_HELPER || join(homedir(), 'system-macos/active-work/skills/slice-zoom/references/slice_zoom_svg.mjs');
const { STYLE, band, outline, link, pickColour, crisp } = await import(pathToFileURL(helpers));
const sourceDir = join(here, 'sources');
mkdirSync(sourceDir, { recursive: true });
mkdirSync(join(here, 'review'), { recursive: true });
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const run = (bin, args, opts = {}) => execFileSync(bin, args, { maxBuffer: 64 * 1024 * 1024, ...opts });
const rel = p => relative(root, p).split('\\').join('/');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const bg = '#0b1423', white = '#f8fafc', muted = '#bfccdb', cyan = '#7ce6df', coral = '#ff897b';
const source = {
  opening: '.results/ar-recapture-20261107/opening.rgb-frames/frame-0.png',
  moving: '.results/ar-recapture-20261107/opening.rgb-frames/frame-135.png',
  three: '.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-004000ms.png',
  inspect: '.results/ar-recapture-20261107/inspect-atomic/inspect-storyboard/closeups-021500ms.png',
};
const assets = [];
function crop(id, sourceKey, box) {
  const input = resolve(root, source[sourceKey]);
  const output = join(sourceDir, `${id}.png`);
  const [x, y, w, h] = box;
  // All original participant/measurement cards begin below y=750 in these selected frames.
  if (y + h > 744) throw new Error(`Unsafe lower edge for ${id}`);
  run('magick', [input, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-strip', output]);
  const asset = { id, source: source[sourceKey], source_sha256: hash(input), crop_xywh: box, path: rel(output), width: w, height: h, sha256: hash(output) };
  assets.push(asset);
  return asset;
}
function square(region) {
  const [x, y, w, h] = region;
  const size = Math.ceil(Math.max(STYLE.min_size, w + 2 * STYLE.pad, h + 2 * STYLE.pad));
  return [Math.floor(x + w / 2 - size / 2), Math.floor(y + h / 2 - size / 2), size, size];
}
const hero = crop('three-brains-table', 'three', [570, 360, 840, 380]);
const row = crop('three-brains-row', 'three', [570, 510, 840, 230]);
const context = crop('three-brains-and-slices', 'three', [570, 70, 840, 670]);
const before = crop('drag-before', 'opening', [620, 120, 716, 620]);
const moving = crop('drag-during', 'moving', [620, 120, 716, 620]);
const inspected = crop('inspection-table', 'inspect', [570, 360, 840, 380]);
const sliceBox = square([884, 367, 212, 212]);
const warpBox = square([1232, 529, 174, 139]);
const inspectBox = square([901, 469, 176, 221]);
const slices = crop('paired-slice-detail', 'three', sliceBox);
const warp = crop('warp-colour-detail', 'three', warpBox);
const inspect = crop('inspection-detail', 'inspect', inspectBox);
const data = a => `data:image/png;base64,${readFileSync(resolve(root, a.path)).toString('base64')}`;
const text = (value, x, y, size, colour = white, weight = 400, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${colour}" font-weight="${weight}" ${extra}>${escape(value)}</text>`;
const rect = (x, y, w, h, fill, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`;
function image(a, x, y, w, h, nearest = false) {
  // Pre-resize zooms with nearest-neighbour: do not depend on SVG renderer support alone.
  let uri = data(a);
  if (nearest && w >= a.width && h >= a.height) {
    uri = `data:image/png;base64,${run('magick', [resolve(root, a.path), '-filter', 'point', '-resize', `${Math.round(w)}x${Math.round(h)}!`, '-strip', 'png:-']).toString('base64')}`;
  }
  return `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" ${nearest ? crisp(w, a.width) : ''}/>`;
}
function svg(w, h, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g font-family="Helvetica, Arial, sans-serif">${rect(0, 0, w, h, bg)}${content}</g></svg>`;
}
function header(kicker, title, subtitle = '') {
  return text(kicker, 64, 58, 20, cyan, 700, 'letter-spacing="2.2"') + text(title, 64, 140, 62, white, 700) +
    (subtitle ? text(subtitle, 64, 188, 27, muted) : '') + `<path d="M64 213H1736" stroke="#2b4056" stroke-width="2"/>`;
}
const roomNote = 'room: AI-generated from public-domain photo';
function footer() {
  return text('Lens Studio Preview states · mouse input · offline panoramic reconstruction · Bitmoji stand-ins', 64, 1145, 22, muted) + text(roomNote, 64, 1180, 22, muted);
}
function pill(label, cx, y, width, colour = cyan) {
  return rect(cx - width / 2, y - 31, width, 46, '#102236', 10) + text(label, cx, y, 24, colour, 600, 'text-anchor="middle"');
}
const products = [];
function save(name, w, h, content, caption, alt, usedAssets) {
  const s = join(sourceDir, `${name}.svg`), png = join(sourceDir, `${name}.render.png`), out = join(here, `${name}.jpg`);
  writeFileSync(s, svg(w, h, content));
  run('rsvg-convert', ['-o', png, s]);
  run('magick', [png, '-strip', '-sampling-factor', '4:4:4', '-quality', '94', out]);
  products.push({ file: `${name}.jpg`, width: w, height: h, bytes: statSync(out).size, sha256: hash(out), caption, alt, assets: usedAssets.map(a => a.id) });
  process.stdout.write(`[${products.length}/7] ${name}.jpg ${w}x${h} ${statSync(out).size} bytes\n`);
}

save('devpost-thumbnail', 1800, 1200,
  text('A SPATIAL BRAIN-IMAGING LESSON', 64, 60, 21, cyan, 700, 'letter-spacing="2.4"') +
  text('Where Does the', 64, 155, 88, white, 700) + text('Atrophy Go?', 64, 250, 88, white, 700) +
  text('Move a brain. Follow the warp.', 68, 301, 30, muted) +
  image(hero, 60, 330, 1680, 760) + footer(),
  'Move a brain. Follow the warp.',
  'Three brain views and a paired slice card in a table-based Lens Studio Preview lesson. The coral selected fluid-space region appears in each brain.', [hero]);

save('01-three-brains', 1800, 1200,
  header('THE SPATIAL LESSON', 'three views, one transformation', 'Keep the original anatomy and the shared reference in view.') +
  image(hero, 60, 242, 1680, 760) +
  pill('subject space', 248, 977, 258) + pill('moving brain', 900, 977, 258) + pill('common space', 1560, 977, 276) + footer(),
  'Keep the subject, moving brain and shared reference in view.',
  'A neutral subject-space brain, a partly coloured moving brain, and a blue common-space brain sit along the same curved guide. The same coral selected fluid-space region is visible in all three.', [hero]);

save('02-drag-the-brain', 1800, 1200,
  header('DIRECT MANIPULATION', 'drag between coordinate spaces', 'Mouse-driven Preview interaction: the moving brain reshapes along the guide.') +
  text('before the drag', 64, 262, 29, cyan, 600) + text('during the drag', 936, 262, 29, cyan, 600) +
  image(before, 64, 286, 800, 800 * 620 / 716) + image(moving, 936, 286, 800, 800 * 620 / 716) +
  text('fixed endpoints · one moving brain', 900, 1050, 32, white, 600, 'text-anchor="middle"') + footer(),
  'Drag the moving brain between the fixed endpoints.',
  'Two captured states show the curved drag: the moving brain overlaps an endpoint before the drag and becomes a separate third brain during the drag.', [before, moving]);

function zoomPanel(base, detail, region, whole, zoom, titles) {
  const [wx, wy, ww, wh] = whole, [zx, zy, zw, zh] = zoom;
  const [sx, sy, sw, sh] = base.crop_xywh;
  const [bx, by, bw, bh] = region;
  const rx = wx + (bx - sx) * ww / sw, ry = wy + (by - sy) * wh / sh;
  const rw = bw * ww / sw, rh = bh * wh / sh;
  const grow = Math.ceil(Math.max(bw, bh) / 2);
  const sampleX = Math.max(0, bx - grow), sampleY = Math.max(0, by - grow);
  const sampleW = Math.min(1920 - sampleX, bw + 2 * grow), sampleH = Math.min(1080 - sampleY, bh + 2 * grow);
  const samples = run('magick', [resolve(root, source[base.id === 'inspection-table' ? 'inspect' : 'three']), '-crop', `${sampleW}x${sampleH}+${sampleX}+${sampleY}`, '+repage', '-alpha', 'off', '-depth', '8', 'RGB:-']);
  const colour = pickColour([samples]);
  return { colour, content:
    text(titles[0], wx, wy - 28, 29, muted, 600) + text(titles[1], zx, zy - 28, 29, muted, 600) +
    band(colour, rx + rw, ry, ry + rh, zx, zy, zy + zh) +
    image(base, wx, wy, ww, wh) + outline(colour, rx, ry, rw, rh, 'box', 2) +
    link(colour, rx + rw, ry, ry + rh, zx, zy, zy + zh, 2) +
    image(detail, zx, zy, zw, zh, true) + outline(colour, zx, zy, zw, zh, 'frame', 2)
  };
}
const sliceZoom = zoomPanel(context, slices, sliceBox, [64, 292, 840, 670], [1196, 360, 540, 540], ['preview context', 'subject cut + shared reference']);
save('03-paired-slices', 1800, 1200,
  header('SLICES AND SPATIAL CONTEXT', 'follow the same region in paired slices') + sliceZoom.content + footer(),
  'Compare the paired slices and the same coral region outline.',
  'The full brain-and-slice layout is shown beside a nearest-neighbour enlargement of its paired slice card. A haloed square and connecting lines identify the exact crop.', [context, slices]);

const warpZoom = zoomPanel(hero, warp, warpBox, [64, 354, 1008, 456], [1216, 320, 520, 520], ['warp colour in context', 'blue stretches · red squeezes']);
save('04-warp-colours', 1800, 1200,
  header('READ THE DEFORMATION', 'warp colour is geometry, not progression') + warpZoom.content +
  text('coral = selected fluid space', 1216, 904, 27, coral, 600) + footer(),
  'Cortex colours encode the warp: blue stretches, red squeezes. Coral marks the selected fluid-space region.',
  'A square on the common-space brain connects to a pixel-preserving enlargement. The outer brain carries blue deformation colour, while a separate coral selected fluid-space region remains visible inside.', [hero, warp]);

const inspectionZoom = zoomPanel(inspected, inspect, inspectBox, [64, 354, 1008, 456], [1176, 286, 560, 560], ['table scene', 'inspection copy above its source']);
save('05-inspection-copy', 1800, 1200,
  header('INSPECT WITHOUT LOSING CONTEXT', 'lift a copy while the source stays put') + inspectionZoom.content + footer(),
  'A stationary hold lifts an inspection copy; release returns it.',
  'The scene shows an inspection copy above the moving brain, with both endpoint brains still on the table. A square and enlargement show the copy and its source together.', [inspected, inspect]);

save('youtube-thumbnail', 1280, 720,
  text('LENS STUDIO PREVIEW', 48, 45, 20, cyan, 700, 'letter-spacing="2"') +
  text('Where Does the Atrophy Go?', 48, 126, 64, white, 700) +
  text('Move a brain. Follow the warp.', 50, 183, 31, muted) +
  image(row, 48, 232, 1184, 1184 * 230 / 840) +
  text('Lens Studio Preview states · mouse input · offline panoramic reconstruction', 48, 632, 20, muted) +
  text('Bitmoji stand-ins · ' + roomNote, 48, 670, 20, muted),
  'Move a brain. Follow the warp.',
  'Title art over a cropped Preview capture of the three brain models, with coral selected fluid-space regions and progressive deformation colour.', [row]);

for (const product of products) {
  const dims = run('magick', ['identify', '-format', '%w %h', join(here, product.file)]).toString().trim();
  if (dims !== `${product.width} ${product.height}`) throw new Error(`Wrong dimensions: ${product.file}`);
  if (product.bytes >= 5_000_000) throw new Error(`Over 5 MB: ${product.file}`);
}
if (products.find(p => p.file === 'devpost-thumbnail.jpg').width * 2 !== products[0].height * 3) throw new Error('Devpost thumbnail must be 3:2');
const manifest = {
  status: 'review draft; no publication or upload performed',
  provenance: 'Existing Lens Studio Preview states, offline panoramic reconstruction, mouse input. No new capture or AI-image generation.',
  room_note: roomNote,
  privacy: 'Only pre-cropped raster assets are embedded. Endpoint identifier and measurement cards, lower subtitles, and display-simulation claims are outside every crop. Raster metadata is stripped.',
  source_inventory: { '.results/ar-recapture-20261107': 'Existing PNG/JPEG frames inspected; primary sources below.', 'lens/devpost/evidence': 'No raster images found, including recursive on-disk inspection.', 'docs/video/demo-explainer': 'Existing moving-lens report stills inspected; not used in final artwork because they repeat the selected captures with extra captions.' },
  best_ten_candidates_viewed: [
    '.results/ar-recapture-20261107/opening.rgb-frames/frame-135.png',
    '.results/ar-recapture-20261107/final-layout-static-source.rgb-frames/frame-0.png',
    '.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-004000ms.png',
    '.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-011000ms.png',
    '.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-021500ms.png',
    'docs/video/demo-explainer/reports/moving-lens-frames/three-brains.png',
    'docs/video/demo-explainer/reports/moving-lens-frames/drag.png',
    'docs/video/demo-explainer/reports/moving-lens-frames/warp.png',
    '.results/ar-recapture-20261107/closeups.rgb-frames/frame-270.png',
    '.results/ar-recapture-20261107/inspect-centred/storyboard/closeups-014000ms.png',
  ],
  slice_zoom: { helper: 'slice-zoom/references/slice_zoom_svg.mjs', helper_sha256: hash(helpers), style_sha256: hash(join(dirname(helpers), 'style.json')), regions: { slices: sliceBox, warp: warpBox, inspection: inspectBox }, colours: { slices: sliceZoom.colour, warp: warpZoom.colour, inspection: inspectionZoom.colour }, padding_and_minimum: 'Read from the active skill style.json. No copied style constants.' },
  assets,
  products,
};
writeFileSync(join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write('Validated: 7 JPEG files, dimensions exact, all below 5,000,000 bytes.\n');
