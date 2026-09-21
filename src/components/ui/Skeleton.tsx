'use client';

// Skeleton — โครงโหลดสำหรับทุกหน้า (Phase 12)
// รองรับหลายรูปแบบ: card / list / stat / canvas — mobile-first
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-700/60 ${className}`} />;
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-800 rounded-lg p-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-800 rounded-lg p-3 space-y-2">
          <Skeleton className="h-3 w-1/2 mx-auto" />
          <Skeleton className="h-5 w-2/3 mx-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-4">
      {title && <Skeleton className="h-8 w-1/2 mx-auto" />}
      <Skeleton className="h-24 w-full" />
      <SkeletonList count={3} />
    </div>
  );
}
