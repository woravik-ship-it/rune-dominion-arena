'use client';

// คลังของสะสม — Phase 11.3 (รางวัลที่ไม่ใช่ Coin: การ์ดพิเศษ/เครื่องประดับ/ฉายา/วัตถุดิบ)
import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';

interface InventoryItem {
  id: string;
  itemType: 'CARD' | 'COSMETIC' | 'TITLE' | 'CRAFTING_DUST' | 'STORY_CHAPTER';
  code: string;
  nameTh: string;
  quantity: number;
  source: string | null;
  acquiredAt: string;
}

const TYPE_LABEL: Record<InventoryItem['itemType'], { label: string; icon: string }> = {
  CARD: { label: 'การ์ดพิเศษ', icon: '🎴' },
  COSMETIC: { label: 'เครื่องประดับ', icon: '✨' },
  TITLE: { label: 'ฉายา', icon: '🏅' },
  CRAFTING_DUST: { label: 'วัตถุดิบ', icon: '🌫️' },
  STORY_CHAPTER: { label: 'บทเนื้อเรื่อง', icon: '📖' },
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/inventory');
        const data = await res.json();
        if (data.success) {
          setItems(data.data);
          setSummary(data.summary ?? {});
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grouped = items.reduce<Record<string, InventoryItem[]>>((acc, item) => {
    (acc[item.itemType] ??= []).push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">คลังของสะสม</h1>
        <p className="text-center text-gray-400 mb-6">รางวัลจากกิจกรรมและภารกิจพิเศษ</p>

        {loading && <p className="text-center text-gray-500 py-10">กำลังโหลด...</p>}

        {!loading && items.length === 0 && (
          <div className="bg-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-400">ยังไม่มีของสะสม</p>
            <p className="text-xs text-gray-500 mt-2">เล่นกิจกรรมเพื่อรับการ์ดพิเศษ ฉายา และของประดับ</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-6 text-center">
              {Object.entries(summary).map(([type, count]) => {
                const meta = TYPE_LABEL[type as InventoryItem['itemType']];
                return (
                  <div key={type} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-lg">{meta?.icon ?? '📦'}</p>
                    <p className="text-xs text-gray-400">{meta?.label ?? type}</p>
                    <p className="text-sm font-bold text-white">{count}</p>
                  </div>
                );
              })}
            </div>

            {Object.entries(grouped).map(([type, list]) => {
              const meta = TYPE_LABEL[type as InventoryItem['itemType']];
              return (
                <section key={type} className="bg-gray-800 rounded-xl p-5 mb-4">
                  <h2 className="text-lg font-bold text-white mb-3">
                    {meta?.icon} {meta?.label ?? type}
                  </h2>
                  <div className="space-y-2">
                    {list.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm border-b border-gray-700 pb-2">
                        <div>
                          <p className="text-white">{item.nameTh}</p>
                          <p className="text-xs text-gray-500">{item.source ?? '-'}</p>
                        </div>
                        <span className="text-amber-400 font-bold">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
