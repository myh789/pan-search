/** Inline SVG data-URIs for pan type icons (原版 images/0-4.png). */
const COLORS = ['#FF6A00', '#FF6A00', '#2E7BFF', '#FF4D4F', '#1AAD19'];
const LABELS = ['夸', '阿', '百', 'UC', '迅'];

export function panIconSrc(isType: number): string {
  const t = Number(isType) || 0;
  const fill = COLORS[t] ?? COLORS[0];
  const label = LABELS[t] ?? '盘';
  const fs = label.length > 1 ? 11 : 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${fill}"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="${fs}" font-family="sans-serif" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
