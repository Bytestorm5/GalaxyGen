export const rgbTupleToHex = (rgb?: [number, number, number]) => {
  if (!rgb || rgb.length < 3) return 0xffffff;
  const [r, g, b] = rgb.map((n) => Math.max(0, Math.min(255, n)));
  return (r << 16) + (g << 8) + b;
};

export const rgbToHex = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [255, 255, 255];
};

export const fallbackPalette = (id: number) => {
  const hues = [180, 210, 250, 320, 45, 90, 0, 280, 120, 30];
  const h = hues[id % hues.length];
  // simple HSL to RGB
  const s = 0.65;
  const l = 0.52;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    Math.round((r + m) * 255) * 0x10000 +
    Math.round((g + m) * 255) * 0x100 +
    Math.round((b + m) * 255)
  );
};
