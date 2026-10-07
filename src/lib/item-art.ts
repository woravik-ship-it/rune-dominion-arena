// URL สาธารณะของภาพ Item (client-safe — ไม่มี node import; ใช้ใน /items, กระเป๋า, ช่าง)
export function itemArtUrl(code: string): string {
  return `/api/items/${encodeURIComponent(code)}/art`;
}