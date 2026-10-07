/**
 * Regenerate icon and preview assets into public/ using headless Chromium and the real game:
 *   - icon.svg / favicon.svg: the duck sprite as crisp SVG rects (from window.__game.iconSvg)
 *   - icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png, apple-touch-icon.png
 *   - splash/<w>x<h>.png Apple launch screens for every current iPhone/iPad size
 *   - cover.png 1200x630 Open Graph preview rendered from the game
 * Writes the <link rel="apple-touch-startup-image"> tags into index.html.
 *   npm run build && npm run assets && npm run build
 * ONLY=cover regenerates just the cover.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), '.cache/ms-playwright/chromium-1223/chrome-linux/chrome');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.env.PORT ?? '4184';
const BASE = `http://localhost:${PORT}/flap-flock/`;

if (!existsSync('dist')) throw new Error('run npm run build first (assets render from the preview build)');
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const r = await fetch(BASE);
    if (r.ok && (await r.text()).includes('Flap Flock')) break;
  } catch {
    /* not yet */
  }
  if (i === 59) throw new Error(`preview did not come up on ${PORT}`);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const font = 'data:font/woff2;base64,' + readFileSync('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2').toString('base64');
const fontFace = `@font-face { font-family: 'PS2P'; src: url(${font}) format('woff2'); }`;

async function gamePage(viewport, query = '?lang=en') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(BASE + query, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__game);
  return { ctx, p };
}

