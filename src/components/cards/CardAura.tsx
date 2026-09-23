'use client';

import type { CSSProperties } from 'react';
import {
  AURA_CARD,
  AURA_RADIUS,
  auraClipPaths,
  auraGeometry,
  auraLayers,
  auraSparks,
  auraSpec,
  auraStyle,
  auraUid,
  auraVariation,
  type AuraVariant,
} from '@/lib/card-aura';
import { useAudio } from '@/components/providers/AudioProvider';

interface CardAuraProps {
  /** ระดับความหายาก — เป็นตัวกำหนดความเข้ม/สี/จำนวนประกาย (ดู src/lib/card-aura.ts) */
  rarity?: string | null;
  /** ใช้สร้างความต่างของแสงต่อการ์ดแต่ละใบ (ปกติส่ง cardId) */
  seed?: string;
  /** ดีไซน์แสง (ค่าตั้งต้น = `tier` บันไดตามระดับ) */
  variant?: AuraVariant;
}

const { frame, art } = AURA_CARD;
/** จุดศูนย์กลาง "ไอเทม" = กลางช่องภาพ (24+372/2, 106+222/2) */
const CENTER_X = art.x + art.w / 2;
const CENTER_Y = art.y + art.h / 2;

/**
 * ชั้น "แสงเรืองแบบไอเทมตีบวก" (MU Online style) — SVG glow ล้วน ไม่มีการเจนภาพ
 *
 * ทำไมใช้ SVG (ไม่ใช่ CSS box-shadow แบบที่เคยลองแล้วไม่ผ่าน):
 *   - `feGaussianBlur` ใช้หน่วย user unit → **สเกลตามขนาดการ์ดทุกขนาด** (80px–330px) ไม่แตก
 *   - แสง "เกาะรูปทรงการ์ด" (rounded rect) เหมือนแสงเกาะไอเทมจริง ไม่เป็นกรอบสี่เหลี่ยมแข็ง
 *   - ควบคุมความนุ่ม/ความกว้าง/ทิศทางแสงได้จริง (box-shadow ทำไม่ได้)
 *
 * องค์ประกอบ (เปิด/ปิดตามระดับ + ดีไซน์):
 *   halo   — วงแสงนุ่มด้านนอก (ตัดให้อยู่นอกการ์ด) + แกนแสงติดขอบ (คม) + เรืองรอบช่องภาพ
 *   flare  — ประกายดาว 4 แฉกกลางช่องภาพ (หมุนช้าๆ + หายใจ) = "ประกายไอเทม"
 *   pillar — เสาแสงแนวตั้ง (อยู่หลังการ์ด) + ลำแสงไหลขึ้นผ่านตัวการ์ด
 *   sparks — ประกายลอยขึ้น (ตำแหน่ง/จังหวะ deterministic ต่อใบ)
 *
 * ⚠️ `pointer-events: none` + `aria-hidden` เสมอ (ไม่กินคลิก ไม่รบกวน screen reader)
 * ⚠️ ดีไซน์ `inner` ตัดแสงให้อยู่ในกรอบการ์ด → ใช้ได้ในกล่องที่มี `overflow-hidden`
 *    ส่วนดีไซน์อื่นต้องมีที่ให้แสงล้น 12% รอบการ์ด (กล่องแม่ห้าม overflow-hidden)
 * ⚠️ ต้องอยู่ในกล่องที่ `position: relative` + มีสัดส่วนการ์ด (เหมือน CardFace)
 */
