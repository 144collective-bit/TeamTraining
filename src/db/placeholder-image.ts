import { deflateSync } from "node:zlib";

/**
 * Minimal PNG encoder, used only to generate obviously-synthetic placeholder
 * photographs for the seeded example. Real SOPs carry real photographs
 * uploaded through the editor.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A flat steel-toned field with diagonal hatching — reads as "photo goes
 * here" in a layout without pretending to be a photograph.
 */
export function placeholderPng(width = 640, height = 480, seed = 0): Buffer {
  const base = [
    [92, 102, 112], [104, 110, 118], [86, 96, 106], [110, 116, 122],
  ][seed % 4];

  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const hatch = ((x + y) % 24 < 2) ? 16 : 0;
      const vignette = Math.round(
        18 * Math.hypot(x / width - 0.5, y / height - 0.5),
      );
      raw[p++] = clamp(base[0] + hatch - vignette);
      raw[p++] = clamp(base[1] + hatch - vignette);
      raw[p++] = clamp(base[2] + hatch - vignette);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
