// Loading ของ (game) zone — skeleton กลางระหว่างเปลี่ยนหน้า (Phase 12)
import { SkeletonList, Skeleton } from '@/components/ui/Skeleton';

export default function GameLoading() {
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/2 mx-auto" />
        <Skeleton className="h-24 w-full" />
        <SkeletonList count={3} />
      </div>
    </main>
  );
}
