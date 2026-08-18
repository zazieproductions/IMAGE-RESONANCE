// IMAGE//RESONANCE — visual analysis engine
// Converts an image into a compact set of perceptual + structural features
// that the audio engine maps onto oscillators, drones, textures and rhythm.

export interface ColumnBand {
  brightness: number; // 0..1 mean luminance of column
  energy: number; // 0..1 contrast / detail energy in column
  hue: number; // 0..1 dominant hue (0..1 == 0..360deg)
  saturation: number; // 0..1
  redness: number;
  greenness: number;
  blueness: number;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  // Global descriptors
  avgBrightness: number; // 0..1
  contrast: number; // 0..1 std dev of luminance
  saturation: number; // 0..1 avg
  warmth: number; // -1..1 (blue -> red)
  complexity: number; // 0..1 edge density
  colorfulness: number; // 0..1
  dominantHue: number; // 0..1
  entropy: number; // 0..1 histogram entropy
  // Spectral / spatial descriptors
  columns: ColumnBand[]; // left->right slices (spectrograph source)
  rows: number[]; // top->bottom brightness (drone contour)
  histogram: number[]; // 24-bin luminance histogram (0..1 normalized)
  huePalette: { hue: number; sat: number; light: number; weight: number }[]; // top color clusters
  // Derived musical seeds
  rootHz: number;
  scale: number[]; // semitone offsets
  tempo: number; // bpm
  key: string;
}

const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  whole: [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, l];
}

