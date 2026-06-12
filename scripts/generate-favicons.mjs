/**
 * generate-favicons.mjs
 * Regenerates the raster favicon set from public/icon-192.svg — the canonical
 * composite (WI-1033 treatment: inset glyph on a rounded void rect, itself
 * derived from arkon-glyph.svg). All geometry and colors are parsed from that
 * file at generation time; a brand change there propagates on the next run.
 *
 * Outputs (all under public/):
 *   favicon-16x16.png         — 16×16 raster
 *   favicon-32x32.png         — 32×32 raster
 *   android-chrome-192x192.png — 192×192 raster (manifest.json / site.webmanifest)
 *   android-chrome-512x512.png — 512×512 raster (manifest.json / site.webmanifest)
 *   apple-touch-icon.png      — 180×180, solid void background (no transparency)
 *   favicon.ico               — multi-resolution: 16+32+48 (public/ fallback)
 *
 * Also updates:
 *   src/app/favicon.ico       — Next.js App Router canonical .ico (16+32+48)
 *
 * Usage:
 *   node scripts/generate-favicons.mjs
 *
 * Dev deps required: sharp, png-to-ico
 * WI-1063 — 2026-06-13
 */

import { createRequire } from 'module';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
// png-to-ico default export accepts file paths; imagesToIco accepts parsed PNG objects.
// We use the default export (file paths) to avoid internal PNG decode API surface.
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const APP_DIR = path.join(ROOT, 'src', 'app');

// Visual source of truth: the canonical composite icon. The raw
// arkon-glyph.svg is a bare path with DIFFERENT (non-inset) coordinates and
// must not be rasterized directly — icon-192.svg carries the WI-1033
// treatment (inset glyph + rounded void rect) that all app icons mirror.
const SOURCE_SVG = path.join(PUBLIC, 'icon-192.svg');

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
  return m ? m[1] : null;
}

/**
 * Parse brand geometry + colors from icon-192.svg so a brand update there
 * propagates to every generated raster (no hardcoded duplicates here).
 */
async function readBrandSource() {
  const svg = await fs.readFile(SOURCE_SVG, 'utf8');
  const rectTag = (svg.match(/<rect[^>]*>/i) || [])[0];
  const pathTag = (svg.match(/<path[^>]*>/i) || [])[0];
  const viewBox = attrOf(svg, 'viewBox');
  if (!rectTag || !pathTag || !viewBox) {
    throw new Error(`Cannot parse <rect>/<path>/viewBox from ${SOURCE_SVG}`);
  }
  const brand = {
    vb: Number(viewBox.split(/\s+/)[3]),
    rx: Number(attrOf(rectTag, 'rx')),
    bg: attrOf(rectTag, 'fill'),
    glyphPath: attrOf(pathTag, 'd'),
    glyphFill: attrOf(pathTag, 'fill'),
  };
  for (const [k, v] of Object.entries(brand)) {
    if (v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) {
      throw new Error(`Missing/invalid "${k}" parsed from ${SOURCE_SVG}`);
    }
  }
  return brand;
}

/**
 * Build a composite SVG at `size`×`size` with:
 *   - void background rect with proportional rounded corners
 *   - glyph path scaled to fill ~66% of the canvas (matches icon-192.svg proportions)
 */
