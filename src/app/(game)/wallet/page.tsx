'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';

interface WalletInfo {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

interface Tx {
  id: string;
  amount: number;
  type: string;
  referenceType: string | null;
  description: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [filter]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [wRes, tRes] = await Promise.all([
        apiFetch('/api/wallet'),
        apiFetch(`/api/wallet/transactions?limit=30&filter=${filter}`),
      ]);
      const w = await wRes.json();
      const t = await tRes.json();
      if (w.success) setWallet(w.data);
      if (t.success) setTxs(t.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-4">กระเป๋า Coin</h1>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 mb-4 text-center">
          <p className="text-sm text-white/80">ยอดคงเหลือ</p>
          <p className="text-5xl font-bold text-white">
            {loading ? '...' : wallet?.balance.toLocaleString('th-TH')}
          </p>
          <p className="text-sm text-white/80 mt-1">🪙 Coin</p>
          {!loading && wallet && (
            <div className="flex justify-center gap-4 mt-3 text-xs text-white/80">
              <span>รับรวม {wallet.totalEarned.toLocaleString('th-TH')}</span>
              <span>ใช้รวม {wallet.totalSpent.toLocaleString('th-TH')}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-gray-400 mb-6">
          Coin เป็นสกุลเงินภายในเกม ไม่สามารถโอน แลก หรือถอนเป็นเงินจริงได้
        </p>

        <div className="flex gap-2 mb-4">
          {(['ALL', 'IN', 'OUT'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300'
              }`}
            >
              {f === 'ALL' ? 'ทั้งหมด' : f === 'IN' ? '↓ รับ' : '↑ จ่าย'}
            </button>
          ))}
        </div>

        <h2 className="font-bold mb-2">ประวัติธุรกรรม</h2>
        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : txs.length === 0 ? (
          <p className="text-center text-gray-400 py-8">ยังไม่มีธุรกรรม</p>
        ) : (
          <div className="space-y-2">
            {txs.map((t) => (
              <div key={t.id} className="bg-gray-800 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">{t.description || t.referenceType || t.type}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleString('th-TH')} • ยอด {t.balanceBefore} → {t.balanceAfter}
                  </p>
                </div>
                <p className={`font-bold ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('th-TH')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