export function analyzeImage(img: HTMLImageElement, columnCount = 96): ImageAnalysis {
  const W = 320;
  const H = Math.max(64, Math.round((img.naturalHeight / img.naturalWidth) * W)) || 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  const lum = new Float32Array(W * H);
  let sumL = 0;
  let sumSat = 0;
  let sumWarm = 0;
  let sumColor = 0;
  const hist = new Array(24).fill(0);
  const hueBuckets = new Array(12).fill(0).map(() => ({ sat: 0, light: 0, count: 0 }));

  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum[i] = l;
    sumL += l;
    const [h, s] = rgbToHsl(r, g, b);
    sumSat += s;
    sumWarm += (r - b) / 255;
    // colorfulness metric (Hasler-Susstrunk simplified)
    const rg = Math.abs(r - g);
    const yb = Math.abs(0.5 * (r + g) - b);
    sumColor += (rg + yb) / 255;
    hist[Math.min(23, Math.floor(l * 24))]++;
    const hb = Math.min(11, Math.floor(h * 12));
    if (s > 0.12 && l > 0.08 && l < 0.96) {
      hueBuckets[hb].sat += s;
      hueBuckets[hb].light += l;
      hueBuckets[hb].count++;
    }
  }
  const N = W * H;
  const avgBrightness = sumL / N;
  const saturation = sumSat / N;
  const warmth = Math.max(-1, Math.min(1, (sumWarm / N) * 2));
  const colorfulness = Math.min(1, sumColor / N / 0.6);

  // contrast (std dev)
  let varSum = 0;
  for (let i = 0; i < N; i++) varSum += (lum[i] - avgBrightness) ** 2;
  const contrast = Math.min(1, Math.sqrt(varSum / N) * 2.4);

  // entropy of histogram
  let entropy = 0;
  for (const c of hist) {
    if (c > 0) {
      const p = c / N;
      entropy -= p * Math.log2(p);
    }
  }
  entropy = Math.min(1, entropy / Math.log2(24));

  // edge density (Sobel-ish, sampled)
  let edge = 0;
  let edgeCount = 0;
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      const gx = lum[y * W + (x + 1)] - lum[y * W + (x - 1)];
      const gy = lum[(y + 1) * W + x] - lum[(y - 1) * W + x];
      edge += Math.sqrt(gx * gx + gy * gy);
      edgeCount++;
    }
  }
  const complexity = Math.min(1, edge / edgeCount / 0.35);

  // dominant hue palette
  const huePalette = hueBuckets
    .map((hb, idx) => ({
      hue: (idx + 0.5) / 12,
      sat: hb.count ? hb.sat / hb.count : 0,
      light: hb.count ? hb.light / hb.count : 0,
      weight: hb.count / N,
    }))
    .filter((x) => x.weight > 0.005)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
  const dominantHue = huePalette.length ? huePalette[0].hue : 0.5;

  // Column bands (left -> right) for spectrograph & oscillator bank
  const columns: ColumnBand[] = [];
  const colW = W / columnCount;
  for (let c = 0; c < columnCount; c++) {
    const x0 = Math.floor(c * colW);
    const x1 = Math.max(x0 + 1, Math.floor((c + 1) * colW));
    let cl = 0;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    let cs = 0;
    let ch = 0;
    let hueX = 0;
    let hueY = 0;
    let cnt = 0;
    let localVar = 0;
    let prevL = -1;
    for (let x = x0; x < x1; x++) {
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        cl += lum[i];
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        cr += r;
        cg += g;
        cb += b;
        const [h, s] = rgbToHsl(r, g, b);
        cs += s;
        ch += h;
        hueX += Math.cos(h * 2 * Math.PI) * s;
        hueY += Math.sin(h * 2 * Math.PI) * s;
        if (prevL >= 0) localVar += Math.abs(lum[i] - prevL);
        prevL = lum[i];
        cnt++;
      }
    }
    const meanL = cl / cnt;
    let hueAngle = Math.atan2(hueY, hueX) / (2 * Math.PI);
    if (hueAngle < 0) hueAngle += 1;
    columns.push({
      brightness: meanL,
      energy: Math.min(1, (localVar / cnt) * 6),
      hue: hueAngle,
      saturation: cs / cnt,
      redness: cr / cnt / 255,
      greenness: cg / cnt / 255,
      blueness: cb / cnt / 255,
    });
  }

  // Rows (top -> bottom) brightness contour for drone glide
  const rowCount = 48;
  const rows: number[] = [];
  const rowH = H / rowCount;
  for (let rIdx = 0; rIdx < rowCount; rIdx++) {
    const y0 = Math.floor(rIdx * rowH);
    const y1 = Math.max(y0 + 1, Math.floor((rIdx + 1) * rowH));
    let s = 0;
    let cnt = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < W; x++) {
        s += lum[y * W + x];
        cnt++;
      }
    rows.push(s / cnt);
  }

  // Musical seeds
  // Root note from dominant hue (map hue circle -> chromatic)
  const rootSemitone = Math.floor(dominantHue * 12) % 12;
  // Octave from brightness: darker = lower
  const octave = 1 + Math.floor(avgBrightness * 3); // 1..4
  const rootHz = 55 * Math.pow(2, octave) * Math.pow(2, rootSemitone / 12);

  // Scale from warmth + saturation + entropy
  let scaleName: string;
  if (entropy > 0.85) scaleName = "chromatic";
  else if (warmth < -0.25) scaleName = saturation > 0.4 ? "phrygian" : "minor";
  else if (warmth > 0.3) scaleName = colorfulness > 0.5 ? "lydian" : "major";
  else if (saturation < 0.2) scaleName = "whole";
  else scaleName = colorfulness > 0.45 ? "dorian" : "pentatonic";
  const scale = SCALES[scaleName];

  // Tempo from complexity + contrast
  const tempo = Math.round(46 + complexity * 78 + contrast * 20); // ~46..144

  const key = `${NOTE_NAMES[rootSemitone]} ${scaleName}`;

  const normHist = hist.map((c) => c / N);

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    avgBrightness,
    contrast,
    saturation,
    warmth,
    complexity,
    colorfulness,
    dominantHue,
    entropy,
    columns,
    rows,
    histogram: normHist,
    huePalette,
    rootHz,
    scale,
    tempo,
    key,
  };
}

export function huePaletteToCss(h: number, s: number, l: number, alpha = 1): string {
  return `hsla(${Math.round(h * 360)}, ${Math.round(Math.max(0.15, s) * 100)}%, ${Math.round(
    Math.max(0.25, Math.min(0.7, l + 0.1)) * 100
  )}%, ${alpha})`;
}