function buildSvg(size, brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${brand.vb} ${brand.vb}">
  <rect width="${brand.vb}" height="${brand.vb}" rx="${brand.rx}" fill="${brand.bg}"/>
  <path d="${brand.glyphPath}" fill="${brand.glyphFill}"/>
</svg>`;
}

/**
 * Render an SVG string to a PNG Buffer at the requested pixel size.
 * sharp handles the SVG→raster pipeline (uses librsvg under the hood).
 */
async function renderPng(size, brand, { appleBackground = false } = {}) {
  const svgBuf = Buffer.from(buildSvg(size, brand));
  let pipeline = sharp(svgBuf, { density: 300 })
    .resize(size, size);

  if (appleBackground) {
    // Apple touch icons: composite on solid void bg to suppress transparency
    pipeline = pipeline.flatten({ background: brand.bg });
  }

  return pipeline.png().toBuffer();
}

async function main() {
  const brand = await readBrandSource();
  console.log(`Generating raster favicons from ${path.relative(ROOT, SOURCE_SVG)} ...`);
  console.log(`  Brand: bg=${brand.bg}  glyph=${brand.glyphFill}  rx=${brand.rx}/${brand.vb}`);
  console.log('');

  // 1. Standard PNG set
  const outputs = [
    { name: 'favicon-16x16.png',          size: 16  },
    { name: 'favicon-32x32.png',          size: 32  },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
  ];

  for (const { name, size } of outputs) {
    const buf = await renderPng(size, brand);
    const dest = path.join(PUBLIC, name);
    await fs.writeFile(dest, buf);
    const meta = await sharp(buf).metadata();
    console.log(`  ✓ ${name.padEnd(30)} ${meta.width}×${meta.height}  ${buf.length} bytes`);
  }

  // 2. Apple touch icon — 180×180, solid bg (no transparency)
  {
    const size = 180;
    const buf = await renderPng(size, brand, { appleBackground: true });
    const dest = path.join(PUBLIC, 'apple-touch-icon.png');
    await fs.writeFile(dest, buf);
    const meta = await sharp(buf).metadata();
    console.log(`  ✓ ${'apple-touch-icon.png'.padEnd(30)} ${meta.width}×${meta.height}  ${buf.length} bytes`);
  }

  // 3. favicon.ico — multi-resolution 16+32+48 PNG frames
  // png-to-ico default export works from file paths; write temp PNGs first.
  {
    const sizes = [16, 32, 48];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arkon-favicons-'));
    const tmpPaths = [];
    let icoBuf;
    try {
      for (const size of sizes) {
        const buf = await renderPng(size, brand);
        const tmpPath = path.join(tmpDir, `icon-${size}.png`);
        await fs.writeFile(tmpPath, buf);
        tmpPaths.push(tmpPath);
      }
      icoBuf = await pngToIco(tmpPaths);
    } finally {
      // Cleanup must survive a pngToIco/render failure.
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    // public/favicon.ico — static fallback
    const publicIco = path.join(PUBLIC, 'favicon.ico');
    await fs.writeFile(publicIco, icoBuf);
    console.log(`  ✓ ${'favicon.ico (public)'.padEnd(30)} 16+32+48 multi-res  ${icoBuf.length} bytes`);

    // src/app/favicon.ico — Next.js App Router canonical location
    const appIco = path.join(APP_DIR, 'favicon.ico');
    await fs.writeFile(appIco, icoBuf);
    console.log(`  ✓ ${'favicon.ico (src/app)'.padEnd(30)} 16+32+48 multi-res  ${icoBuf.length} bytes`);
  }

  // 4. Verification — confirm no blank/trivial output
  console.log('');
  console.log('Verification:');
  const allOutputs = [
    path.join(PUBLIC, 'favicon-16x16.png'),
    path.join(PUBLIC, 'favicon-32x32.png'),
    path.join(PUBLIC, 'android-chrome-192x192.png'),
    path.join(PUBLIC, 'android-chrome-512x512.png'),
    path.join(PUBLIC, 'apple-touch-icon.png'),
    path.join(PUBLIC, 'favicon.ico'),
    path.join(APP_DIR, 'favicon.ico'),
  ];

  let allOk = true;
  for (const p of allOutputs) {
    const stat = await fs.stat(p);
    const ok = stat.size > 200;
    const rel = path.relative(ROOT, p);
    console.log(`  ${ok ? '✓' : '✗'} ${rel.padEnd(38)} ${stat.size} bytes`);
    if (!ok) allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('All outputs look sane (>200 bytes). Done.');
  } else {
    console.error('ERROR: one or more outputs are suspiciously small — check SVG rendering.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
