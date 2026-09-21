// Loading ของ discover — skeleton ตอนโหลดหน้าค้นหารูน (Phase 12)
import { Skeleton } from '@/components/ui/Skeleton';

export default function DiscoverLoading() {
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/2 mx-auto" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
        <Skeleton className="h-14 w-40 mx-auto" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-12 w-48 mx-auto" />
      </div>
    </main>
  );
}
