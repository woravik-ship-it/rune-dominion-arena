'use client';

// หน้าตั้งค่า — Phase 12 (เสียง) + Phase 20 (เมนูตั้งค่าหลายส่วน: ภาษา/เสียง/การแจ้งเตือน/ช่วยเหลือ)
//
// ผู้ใช้สั่ง 2026-09-26: "ทำตัวเลือกภาษาภายในเกม ทำเป็นเมนูตั้งค่าต่างๆ ภายในเกม"
//  - ภาษา: ไทย/อังกฤษ → มีผลทั้งเมนู ข้อความในเกม และข้อความแจ้งเตือนจากเซิร์ฟเวอร์
//  - การแจ้งเตือน: เลือกได้ว่าจะรับประเภทใด (ภาพการ์ด/ผลต่อสู้/อารีน่า/กิจกรรม/ประกาศ)
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAudio } from '@/components/providers/AudioProvider';
import { useOnboarding } from '@/components/providers/OnboardingProvider';
import { useI18n } from '@/components/providers/LocaleProvider';
import Tooltip from '@/components/ui/Tooltip';
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs } from '@/lib/notification-prefs';

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

/** เมนูลัดไปยังส่วนต่างๆ ของหน้าตั้งค่า (ผู้ใช้ขอ "เมนูตั้งค่าต่างๆ") */
const MENU: { href: string; labelKey: string; icon: string }[] = [
  { href: '#language', labelKey: 'settings.langSection', icon: '🌐' },
  { href: '#sound', labelKey: 'settings.audioSection', icon: '🔊' },
  { href: '#notify', labelKey: 'settings.notifySection', icon: '🔔' },
  { href: '#help', labelKey: 'settings.helpSection', icon: '🧭' },
  { href: '#about', labelKey: 'settings.aboutSection', icon: 'ℹ️' },
];

