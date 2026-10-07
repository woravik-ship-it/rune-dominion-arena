// Map Art URL — URL สาธารณะของภาพพื้นหลังโซนแผนที่ (client-safe)
export function mapArtUrl(zoneId: string): string {
  return `/api/map/${encodeURIComponent(zoneId)}/art`;
}