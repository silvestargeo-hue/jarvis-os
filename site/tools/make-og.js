/* Generates assets/og-image.png (1200x630) — pure Node, zlib PNG writer.
 * Design: dark space background, JARVIS ring logo, wordmark + tagline. */
const zlib = require("zlib");
const fs = require("fs");

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const W = 1200, H = 630;
const px = new Uint8Array(W * H * 4); // RGBA

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const na = a / 255;
  px[i] = Math.round(px[i] * (1 - na) + r * na);
  px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
  px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
  px[i + 3] = Math.max(px[i + 3], a);
}

/* background: vertical gradient #030711 → #0a1428 + subtle radial glow */
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(3 + t * 7), g = Math.round(7 + t * 13), b = Math.round(17 + t * 23);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
}
/* radial cyan glow center-left */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - 300, dy = y - 315;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 380) {
    const a = Math.round(40 * (1 - d / 380));
    setPx(x, y, 34, 211, 238, a);
  }
}
/* faint grid */
for (let y = 0; y < H; y += 44) for (let x = 0; x < W; x++) setPx(x, y, 56, 189, 248, 14);
for (let x = 0; x < W; x += 44) for (let y = 0; y < H; y++) setPx(x, y, 56, 189, 248, 14);

/* stars */
let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 130; i++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
  const a = Math.round(60 + rnd() * 130);
  setPx(x, y, 200, 235, 255, a);
  if (rnd() > 0.7) { setPx(x + 1, y, 200, 235, 255, a / 2); setPx(x, y + 1, 200, 235, 255, a / 2); }
}

/* ring logo centered-left at (300, 315), outer R=190 */
const CX = 300, CY = 315, RING_R = 150, RING_W = 34;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - CX, dy = y - CY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx);
  const ringDist = Math.abs(d - RING_R);
  const inArc = (ang > -1.9 && ang < 1.7);
  if (ringDist < RING_W && inArc) {
    const t = 1 - ringDist / RING_W;
    setPx(x, y, 34, 211, 238, Math.round(255 * t));
  }
  // inner core dot
  if (d < 26) setPx(x, y, 103, 232, 249, 255);
  // orbiting dot (upper right of ring)
  const ox = CX + Math.cos(-1.1) * RING_R, oy = CY + Math.sin(-1.1) * RING_R;
  if (Math.sqrt((x - ox) ** 2 + (y - oy) ** 2) < 14) setPx(x, y, 139, 92, 246, 255);
}

/* bitmap text: 5x7 font */
const FONT = {
  "A": ["01110","10001","10001","11111","10001","10001","10001"],
  "B": ["11110","10001","11110","10001","10001","10001","11110"],
  "C": ["01110","10001","10000","10000","10000","10001","01110"],
  "D": ["11110","10001","10001","10001","10001","10001","11110"],
  "E": ["11111","10000","11110","10000","10000","10000","11111"],
  "F": ["11111","10000","11110","10000","10000","10000","10000"],
  "G": ["01110","10001","10000","10111","10001","10001","01111"],
  "H": ["10001","10001","11111","10001","10001","10001","10001"],
  "I": ["11111","00100","00100","00100","00100","00100","11111"],
  "J": ["00111","00010","00010","00010","00010","10010","01100"],
  "K": ["10001","10010","10100","11000","10100","10010","10001"],
  "L": ["10000","10000","10000","10000","10000","10000","11111"],
  "M": ["10001","11011","10101","10101","10001","10001","10001"],
  "N": ["10001","11001","10101","10011","10001","10001","10001"],
  "O": ["01110","10001","10001","10001","10001","10001","01110"],
  "P": ["11110","10001","10001","11110","10000","10000","10000"],
  "Q": ["01110","10001","10001","10001","10101","10010","01101"],
  "R": ["11110","10001","10001","11110","10100","10010","10001"],
  "S": ["01111","10000","10000","01110","00001","00001","11110"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "U": ["10001","10001","10001","10001","10001","10001","01110"],
  "V": ["10001","10001","10001","10001","10001","01010","00100"],
  "W": ["10001","10001","10001","10101","10101","11011","10001"],
  "X": ["10001","01010","00100","00100","00100","01010","10001"],
  "Y": ["10001","01010","00100","00100","00100","00100","00100"],
  "Z": ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00110","01000","10000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  ".": ["00000","00000","00000","00000","00000","00100","00100"],
  "—": ["00000","00000","00000","11111","00000","00000","00000"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "·": ["00000","00000","00000","00100","00000","00000","00000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  ",": ["00000","00000","00000","00000","00100","00100","01000"],
};

function drawText(str, ox, oy, scale, color, alpha = 255) {
  let cx = ox;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch] || FONT[" "];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              setPx(cx + gx * scale + sx, oy + gy * scale + sy, color[0], color[1], color[2], alpha);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

drawText("JARVIS OS", 560, 250, 14, [232, 244, 255]);
drawText("YOUR OWN AI OPERATING SYSTEM", 560, 380, 5, [103, 232, 249], 230);
drawText("UNLIMITED . KEYLESS . UNGATEKEPT", 560, 440, 4, [157, 180, 208], 200);

/* footer bar */
for (let x = 0; x < W; x++) {
  for (let y = H - 8; y < H; y++) setPx(x, y, 34, 211, 238, 140);
}

/* encode PNG */
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.subarray(y * W * 4, (y + 1) * W * 4).forEach((v, i) => { raw[y * (1 + W * 4) + 1 + i] = v; });
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(__dirname + "/../assets/og-image.png", png);
console.log("og-image.png written:", png.length, "bytes");