export default function CardAura({ rarity, seed = '', variant = 'tier' }: CardAuraProps) {
  // ผู้ใช้ที่เปิด "ลดเอฟเฟกต์รุนแรง" ในหน้าตั้งค่า → ลดความเข้มลงครึ่ง
  const { settings } = useAudio();
  const reduceIntense = settings.reduceIntense;

  const spec = auraSpec(rarity);
  const layers = auraLayers(variant, rarity);
  if (!layers.halo && !layers.flare && !layers.pillar && !layers.sparks) return null;

  const uid = auraUid(seed);
  const geo = auraGeometry(layers.clip);
  const clips = auraClipPaths(layers.clip);
  const style = {
    inset: geo.inset,
    ...(layers.clip ? { borderRadius: AURA_RADIUS } : {}),
    ...auraStyle(rarity, seed, { reduceIntense }),
  } as unknown as CSSProperties;

  const sparks = layers.sparks ? auraSparks(seed, spec.sparkCount, spec.sparkSec) : [];
  const { tiltDeg } = auraVariation(seed);

  return (
    <div
      aria-hidden
      className={`card-aura card-aura--${variant}${layers.clip ? ' card-aura--clip' : ''}`}
      style={style}
    >
      <svg
        className="card-aura__svg"
        viewBox={geo.viewBox}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* แกนแสง: สว่างด้านบน → สีระดับ → สว่างด้านล่าง (ให้แสงมีทิศทาง ไม่แบน) */}
          <linearGradient id={`${uid}-core`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={spec.core} />
            <stop offset="45%" stopColor={spec.edge} />
            <stop offset="100%" stopColor={spec.core} />
          </linearGradient>
          {/* วงแสงนอก */}
          <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={spec.core} />
            <stop offset="40%" stopColor={spec.edge} />
            <stop offset="100%" stopColor={spec.core} />
          </linearGradient>
          {/* ประกายกลางของดาว (จางจากกลางออกไป) */}
          <radialGradient id={`${uid}-wash`} cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor={spec.core} stopOpacity="0.5" />
            <stop offset="55%" stopColor={spec.edge} stopOpacity="0.22" />
            <stop offset="100%" stopColor={spec.edge} stopOpacity="0" />
          </radialGradient>
          {/* เสาแสงแนวตั้ง: จางหัว-ท้าย */}
          <linearGradient id={`${uid}-beam`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={spec.edge} stopOpacity="0" />
            <stop offset="45%" stopColor={spec.core} stopOpacity="0.75" />
            <stop offset="100%" stopColor={spec.edge} stopOpacity="0" />
          </linearGradient>
          {/* เสาแสง (คอลัมน์) — ใช้ radial → ขอบซ้าย/ขวานุ่ม ไม่เป็นแท่งสี่เหลี่ยม */}
          <radialGradient id={`${uid}-column`} cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor={spec.core} stopOpacity="0.6" />
            <stop offset="55%" stopColor={spec.edge} stopOpacity="0.3" />
            <stop offset="100%" stopColor={spec.edge} stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-bloom`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${uid}-soft`} x="-80%" y="-70%" width="260%" height="240%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <filter id={`${uid}-wide`} x="-110%" y="-90%" width="320%" height="280%">
            <feGaussianBlur stdDeviation="30" />
          </filter>
          {/* ตัดแสงให้อยู่ "นอกการ์ด" → แสงเรืองล้อมการ์ดโดยไม่ฟุ้งทับตัวภาพ (การ์ดคม) */}
          <clipPath id={`${uid}-outside`} clipPathUnits="userSpaceOnUse">
            <path d={clips.outsideCard} clipRule="evenodd" />
          </clipPath>
          {/* ตัดแสงให้อยู่ "นอกช่องภาพ" → ขอบช่องภาพเรือง แต่ตัวภาพคม */}
          <clipPath id={`${uid}-art-outside`} clipPathUnits="userSpaceOnUse">
            <path d={clips.outsideArt} clipRule="evenodd" />
          </clipPath>
        </defs>

        {/* 1) แสงเรืองเกาะขอบการ์ด — วงนุ่มด้านนอก + แกนแสงติดขอบ + เรืองรอบช่องภาพ */}
        {layers.halo && (
          <g className="card-aura__halo">
            {/* วงแสงนุ่มกว้าง — ตัดให้อยู่ "นอกการ์ด" → แสงล้อมการ์ดโดยไม่ฟุ้งทับตัวภาพ */}
            <g clipPath={`url(#${uid}-outside)`}>
              <rect
                className="card-aura__halo-wide"
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                rx={frame.r}
                fill="none"
                stroke={`url(#${uid}-edge)`}
                strokeWidth="30"
                filter={`url(#${uid}-wide)`}
              />
            </g>
            {/* แกนแสงติดขอบ (คม) — ล้นเข้าในเล็กน้อยให้ขอบดูเป็นโลหะเรืองแสง */}
            <rect
              className="card-aura__halo-core"
              x={frame.x}
              y={frame.y}
              width={frame.w}
              height={frame.h}
              rx={frame.r}
              fill="none"
              stroke={`url(#${uid}-core)`}
              strokeWidth="6"
              filter={`url(#${uid}-bloom)`}
            />
            {/* เรืองรอบช่องภาพ — ตัดให้อยู่นอกช่องภาพ → ตัวภาพคมชัด ไม่มีฝ้า */}
            <g clipPath={`url(#${uid}-art-outside)`}>
              <rect
                className="card-aura__art-rim"
                x={art.x}
                y={art.y}
                width={art.w}
                height={art.h}
                rx={art.r}
                fill="none"
                stroke={`url(#${uid}-core)`}
                strokeWidth="6"
                filter={`url(#${uid}-bloom)`}
              />
            </g>
          </g>
        )}

        {/* 2) ประกายดาว 4 แฉกกลางช่องภาพ (หมุนช้าๆ + หายใจ) */}
        {layers.flare && (
          <g className="card-aura__flare" transform={`translate(${CENTER_X} ${CENTER_Y}) rotate(${tiltDeg})`}>
            <g className="card-aura__flare-spin">
              <path
                className="card-aura__flare-arm"
                d="M0,-124 L11,0 L0,124 L-11,0 Z"
                fill={spec.core}
                filter={`url(#${uid}-bloom)`}
              />
              <path
                className="card-aura__flare-arm card-aura__flare-arm--side"
                d="M-158,0 L0,-9 L158,0 L0,9 Z"
                fill={spec.core}
                filter={`url(#${uid}-bloom)`}
              />
              <circle className="card-aura__flare-core" r="22" fill={`url(#${uid}-wash)`} filter={`url(#${uid}-bloom)`} />
              <circle className="card-aura__flare-dot" r="6" fill="#ffffff" />
            </g>
          </g>
        )}

        {/* 3) เสาแสงแนวตั้ง (อยู่ "หลัง" การ์ด) + ลำแสงไหลขึ้นผ่านตัวการ์ด */}
        {layers.pillar && (
          <g className="card-aura__pillar">
            {/* ตัดให้อยู่ "นอกการ์ด" → ดูเป็นเสาแสงอยู่หลังการ์ด ไม่ทับตัวภาพ */}
            <g clipPath={`url(#${uid}-outside)`}>
              <rect
                className="card-aura__pillar-column"
                x={CENTER_X - 62}
                y={-72}
                width={124}
                height={744}
                fill={`url(#${uid}-column)`}
                filter={`url(#${uid}-soft)`}
              />
            </g>
            <rect
              className="card-aura__pillar-flow"
              x={CENTER_X - 30}
              y={330}
              width={60}
              height={210}
              fill={`url(#${uid}-beam)`}
              filter={`url(#${uid}-soft)`}
            />
          </g>
        )}

        {/* 4) ประกายลอยขึ้น (ตำแหน่ง/จังหวะต่างกันทุกใบ) */}
        {layers.sparks && (
          <g className="card-aura__sparks">
            {sparks.map((s, i) => (
              <circle
                key={i}
                className="card-aura__spark"
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill={spec.core}
                filter={`url(#${uid}-bloom)`}
                style={{ animationDelay: `-${s.delaySec}s`, animationDuration: `${s.durSec}s` }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
