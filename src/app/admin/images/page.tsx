'use client';

import { useEffect, useState } from 'react';

interface ImageJob {
  id: string;
  cardId: string;
  status: string;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
  card: { name: string; nameTh: string | null };
}

interface ImagesData {
  byStatus: Record<string, number>;
  cardsWithoutImage: number;
  recent: ImageJob[];
}

export default function AdminImagesPage() {
  const [data, setData] = useState<ImagesData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/images');
      const d = await res.json();
      if (d.success) setData(d.data);
      else setError(d.error);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    }
  };

  useEffect(() => { load(); }, []);

  const runAction = async (path: string, body: object, label: string) => {
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'ทำรายการไม่สำเร็จ'); return; }
      setMsg(`✅ ${label}: ${d.message || (d.data?.processed ?? 'สำเร็จ')}`);
      await load();
    } catch {
      setError('ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          disabled={busy}
          onClick={() => runAction('/api/admin/images/requeue', {}, 'Requeue การ์ดที่ไม่มีภาพ')}
          className="btn-secondary text-sm"
        >
          🔄 Requeue การ์ดที่ยังไม่มีภาพ
        </button>
        <button
          disabled={busy}
          onClick={() => runAction('/api/admin/images/process', { max: 20 }, 'ประมวลผลคิวภาพ')}
          className="btn-primary text-sm"
        >
          ▶️ ประมวลผลคิว (20 งาน)
        </button>
      </div>

      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {!data ? (
        <p className="text-gray-400">กำลังโหลด...</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm mb-4">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <span key={status} className="bg-gray-800 border border-gray-700 px-3 py-1 rounded-full">
                {status}: <b className="text-amber-400">{count}</b>
              </span>
            ))}
            <span className="bg-gray-800 border border-gray-700 px-3 py-1 rounded-full">
              การ์ดไม่มีภาพ: <b className={data.cardsWithoutImage > 0 ? 'text-red-400' : 'text-green-400'}>{data.cardsWithoutImage}</b>
            </span>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700 text-gray-300">
                <tr>
                  <th className="p-2 text-left">การ์ด</th>
                  <th className="p-2 text-left">สถานะ</th>
                  <th className="p-2 text-right">Retry</th>
                  <th className="p-2 text-left">Error</th>
                  <th className="p-2 text-left">สร้างเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((j) => (
                  <tr key={j.id} className="border-t border-gray-700 text-gray-200">
                    <td className="p-2">{j.card.nameTh || j.card.name}</td>
                    <td className="p-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        j.status === 'COMPLETED' ? 'bg-green-600'
                        : j.status === 'FAILED' ? 'bg-red-600'
                        : 'bg-yellow-600'
                      }`}>{j.status}</span>
                    </td>
                    <td className="p-2 text-right">{j.retryCount}</td>
                    <td className="p-2 text-xs text-red-400 max-w-[200px] truncate">{j.errorMessage || '-'}</td>
                    <td className="p-2 text-xs text-gray-500">
                      {new Date(j.createdAt).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
