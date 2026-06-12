/**
 * generate-favicons.mjs
 * Regenerates the raster favicon set from public/arkon-glyph.svg.
 *
 * Brand tokens (locked — change here if brand changes):
 *   Void background: #0A0A0C
 *   Quarn emerald:   #00D47E
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

// Brand tokens — read from layout.tsx comment / globals.css comment
const VOID_BG = '#0A0A0C';   // --void; confirmed in layout.tsx viewport.themeColor
const QUARN   = '#00D47E';   // Quarn emerald; confirmed in icon-192.svg

// Corner radius ratio — matches icon-192.svg rx="234" on a 1024 canvas ≈ 22.85%
const RADIUS_RATIO = 234 / 1024;

/**
 * Build a composite SVG at `size`×`size` with:
 *   - void background rect with proportional rounded corners
 *   - glyph path scaled to fill ~66% of the canvas (matches icon-192.svg proportions)
 *
 * The raw arkon-glyph.svg is a bare path on a 1024×1024 viewBox.
 * icon-192.svg wraps it in a bg rect with inset path coords — we replicate that.
 */
function buildSvg(size) {
  const vb = 1024;
  const rx = Math.round(RADIUS_RATIO * vb);
  // Glyph path as used in icon-192.svg (slightly inset from the 1024 canvas)
  const glyphPath = 'M512 196 L848 868 L676 868 L512 562 L348 868 L176 868 Z';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">
  <rect width="${vb}" height="${vb}" rx="${rx}" fill="${VOID_BG}"/>
  <path d="${glyphPath}" fill="${QUARN}"/>
</svg>`;
}

/**
 * Render an SVG string to a PNG Buffer at the requested pixel size.
 * sharp handles the SVG→raster pipeline (uses librsvg under the hood).
 */
async function renderPng(size, { appleBackground = false } = {}) {
  const svgBuf = Buffer.from(buildSvg(size));
  let pipeline = sharp(svgBuf, { density: 300 })
    .resize(size, size);

  if (appleBackground) {
    // Apple touch icons: composite on solid void bg to suppress transparency
    pipeline = pipeline.flatten({ background: VOID_BG });
  }

  return pipeline.png().toBuffer();
}

async function main() {
  console.log('Generating raster favicons from arkon-glyph.svg ...');
  console.log(`  Brand: bg=${VOID_BG}  glyph=${QUARN}`);
  console.log('');

  // 1. Standard PNG set
  const outputs = [
    { name: 'favicon-16x16.png',          size: 16  },
    { name: 'favicon-32x32.png',          size: 32  },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
  ];

  for (const { name, size } of outputs) {
    const buf = await renderPng(size);
    const dest = path.join(PUBLIC, name);
    await fs.writeFile(dest, buf);
    const meta = await sharp(buf).metadata();
    console.log(`  ✓ ${name.padEnd(30)} ${meta.width}×${meta.height}  ${buf.length} bytes`);
  }

  // 2. Apple touch icon — 180×180, solid bg (no transparency)
  {
    const size = 180;
    const buf = await renderPng(size, { appleBackground: true });
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
    for (const size of sizes) {
      const buf = await renderPng(size);
      const tmpPath = path.join(tmpDir, `icon-${size}.png`);
      await fs.writeFile(tmpPath, buf);
      tmpPaths.push(tmpPath);
    }

    const icoBuf = await pngToIco(tmpPaths);

    // Cleanup temp files
    for (const p of tmpPaths) await fs.unlink(p).catch(() => {});
    await fs.rmdir(tmpDir).catch(() => {});

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
