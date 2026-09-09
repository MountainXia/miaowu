const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(width, height, drawPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function renderKawaiiOrangeCat(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Outer circular/squircle boundary
  const radius = w * 0.44;
  if (dist > radius) {
    return [0, 0, 0, 0];
  }

  // Warm deep coffee background
  let r = 24;
  let g = 14;
  let b = 8;

  // Ears
  const leftEarDist = Math.sqrt((x - w * 0.32) * (x - w * 0.32) + (y - h * 0.28) * (y - h * 0.28));
  const rightEarDist = Math.sqrt((x - w * 0.68) * (x - w * 0.68) + (y - h * 0.28) * (y - h * 0.28));

  if ((x > w * 0.18 && x < w * 0.44 && y > h * 0.16 && y < h * 0.4) ||
      (x > w * 0.56 && x < w * 0.82 && y > h * 0.16 && y < h * 0.4)) {
    r = 255; g = 136; b = 38; // Orange coat
    // Inner ear
    if ((x > w * 0.24 && x < w * 0.38 && y > h * 0.22 && y < h * 0.36) ||
        (x > w * 0.62 && x < w * 0.76 && y > h * 0.22 && y < h * 0.36)) {
      r = 253; g = 164; b = 175; // Soft pink
    }
  }

  // Squishy chubby head (ellipse cx, cy+15)
  const headDist = Math.sqrt((dx * dx) / (w * 0.34 * w * 0.34) + ((dy - h * 0.03) * (dy - h * 0.03)) / (h * 0.3 * h * 0.3));
  if (headDist <= 1.0) {
    r = 255; g = 136; b = 38; // Rich warm orange

    // Forehead markings
    if (Math.abs(dx) < w * 0.026 && dy < -h * 0.1 && dy > -h * 0.25) {
      r = 180; g = 52; b = 3;
    }
    if ((Math.abs(dx - w * 0.065) < w * 0.02 || Math.abs(dx + w * 0.065) < w * 0.02) && dy < -h * 0.08 && dy > -h * 0.2) {
      r = 180; g = 52; b = 3;
    }

    // Chubby white muzzle and cheeks
    const leftCheek = Math.sqrt((x - w * 0.41) * (x - w * 0.41) + (y - h * 0.60) * (y - h * 0.60));
    const rightCheek = Math.sqrt((x - w * 0.59) * (x - w * 0.59) + (y - h * 0.60) * (y - h * 0.60));
    const chin = Math.sqrt(dx * dx + (y - h * 0.64) * (y - h * 0.64));
    if (leftCheek < w * 0.11 || rightCheek < w * 0.11 || chin < w * 0.09) {
      r = 255; g = 248; b = 238; // Cream white
    }

    // Big Anime eyes
    const leftEye = Math.sqrt((x - w * 0.37) * (x - w * 0.37) + (y - h * 0.46) * (y - h * 0.46));
    const rightEye = Math.sqrt((x - w * 0.63) * (x - w * 0.63) + (y - h * 0.46) * (y - h * 0.46));
    if (leftEye < w * 0.052 || rightEye < w * 0.052) {
      r = 28; g = 25; b = 23;
      // Big highlight
      if ((leftEye < w * 0.024 && x > w * 0.37 && y < h * 0.46) ||
          (rightEye < w * 0.024 && x > w * 0.63 && y < h * 0.46)) {
        r = 255; g = 255; b = 255;
      }
      // Small sparkle
      if ((Math.abs(x - (w * 0.35)) < w * 0.01 && Math.abs(y - (h * 0.48)) < h * 0.01) ||
          (Math.abs(x - (w * 0.61)) < w * 0.01 && Math.abs(y - (h * 0.48)) < h * 0.01)) {
        r = 255; g = 255; b = 255;
      }
    }

    // Pink button nose
    const noseDist = Math.sqrt(dx * dx + (y - h * 0.54) * (y - h * 0.54));
    if (noseDist < w * 0.02) {
      r = 244; g = 63; b = 94; // Vibrant soft pink
    }

    // Blush
    const leftBlush = Math.sqrt((x - w * 0.27) * (x - w * 0.27) + (y - h * 0.56) * (y - h * 0.56));
    const rightBlush = Math.sqrt((x - w * 0.73) * (x - w * 0.73) + (y - h * 0.56) * (y - h * 0.56));
    if (leftBlush < w * 0.045 || rightBlush < w * 0.045) {
      r = 251; g = 113; b = 133;
    }
  }

  // Gold coin & white paws at bottom
  const coinDist = Math.sqrt(dx * dx + (y - h * 0.8) * (y - h * 0.8));
  if (coinDist < w * 0.125) {
    r = 245; g = 192; b = 45; // Shiny golden
    if (coinDist > w * 0.11) {
      r = 146; g = 64; b = 14;
    }
    // ¥ symbol
    if (Math.abs(dx) < w * 0.055 && Math.abs(y - h * 0.79) < h * 0.014) {
      r = 255; g = 255; b = 255;
    }
    if (Math.abs(dx) < w * 0.016 && y > h * 0.79 && y < h * 0.85) {
      r = 255; g = 255; b = 255;
    }
  }

  // Little paws
  const leftPaw = Math.sqrt((x - w * 0.38) * (x - w * 0.38) + (y - h * 0.81) * (y - h * 0.81));
  const rightPaw = Math.sqrt((x - w * 0.62) * (x - w * 0.62) + (y - h * 0.81) * (y - h * 0.81));
  if (leftPaw < w * 0.055 || rightPaw < w * 0.055) {
    r = 255; g = 255; b = 255; // White paw
  }

  return [r, g, b, 255];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPng(192, 192, renderKawaiiOrangeCat));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPng(512, 512, renderKawaiiOrangeCat));

console.log('Successfully generated Kawaii Orange Cat PNG icons!');
