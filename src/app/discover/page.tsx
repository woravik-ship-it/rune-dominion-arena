'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RuneCanvas from '@/components/rune/RuneCanvas';
import CardRevealModal from '@/components/cards/CardRevealModal';
import { CardDefinition } from '@/types';
import { useAudio } from '@/components/providers/AudioProvider';
import { revealSfxFor } from '@/lib/sfx';

export default function DiscoverPage() {
  const router = useRouter();
  const [selectedRunes, setSelectedRunes] = useState<number[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [revealedCard, setRevealedCard] = useState<CardDefinition | null>(null);
  const [isFirstDiscovery, setIsFirstDiscovery] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [ownedQuantity, setOwnedQuantity] = useState(1);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number>(5);
  const [isLoadingEnergy, setIsLoadingEnergy] = useState(true);
  const [isAddingToDeck, setIsAddingToDeck] = useState(false);
  const [deckMessage, setDeckMessage] = useState<string | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const { play } = useAudio();

  // Load energy on mount
  useEffect(() => {
    loadEnergy();
  }, []);

  const loadEnergy = async () => {
    try {
      setIsLoadingEnergy(true);
      const response = await apiFetch('/api/energy');
      const data = await response.json();
      
      if (data.success) {
        setEnergy(data.energy.remaining);
      }
    } catch (err) {
      console.error('Failed to load energy:', err);
    } finally {
      setIsLoadingEnergy(false);
    }
  };

  const handleSelectionChange = useCallback((runes: number[]) => {
    setSelectedRunes(runes);
    setError(null);
    if (runes.length > 0) play('rune_select');
  }, [play]);

  const handleDiscover = async () => {
    if (selectedRunes.length < 8) {
      setError('ต้องเลือกรูนอย่างน้อย 8 ตำแหน่ง');
      play('ui_error');
      return;
    }

    if (energy <= 0) {
      setError('พลังค้นหาไม่เพียงพอ');
      play('ui_error');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    play('rune_discover');

    try {
      const response = await apiFetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runes: selectedRunes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Discovery failed');
      }

      setRevealedCard(data.card);
      setIsFirstDiscovery(data.discovery.isFirstDiscovery);
      // ใบซ้ำ: นับเป็นอีกใบ (x2, x3, ...)
      setIsDuplicate(Boolean(data.discovery.isDuplicate));
      setOwnedQuantity(data.owned?.quantity ?? 1);
      // เสียงเปิดการ์ดตาม rarity (GDD §17)
      play(revealSfxFor(data.card?.rarity ?? 'COMMON'));

      // ล้างรูนที่เลือกไว้หลังถอดรหัสสำเร็จ (ไม่ให้ชุดเดิมค้างบนกระดาน)
      setSelectedRunes([]);
      setResetSignal((n) => n + 1);

      // Update energy from response
      if (data.energy) {
        setEnergy(data.energy.remaining);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      play('ui_error');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleCloseReveal = () => {
    setRevealedCard(null);
    setSelectedRunes([]);
    setDeckMessage(null);
    setDeckError(null);
  };

  /** "เพิ่มลงทีม" — ทำงานจริง: เติมเข้าทีมเดิม หรือสร้างทีมใหม่ให้ แล้วพาไปหน้าจัดทีม */
  const handleAddToDeck = async () => {
    if (!revealedCard) return;
    setIsAddingToDeck(true);
    setDeckError(null);
    setDeckMessage(null);
    try {
      const res = await apiFetch('/api/decks/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: revealedCard.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeckError(data.error || 'เพิ่มลงทีมไม่สำเร็จ');
        play('ui_error');
        return;
      }
      setDeckMessage(data.data.message ?? 'เพิ่มลงทีมแล้ว');
      router.push(`/decks/${data.data.deckId}`);
    } catch (err) {
      setDeckError(err instanceof Error ? err.message : 'เพิ่มลงทีมไม่สำเร็จ');
      play('ui_error');
    } finally {
      setIsAddingToDeck(false);
    }
  };

  const handleDiscoverAgain = () => {
    handleCloseReveal();
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">
          ค้นหารูน
        </h1>
        <p className="text-center text-gray-400 mb-6">
          เลือกรูน 8-16 ตำแหน่งเพื่อเริ่มถอดรหัส
        </p>

        {/* Energy Display */}
        <div className="flex justify-center mb-6">
          <div className="bg-gray-800 rounded-lg px-4 py-2 flex items-center gap-2">
            <span className="text-amber-400">⚡</span>
            <span className="text-sm text-gray-300">พลังค้นหา:</span>
            <span className="text-lg font-bold text-amber-400">
              {isLoadingEnergy ? '...' : energy}
            </span>
            <span className="text-sm text-gray-500">/ 5</span>
          </div>
        </div>

        {/* Rune Canvas */}
        <div className="mb-6">
          <RuneCanvas
            onSelectionChange={handleSelectionChange}
            minRunes={8}
            maxRunes={16}
            resetSignal={resetSignal}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-center mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Discover Button */}
        <div className="text-center">
          <button
            onClick={handleDiscover}
            disabled={selectedRunes.length < 8 || isDiscovering || energy <= 0}
            className="btn-primary text-lg px-8"
          >
            {isDiscovering ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                กำลังอ่านบันทึกแห่งรูน...
              </span>
            ) : (
              'ถอดรหัสรูน'
            )}
          </button>
        </div>

        {/* Discovery Tips */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>💡 เคล็ดลับ: ลำดับรูนเดียวกันจะได้การ์ดเดียวกันเสมอ</p>
        </div>
      </div>

      {/* Card Reveal Modal */}
      {revealedCard && (
        <CardRevealModal
          card={revealedCard}
          isFirstDiscovery={isFirstDiscovery}
          isDuplicate={isDuplicate}
          ownedQuantity={ownedQuantity}
          addPending={isAddingToDeck}
          addMessage={deckMessage}
          addError={deckError}
          onClose={handleCloseReveal}
          onAddToDeck={handleAddToDeck}
          onDiscoverAgain={handleDiscoverAgain}
        />
      )}
    </main>
  );
}
