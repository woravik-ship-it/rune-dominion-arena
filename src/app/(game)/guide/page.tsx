'use client';

/**
 * คู่มือผู้เล่นใหม่ (Phase 45.7)
 *
 * ผู้ใช้สั่ง 2026-10-08: *"ช่วยทำ Game guide สำหรับผู้เล่นใหม่ เอาไว้กดดูได้จากเมนูในหน้าแรก"*
 *
 * หลักการออกแบบ
 *  - เป็นหน้าในเกม (มีหัวเว็บ/แถบล่างครบ) เข้าจากเมนู 📖 ที่การ์ดหน้าแรกและปุ่ม ☰ เพิ่มเติม
 *  - เนื้อหาสั้น ใช้ได้จริง: 3 ขั้นแรก → ระบบหลัก → แผน 7 วันแรก (กดทำเครื่องหมายได้) → คำถามบ่อย
 *  - ข้อความทุกบรรทัดมาจากพจนานุกรม i18n (คีย์อยู่ใน src/lib/guide.ts ⇒ มีเทสต์ตรวจว่ามีครบทั้ง 2 ภาษา)
 *  - เครื่องหมาย "ทำแล้ว" ของแผน 7 วัน เก็บใน localStorage (ผูกกับเบราว์เซอร์ ไม่ต้องมี API)
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';
import {
  GUIDE_FAQ,
  GUIDE_FULL_MANUAL_URL,
  GUIDE_PLAN,
  GUIDE_SECTIONS,
} from '@/lib/guide';

/** คีย์เก็บเครื่องหมายของแผน 7 วัน (localStorage) */
const PLAN_STORAGE_KEY = 'rda_guide_plan_done_v1';

export default function GuidePage() {
  const { t } = useI18n();
  const [done, setDone] = useState<number[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // อ่านเครื่องหมายที่เคยติ๊กไว้ (อ่านหลัง mount เท่านั้น — กัน hydration mismatch)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) setDone(parsed.filter((v): v is number => typeof v === 'number'));
    } catch {
      setDone([]);
    }
  }, []);

  const toggleStep = useCallback((index: number) => {
    setDone((prev) => {
      const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      try {
        window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* โหมดส่วนตัว/ปิด localStorage — ติ๊กได้แต่ไม่จำ */
      }
      return next;
    });
  }, []);

  const doneCount = done.length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24" data-guide-page>
      {/* หัวเรื่อง */}
      <header className="mb-4" data-guide-header>
        <h1 className="text-2xl font-bold text-amber-300 sm:text-3xl">📖 {t('guide.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-300 sm:text-base">{t('guide.subtitle')}</p>
      </header>

      {/* คำแนะนำสั้น ๆ ว่าอ่านอะไรก่อน */}
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3" data-guide-tip>
        <p className="text-sm font-bold text-amber-200">{t('guide.tipTitle')}</p>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/90">{t('guide.tipBody')}</p>
      </div>

      {/* สารบัญแบบชิป (กดแล้วเลื่อนไปหัวข้อ) */}
      <nav className="mb-6" aria-label={t('guide.toc')}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('guide.toc')}</p>
        <div className="flex flex-wrap gap-2">
          {GUIDE_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-guide-toc={section.id}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200 transition-colors hover:border-amber-400/50 hover:text-amber-200"
            >
              {section.icon} {t(section.titleKey)}
            </a>
          ))}
          <a
            href="#plan"
            data-guide-toc="plan"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200 transition-colors hover:border-amber-400/50 hover:text-amber-200"
          >
            📅 {t('guide.planTitle')}
          </a>
          <a
            href="#faq"
            data-guide-toc="faq"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200 transition-colors hover:border-amber-400/50 hover:text-amber-200"
          >
            ❓ {t('guide.faqTitle')}
          </a>
        </div>
      </nav>

      {/* หัวข้อหลัก */}
      <div className="space-y-4">
        {GUIDE_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            data-guide-section={section.id}
            className="scroll-mt-20 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <h2 className="text-lg font-bold text-gray-100">
              {section.icon} {t(section.titleKey)}
            </h2>
            <ul className="mt-3 space-y-2">
              {section.bullets.map((key) => (
                <li key={key} className="flex gap-2 text-sm leading-relaxed text-gray-300">
                  <span className="mt-[2px] shrink-0 text-amber-400/70">•</span>
                  <span data-guide-bullet={key}>{t(key)}</span>
                </li>
              ))}
            </ul>
            {section.links && section.links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-guide-link={link.href}
                    className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/25"
                  >
                    {t(link.labelKey)} →
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}

        {/* แผน 7 วันแรก */}
        <section
          id="plan"
          data-guide-section="plan"
          className="scroll-mt-20 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4"
        >
          <h2 className="text-lg font-bold text-emerald-200">📅 {t('guide.planTitle')}
            <span className="ml-2 text-sm font-normal text-emerald-100/70" data-guide-plan-progress>
              {doneCount}/{GUIDE_PLAN.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-emerald-100/70">{t('guide.planHint')}</p>
          <ul className="mt-3 space-y-2">
            {GUIDE_PLAN.map((step, index) => {
              const checked = done.includes(index);
              return (
                <li key={step.labelKey} className="flex items-start gap-3" data-guide-plan-item={index}>
                  <button
                    type="button"
                    onClick={() => toggleStep(index)}
                    aria-pressed={checked}
                    aria-label={t(step.labelKey)}
                    className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold transition-colors ${
                      checked
                        ? 'border-emerald-400 bg-emerald-500 text-black'
                        : 'border-white/30 bg-transparent text-transparent hover:border-emerald-300'
                    }`}
                  >
                    ✓
                  </button>
                  <span className={checked ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-200'}>
                    <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-300">{t(step.dayKey)}</span>
                    {t(step.labelKey)}
                    <Link href={step.href} className="ml-2 text-xs text-amber-300 underline decoration-dotted">
                      ไป →
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* คำถามที่พบบ่อย */}
        <section
          id="faq"
          data-guide-section="faq"
          className="scroll-mt-20 rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <h2 className="text-lg font-bold text-gray-100">❓ {t('guide.faqTitle')}</h2>
          <div className="mt-3 space-y-2">
            {GUIDE_FAQ.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.qKey} className="rounded-xl border border-white/10 bg-black/20" data-guide-faq={index}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : index)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-100"
                  >
                    <span>{t(faq.qKey)}</span>
                    <span className="text-gray-400">{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <p className="border-t border-white/10 px-3 py-2 text-sm leading-relaxed text-gray-300">
                      {t(faq.aKey)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* คู่มือฉบับเต็ม + กลับหน้าแรก */}
        <section data-guide-section="full" className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-bold text-gray-100">📚 {t('guide.fullTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">{t('guide.fullDesc')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={GUIDE_FULL_MANUAL_URL}
              target="_blank"
              rel="noreferrer"
              data-guide-full-link
              className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25"
            >
              {t('guide.fullLink')} ↗
            </a>
            <Link
              href="/"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/10"
            >
              {t('guide.backHome')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
