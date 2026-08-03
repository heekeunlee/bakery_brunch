#!/usr/bin/env node
/**
 * PWA 아이콘(192/512 PNG) 생성기.
 * 외부 의존성 없이 node:zlib 만으로 PNG 를 직접 인코딩한다.
 *   node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGB 픽셀 배열 → PNG 버퍼 */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter: none
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BRAND = [0x8b, 0x5e, 0x34];
const CREAM = [0xf7, 0xe7, 0xd0];
const CRUST = [0xc8, 0x76, 0x3c];

/** 빵 한 덩어리를 단순 도형으로. 세로로 살짝 눌린 타원 + 칼집 3줄. */
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  const rx = size * 0.3;
  const ry = size * 0.21;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BRAND;

      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        color = CREAM;
        // 대각선 칼집 3줄
        const d = x - y + size * 0.0;
        const band = ((d % (size * 0.16)) + size * 0.16) % (size * 0.16);
        if (band < size * 0.035 && nx * nx + ny * ny <= 0.72) color = CRUST;
      }

      const i = (y * size + x) * 3;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
    }
  }
  return buf;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePng(size, size, drawIcon(size));
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), png);
  console.log(`✓ public/icon-${size}.png (${png.length} bytes)`);
}
