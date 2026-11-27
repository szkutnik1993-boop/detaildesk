// Generuje ikony PNG aplikacji z SVG (uruchom: npm run icons)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const icon = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0E0F11"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <path d="M96 330 A170 170 0 0 1 416 330" fill="none" stroke="#C9A45C" stroke-width="22" stroke-linecap="round"/>
    <path d="M150 330 A112 112 0 0 1 362 330" fill="none" stroke="#C9A45C" stroke-opacity="0.45" stroke-width="10" stroke-linecap="round"/>
    <text x="256" y="402" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="86" letter-spacing="14" fill="#F2F2F0">ARC</text>
  </g>
</svg>`;

writeFileSync('public/favicon.svg', icon(0).trim());
const out = [
  ['public/apple-touch-icon.png', 180, 0],
  ['public/icon-192.png', 192, 0],
  ['public/icon-512.png', 512, 0],
  ['public/icon-maskable-512.png', 512, 0.22],
];
for (const [file, size, pad] of out) {
  await sharp(Buffer.from(icon(pad))).resize(size, size).png().toFile(file);
  console.log('✓', file);
}
