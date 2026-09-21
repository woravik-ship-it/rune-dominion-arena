'use client';

// Onboarding flow สำหรับผู้เล่นใหม่ — Phase 12 (4 ขั้น, ภาษาไทย, mobile-first)
import { useState } from 'react';
import Link from 'next/link';
import { useAudio } from '@/components/providers/AudioProvider';

interface Step {
  icon: string;
  title: string;
  description: string;
  cta?: { href: string; label: string };
}

const STEPS: Step[] = [
  {
    icon: '🔮',
    title: 'ยินดีต้อนรับสู่ Rune Dominion Arena',
    description: 'เกมการ์ดแฟนตาซีที่คุณค้นพบการ์ดด้วยการเลือกลำดับรูน — ลำดับเดิมได้การ์ดใบเดิมเสมอ',
  },
  {
    icon: '✋',
    title: 'ค้นพบการ์ดด้วยรูน',
    description: 'แตะรูน 8–16 ตำแหน่งบนกระดาน 100×100 แล้วกด "ถอดรหัสรูน" คุณมีพลังค้นหา 5 ครั้ง/วัน',
    cta: { href: '/discover', label: 'ไปค้นหารูน' },
  },
  {
    icon: '🃏',
    title: 'จัดทีม 5 ใบ',
    description: 'การ์ดที่ได้จะเข้าคอลเลกชัน จัดทีม 5 ใบเพื่อต่อสู้ — ทีมที่มี 4 ธาตุขึ้นไปได้โบนัสพิเศษ',
    cta: { href: '/decks', label: 'จัดทีม' },
  },
  {
    icon: '⚔️',
    title: 'ต่อสู้และเก็บรางวัล',
    description: 'สู้กับบอทใน /battle เข้าห้อง Arena 24 ชม. หรือลุย Boss Raid ในกิจกรรมเพื่อรับรางวัลพิเศษ',
    cta: { href: '/events', label: 'ดูกิจกรรม' },
  },
];

export default function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const { play } = useAudio();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    play('ui_tap');
    if (isLast) {
      onClose();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-700 rounded-2xl max-w-md w-full p-6">
        <div className="flex justify-end">
          <button onClick={onClose} className="text-gray-500 hover:text-white text-sm" aria-label="ปิด">
            ข้าม ✕
          </button>
        </div>

        <div className="text-center">
          <p className="text-5xl mb-4">{current.icon}</p>
          <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
          <p className="text-sm text-gray-300 mb-6">{current.description}</p>
        </div>

        {/* dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-amber-400' : 'w-2 bg-gray-600'}`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => { play('ui_back'); setStep((s) => s - 1); }}
              className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600"
            >
              ย้อนกลับ
            </button>
          )}
          {current.cta && (
            <Link
              href={current.cta.href}
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 text-center flex-1"
            >
              {current.cta.label}
            </Link>
          )}
          <button onClick={next} className="btn-primary flex-1">
            {isLast ? 'เริ่มเล่นเลย!' : 'ต่อไป'}
          </button>
        </div>
      </div>
    </div>
  );
}