const coverOnly = process.env.ONLY === 'cover';
if (!coverOnly) {
  const { ctx, p } = await gamePage({ width: 400, height: 400 });
  const svg = await p.evaluate(() => window.__game.iconSvg());
  await ctx.close();
  writeFileSync('public/icon.svg', svg + '\n');
  writeFileSync('public/favicon.svg', svg + '\n');
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  mkdirSync('public/icons', { recursive: true });
  mkdirSync('public/splash', { recursive: true });

  async function icon(size, file, pad = 0) {
    const c = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await c.newPage();
    // Maskable icons keep the art inside the central safe zone.
    const inner = size - pad * 2;
    await page.setContent(`<body style="margin:0;background:#5c94fc"><img src="${dataUrl}" style="display:block;margin:${pad}px;width:${inner}px;height:${inner}px;image-rendering:pixelated"></body>`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: file });
    await c.close();
  }
  await icon(180, 'public/apple-touch-icon.png');
  await icon(192, 'public/icons/icon-192.png');
  await icon(512, 'public/icons/icon-512.png');
  await icon(512, 'public/icons/icon-512-maskable.png', 52);

  // Apple launch screens: [css width, css height, dpr]
  const devices = [
    [440, 956, 3], [430, 932, 3], [402, 874, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
    [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
    [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
  ];
  const links = [];
  for (const [w, h, dpr] of devices) {
    for (const orient of ['portrait', 'landscape']) {
      const cw = orient === 'portrait' ? w : h;
      const ch = orient === 'portrait' ? h : w;
      const c = await browser.newContext({ viewport: { width: cw, height: ch }, deviceScaleFactor: dpr });
      const page = await c.newPage();
      const iconSize = Math.round(Math.min(cw, ch) * 0.3);
      const ground = Math.round(ch * 0.14);
      await page.setContent(`<style>${fontFace}</style><body style="margin:0;width:${cw}px;height:${ch}px;background:linear-gradient(#5c94fc ${ch - ground}px,#000 ${ch - ground}px,#000 ${ch - ground + 3}px,#58d854 ${ch - ground + 3}px,#58d854 ${ch - ground + 9}px,#00a800 ${ch - ground + 9}px,#00a800 ${ch - ground + 15}px,#c84c0c ${ch - ground + 15}px);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'PingFang SC','Hiragino Sans GB',sans-serif">
        <img src="${dataUrl}" style="width:${iconSize}px;height:${iconSize}px;image-rendering:pixelated;border:4px solid #000;margin-top:-${ground}px">
        <div style="margin-top:${Math.round(iconSize * 0.2)}px;font:${Math.round(iconSize * 0.16)}px PS2P;color:#f8d830;text-shadow:3px 3px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000">FLAP FLOCK</div>
        <div style="margin-top:10px;font-size:${Math.round(iconSize * 0.1)}px;font-weight:700;color:#fff;text-shadow:2px 2px 0 #000">扑翅鸟群 · 撲翅鳥群</div></body>`);
      await page.waitForTimeout(150);
      const file = `splash/${cw * dpr}x${ch * dpr}.png`;
      await page.screenshot({ path: 'public/' + file });
      links.push(`    <link rel="apple-touch-startup-image" href="${file}" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orient})" />`);
      await c.close();
    }
  }
  // Replace everything from the SPLASH marker up to the canonical link.
  const html = readFileSync('index.html', 'utf8');
  const start = html.indexOf('    <!-- SPLASH');
  const canon = html.indexOf('    <link rel="canonical"');
  if (start < 0 || canon < start) throw new Error('index.html needs a <!-- SPLASH --> marker before the canonical link');
  const block = `    <!-- SPLASH: iOS launch screens, one per device size and orientation (generated by scripts/assets.mjs) -->\n${links.join('\n')}\n`;
  writeFileSync('index.html', html.slice(0, start) + block + html.slice(canon));
  console.error(`wrote ${links.length} splash screens`);
}

// Open Graph cover: the real game (1-1, autopilot) at 2x, title on the right.
{
  const { ctx, p } = await gamePage({ width: 1200, height: 630 });
  await p.evaluate(() => {
    const g = window.__game;
    g.coverMode(true);
    g.start('1-1');
    g.run.press();
    g.autopilot(true);
    g.step(14.2);
    g.freeze(true);
    for (const id of ['banner', 'corner', 'screen']) document.getElementById(id).classList.add('hidden');
    document.getElementById('app').classList.add('cover-shot');
  });
  await p.addStyleTag({
    content: `
      ${fontFace}
      .cover { position: absolute; top: 0; bottom: 0; right: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,.42) 22%); font-family: system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', sans-serif; color: #fff; }
      .cover h1 { margin: 0; font: 62px/1.15 PS2P; letter-spacing: 2px; }
      .cover h1 span { display: block; color: #f8d830; text-shadow: 4px 0 0 #000, -4px 0 0 #000, 0 4px 0 #000, 0 -4px 0 #000, 4px 4px 0 #000, -4px 4px 0 #000, 4px -4px 0 #000, -4px -4px 0 #000, 7px 8px 0 #c84c0c, 8px 9px 0 #000; }
      .cover h1 span + span { color: #fcfcfc; text-shadow: 4px 0 0 #000, -4px 0 0 #000, 0 4px 0 #000, 0 -4px 0 #000, 4px 4px 0 #000, -4px 4px 0 #000, 4px -4px 0 #000, -4px -4px 0 #000, 7px 8px 0 #00a800, 8px 9px 0 #000; }
      .cover .zh { margin-top: 14px; font-size: 34px; font-weight: 800; letter-spacing: 8px; text-shadow: 3px 3px 0 #000; }
      .cover .flock { display: flex; gap: 6px; align-items: flex-end; margin: 18px 0 6px; }
      .cover .flock canvas { image-rendering: pixelated; }
      .cover p { margin: 10px 0 0; font-size: 22px; line-height: 1.35; font-weight: 700; text-shadow: 2px 2px 0 #000; }
      .cover .langs { font-size: 18px; opacity: .92; }
    `,
  });
  await p.evaluate(async () => {
    const box = document.createElement('div');
    box.className = 'cover';
    box.innerHTML = '<h1><span>FLAP</span><span>FLOCK</span></h1><div class="zh">扑翅鸟群</div><div class="flock"></div><p>Tap to flap through eight pixel worlds.</p><p class="langs">English · 简体中文 · 繁體中文 · Español</p>';
    document.getElementById('app').append(box);
    const flock = box.querySelector('.flock');
    for (const id of window.__game.birds) {
      const c = document.createElement('canvas');
      flock.append(c);
      const src = window.__game.renderer.birdIcon(id, 3);
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
    }
    await document.fonts.ready;
  });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'public/cover.png' });
  await ctx.close();
}
await browser.close();
stop();
console.error('assets generated');
