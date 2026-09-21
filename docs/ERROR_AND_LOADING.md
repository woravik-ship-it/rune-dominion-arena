# Error Boundaries + Loading Skeletons (Phase 12)

## Error Boundaries — ครอบทุกโซน
| ไฟล์ | ครอบ | พฤติกรรม |
|---|---|---|
| `src/app/global-error.tsx` | ทั้งแอป (root) | หน้า HTML เดี่ยว (ไม่พึ่ง layout) + ปุ่มลองใหม่ + แสดง digest |
| `src/app/(game)/error.tsx` | เกมทุกหน้า | การ์ดแจ้งเตือน + ลองใหม่ / กลับหน้าแรก |
| `src/app/(auth)/error.tsx` | login/register | แจ้งเตือน + ไปหน้าเข้าสู่ระบบ |
| `src/app/admin/error.tsx` | แอดมิน | แจ้งเตือนเรื่องสิทธิ์ ADMIN/MODERATOR |

## Loading Skeletons
| ไฟล์ | ใช้เมื่อ |
|---|---|
| `src/components/ui/Skeleton.tsx` | primitives: `Skeleton`, `SkeletonCardGrid`, `SkeletonList`, `SkeletonStats`, `SkeletonPage` |
| `src/app/(game)/loading.tsx` | เปลี่ยนหน้าในโซนเกม |
| `src/app/discover/loading.tsx` | โหลดหน้าค้นหารูน (Rune Canvas) |

## หลักการ
- Skeleton ใช้ `animate-pulse` ของ Tailwind — ไม่เพิ่ม dependency
- งานเบา: ไม่มี JS เพิ่มในหน้า error (client component เล็ก)
- ทุก error boundary log ฝั่ง client ด้วย `console.error('[zone error]', message, digest)` → ต่อ Sentry ภายหลังได้โดยไม่ต้องแก้ UI