export default function SettingsPage() {
  const { settings, update, play, unlocked, unlock } = useAudio();
  const { reset } = useOnboarding();
  const { t, locale, setLocale } = useI18n();
  const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>({ ...DEFAULT_NOTIFY_PREFS });
  const [savedFlash, setSavedFlash] = useState('');

  // โหลดค่าการแจ้งเตือนจากบัญชี (เก็บฝั่งเซิร์ฟเวอร์ เพื่อให้การแจ้งเตือนที่สร้างจากเซิร์ฟเวอร์เคารพค่าที่เลือก)
  useEffect(() => {
    fetch('/api/profile/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.data?.notifyPrefs) {
          setNotifyPrefs({ ...DEFAULT_NOTIFY_PREFS, ...data.data.notifyPrefs });
        }
      })
      .catch(() => undefined);
  }, []);

  const flash = useCallback((message: string) => {
    setSavedFlash(message);
    window.setTimeout(() => setSavedFlash(''), 2200);
  }, []);

  const savePrefs = useCallback(
    async (next: NotifyPrefs) => {
      setNotifyPrefs(next);
      try {
        const res = await fetch('/api/profile/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notifyPrefs: next }),
        });
        flash(res.ok ? t('settings.saved') : t('settings.saveFailed'));
      } catch {
        flash(t('settings.saveFailed'));
      }
    },
    [flash, t]
  );


  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">{t('settings.title')}</h1>
        <p className="text-center text-gray-400 mb-4">{t('settings.subtitle')}</p>

        {savedFlash && (
          <p
            data-settings-flash="true"
            className="mb-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-300"
          >
            {savedFlash}
          </p>
        )}

        {/* เมนูลัดของหน้าตั้งค่า (ป้ายมีไอคอนอยู่ในข้อความแล้ว) */}
        <nav data-settings-menu="true" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MENU.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:border-amber-400 hover:text-amber-200"
            >
              <span className="truncate">{t(item.labelKey)}</span>
            </a>
          ))}
        </nav>

        {/* ภาษา */}
        <section id="language" className="bg-gray-800 rounded-xl p-5 mb-4 scroll-mt-16">
          <h2 className="text-lg font-bold text-white mb-1">{t('settings.langSection')}</h2>
          <p className="text-sm text-gray-400 mb-3">{t('settings.langHint')}</p>
          <div className="flex gap-2">
            {(['th', 'en'] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-locale-option={value}
                onClick={() => {
                  setLocale(value);
                  flash(t('settings.langSaved'));
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  locale === value ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                {value === 'th' ? t('settings.langTh') : t('settings.langEn')}
              </button>
            ))}
          </div>
        </section>

        {/* เสียง */}
        <section id="sound" className="bg-gray-800 rounded-xl p-5 mb-4 scroll-mt-16">
          <h2 className="text-lg font-bold text-white mb-2">{t('settings.audioSection')}</h2>
          <Toggle
            label={t('settings.sfx')}
            hint={t('settings.sfxHint')}
            checked={settings.sfx}
            onChange={(v) => { update({ sfx: v }); if (v) play('ui_tap'); }}
          />
          <Toggle
            label={t('settings.music')}
            hint={t('settings.musicHint')}
            checked={settings.music}
            onChange={(v) => update({ music: v })}
          />
          <Toggle
            label={t('settings.ambience')}
            hint={t('settings.ambienceHint')}
            checked={settings.ambience}
            onChange={(v) => update({ ambience: v })}
          />
          <Toggle
            label={t('settings.reduceIntense')}
            hint={t('settings.reduceIntenseHint')}
            checked={settings.reduceIntense}
            onChange={(v) => update({ reduceIntense: v })}
          />

          <div className="pt-4">
            <label className="text-sm text-gray-300 block mb-2">
              {t('settings.volume')}: {Math.round(settings.volume * 100)}%
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => play('reward_claim')} className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600">
              {t('settings.testReward')}
            </button>
            <button onClick={() => play('battle_hit')} className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600">
              {t('settings.testBattle')}
            </button>
            {/* Phase 22: ผู้ใช้ขอฟังเสียงดาบ/ปล่อยสกอลจากในเมนูตั้งค่าได้ด้วย */}
            <button
              onClick={() => play('battle_sword')}
              data-test-sword="true"
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600"
            >
              ⚔️ {t('settings.testSword')}
            </button>
            <button
              onClick={() => play('battle_cast')}
              data-test-cast="true"
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600"
            >
              ✨ {t('settings.testCast')}
            </button>
            <button
              onClick={() => { update({ music: true }); unlock(); }}
              data-test-music="true"
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600"
            >
              {t('settings.testMusic')}
            </button>
            <button
              onClick={() => { update({ ambience: true }); unlock(); }}
              data-test-ambience="true"
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-600"
            >
              {t('settings.testAmbience')}
            </button>
          </div>

          {(settings.music || settings.ambience) && (
            <p data-audio-playing="true" className="mt-3 text-xs text-emerald-300">
              🔊 {t('settings.nowPlaying')}
              {settings.music ? ` · ${t('settings.music')}` : ''}
              {settings.ambience ? ` · ${t('settings.ambience')}` : ''}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">{t('settings.backgroundPause')}</p>
          {!unlocked && <p className="text-xs text-amber-400 mt-3">{t('settings.musicNote')}</p>}
        </section>

        {/* การแจ้งเตือน */}
        <section id="notify" className="bg-gray-800 rounded-xl p-5 mb-4 scroll-mt-16">
          <h2 className="text-lg font-bold text-white mb-1">{t('settings.notifySection')}</h2>
          <p className="text-sm text-gray-400 mb-3">{t('settings.notifyHint')}</p>
          <Toggle
            label={t('settings.notifyImage')}
            hint={t('settings.notifyImageHint')}
            checked={notifyPrefs.image}
            onChange={(v) => void savePrefs({ ...notifyPrefs, image: v })}
          />
          <Toggle
            label={t('settings.notifyBattle')}
            hint={t('settings.notifyBattleHint')}
            checked={notifyPrefs.battle}
            onChange={(v) => void savePrefs({ ...notifyPrefs, battle: v })}
          />
          <Toggle
            label={t('settings.notifyArena')}
            hint={t('settings.notifyArenaHint')}
            checked={notifyPrefs.arena}
            onChange={(v) => void savePrefs({ ...notifyPrefs, arena: v })}
          />
          <Toggle
            label={t('settings.notifyEvent')}
            hint={t('settings.notifyEventHint')}
            checked={notifyPrefs.event}
            onChange={(v) => void savePrefs({ ...notifyPrefs, event: v })}
          />
          <Toggle
            label={t('settings.notifyAnnouncement')}
            hint={t('settings.notifyAnnouncementHint')}
            checked={notifyPrefs.announcement}
            onChange={(v) => void savePrefs({ ...notifyPrefs, announcement: v })}
          />
          <Link href="/notifications" className="btn-secondary mt-4 inline-block text-sm">
            🔔 {t('settings.openCenter')}
          </Link>
        </section>

        {/* ช่วยเหลือ */}
        <section id="help" className="bg-gray-800 rounded-xl p-5 mb-4 scroll-mt-16">
          <h2 className="text-lg font-bold text-white mb-2">{t('settings.helpSection')}</h2>
          <p className="text-sm text-gray-400 mb-3">{t('settings.helpHint')}</p>
          <button onClick={reset} className="btn-primary text-sm">
            {t('settings.replayOnboarding')}
          </button>
        </section>

        {/* เกี่ยวกับ */}
        <section id="about" className="bg-gray-800 rounded-xl p-5 scroll-mt-16">
          <h2 className="text-lg font-bold text-white mb-2">{t('settings.aboutSection')}</h2>
          <p className="text-sm text-gray-400">
            {t('settings.aboutText')}<br />
            {t('settings.aboutDisclaimer')}
          </p>
        </section>
      </div>
    </main>
  );
}

