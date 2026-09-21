'use client';

// หน้าตั้งค่า — Phase 12: เสียง (Music/SFX/Ambience + Reduce Intense Effects) ตาม GDD §17
import { useAudio } from '@/components/providers/AudioProvider';
import { useOnboarding } from '@/components/providers/OnboardingProvider';
import Tooltip from '@/components/ui/Tooltip';

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-700">
      <div className="pr-3">
        <p className="text-white text-sm flex items-center">
          {label}
          {hint && <Tooltip text={hint} />}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-gray-600'}`}
      >
        <span
          className={`block h-5 w-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update, play, unlocked } = useAudio();
  const { reset } = useOnboarding();

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">ตั้งค่า</h1>
        <p className="text-center text-gray-400 mb-6">เสียงและการแสดงผล</p>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-2">🔊 เสียง</h2>
          <Toggle
            label="เสียงเอฟเฟกต์ (SFX)"
            hint="เสียงกดปุ่ม เปิดการ์ด ต่อสู้ — ปิดได้ถ้าเล่นในที่เงียบ"
            checked={settings.sfx}
            onChange={(v) => { update({ sfx: v }); if (v) play('ui_tap'); }}
          />
          <Toggle
            label="เพลงประกอบ (Music)"
            hint="เพลงธีมหลัก (ปิดไว้เป็นค่าเริ่มต้นเพื่อประหยัดแบตเตอรี่บนมือถือ)"
            checked={settings.music}
            onChange={(v) => update({ music: v })}
          />
          <Toggle
            label="เสียงบรรยากาศ (Ambience)"
            hint="เสียงบรรยากาศของแต่ละโซน (กำลังเปิดใช้งานแบบทดลอง)"
            checked={settings.ambience}
            onChange={(v) => update({ ambience: v })}
          />
          <Toggle
            label="ลดเอฟเฟกต์รุนแรง"
            hint="สำหรับผู้ที่ไวต่อแสง/เสียง — ลดเสียงซ้อนและความดังลงครึ่งหนึ่ง"
            checked={settings.reduceIntense}
            onChange={(v) => update({ reduceIntense: v })}
          />

          <div className="pt-4">
            <label className="text-sm text-gray-300 block mb-2">
              ระดับเสียง: {Math.round(settings.volume * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
              className="w-full accent-amber-500"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => play('reward_claim')} className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600">
              ทดสอบเสียงรางวัล
            </button>
            <button onClick={() => play('battle_hit')} className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600">
              ทดสอบเสียงต่อสู้
            </button>
          </div>
          {!unlocked && (
            <p className="text-xs text-amber-400 mt-3">
              แตะหน้าจอหนึ่งครั้งเพื่อเปิดระบบเสียง (เบราว์เซอร์บล็อกเสียงอัตโนมัติ)
            </p>
          )}
        </section>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-2">🧭 ช่วยเหลือ</h2>
          <p className="text-sm text-gray-400 mb-3">ดูคำแนะนำการเล่นอีกครั้งได้ตลอดเวลา</p>
          <button onClick={reset} className="btn-primary text-sm">
            เปิดคู่มือเริ่มต้นอีกครั้ง
          </button>
        </section>

        <section className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-2">ℹ️ เกี่ยวกับ</h2>
          <p className="text-sm text-gray-400">
            Rune Dominion Arena · เวอร์ชัน beta<br />
            เหรียญในเกมใช้เล่นเท่านั้น ไม่มีการแลกเป็นเงินจริง
          </p>
        </section>
      </div>
    </main>
  );
}
