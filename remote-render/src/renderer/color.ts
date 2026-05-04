export function mixColor(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const clamped = Math.max(0, Math.min(1, amount));
  return `#${[0, 1, 2].map((index) => Math.round(a[index] + (b[index] - a[index]) * clamped).toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(value: string): [number, number, number] {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
