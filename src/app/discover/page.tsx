'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import RuneCanvas from '@/components/rune/RuneCanvas';
import CardRevealModal from '@/components/cards/CardRevealModal';
import { CardDefinition } from '@/types';
import { useAudio } from '@/components/providers/AudioProvider';
import { revealSfxFor } from '@/lib/sfx';

export default function DiscoverPage() {
  const [selectedRunes, setSelectedRunes] = useState<number[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [revealedCard, setRevealedCard] = useState<CardDefinition | null>(null);
  const [isFirstDiscovery, setIsFirstDiscovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number>(5);
  const [isLoadingEnergy, setIsLoadingEnergy] = useState(true);
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

  const handleSelectionChange = (runes: number[]) => {
    setSelectedRunes(runes);
    setError(null);
    if (runes.length > 0) play('rune_select');
  };

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
      // เสียงเปิดการ์ดตาม rarity (GDD §17)
      play(revealSfxFor(data.card?.rarity ?? 'COMMON'));
      
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
  };

  const handleAddToDeck = () => {
    // TODO: Implement add to deck
    alert('เพิ่มลงทีม (Phase 3 จะทำ)');
    handleCloseReveal();
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
          onClose={handleCloseReveal}
          onAddToDeck={handleAddToDeck}
          onDiscoverAgain={handleDiscoverAgain}
        />
      )}
    </main>
  );
}
