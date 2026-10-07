// Special Art URL — ภาพของการ์ดวิเศษ/ของหายากจาก Event (client-safe)
export function specialArtUrl(code: string): string {
  return `/api/inventory/${encodeURIComponent(code)}/art`;
}