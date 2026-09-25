'use client';

import { useSmoothNumbers } from '@/components/deck/useSmoothNumbers';
import {
  HEX_AXES,
  axisPercent,
  hexAxisAngle,
  normalizedAxes,
  polarPoint,
  polygonPointsAttr,
  radarPolygon,
  type FormationReport,
} from '@/lib/deck-formation';

interface StatHexagonProps {
  report: FormationReport;
}

const CENTER = { x: 100, y: 100 };
const R = 62;

/**
 * กราฟสถานะแบบ **6 เหลี่ยม** (radar) — 6 แกน: โจมตี · ป้องกัน · พลังชีวิต · ความเร็ว · มานา · พลังสกิล
 * และ **คะแนนรวมอยู่ตรงกลาง** ตามคำสั่งผู้ใช้
 *
 * Graphics เรียลไทม์: รูปเหลี่ยมไม่กระโดดจากค่าเดิมไปค่าใหม่ แต่ไล่ค่า (lerp) ด้วย rAF
 * ทุกครั้งที่การ์ดเข้า/ออก → ผู้ใช้เห็น "พลังทีมเพิ่ม/ลด" ทันทีแบบต่อเนื่อง
 * (ปิดได้ด้วย prefers-reduced-motion — ค่าจะเข้าที่ทันที)
 */
export default function StatHexagon({ report }: StatHexagonProps) {
  const target = normalizedAxes(report.axes);
  const smooth = useSmoothNumbers(target, 560);
  const shape = radarPolygon(smooth, R, CENTER);
  const grid = [1 / 3, 2 / 3, 1];

  const label = HEX_AXES.map((axis) => `${axis.labelTh} ${report.axes[axis.key]}`).join(' · ');
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-200">สถานะทีม (6 เหลี่ยม)</h3>
        <span className="text-xs font-bold" style={{ color: report.grade.color }}>
          เกรด {report.grade.key === 'EMPTY' ? '—' : report.grade.key}
        </span>
      </div>

      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`กราฟสถานะทีม: ${label} · คะแนนรวม ${report.total}`}
        className="w-full"
      >
        <defs>
          <radialGradient id="statHexFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.35" />
          </radialGradient>
          <filter id="statHexGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ตารางอ้างอิง 3 ระดับ + แกนทั้ง 6 */}
        {grid.map((level) => (
          <polygon
            key={level}
            points={polygonPointsAttr(radarPolygon(HEX_AXES.map(() => level), R, CENTER))}
            fill="none"
            stroke="#475569"
            strokeOpacity={level === 1 ? 0.85 : 0.45}
            strokeWidth={level === 1 ? 0.9 : 0.5}
          />
        ))}
        {HEX_AXES.map((axis, i) => {
          const end = polarPoint(hexAxisAngle(i), R, CENTER);
          return (
            <line
              key={axis.key}
              x1={CENTER.x}
              y1={CENTER.y}
              x2={end.x}
              y2={end.y}
              stroke={axis.color}
              strokeOpacity="0.35"
              strokeWidth="0.6"
            />
          );
        })}

        {/* รูปค่าพลังจริง (morph เรียลไทม์) */}
        <polygon
          className="stat-hex__shape"
          data-hex-shape="true"
          points={polygonPointsAttr(shape)}
          fill="url(#statHexFill)"
          stroke="#fbbf24"
          strokeWidth="1.6"
          strokeLinejoin="round"
          filter="url(#statHexGlow)"
        />
        {shape.map((point, i) => (
          <circle key={HEX_AXES[i].key} cx={point.x} cy={point.y} r="2.4" fill={HEX_AXES[i].color} />
        ))}

        {/* ป้ายชื่อแกน + ค่าจริง (%) */}
        {HEX_AXES.map((axis, i) => {
          const at = polarPoint(hexAxisAngle(i), R + 11, CENTER);
          const anchor = at.x > CENTER.x + 4 ? 'start' : at.x < CENTER.x - 4 ? 'end' : 'middle';
          return (
            <g key={`${axis.key}-label`}>
              <text x={at.x} y={at.y - 2} fontSize="9" fill={axis.color} textAnchor={anchor}>
                {axis.short}
              </text>
              <text x={at.x} y={at.y + 8} fontSize="8.5" fill="#e5e7eb" textAnchor={anchor}>
                {report.axes[axis.key]}
                <tspan fill="#94a3b8"> ({Math.round(axisPercent(axis, report.axes[axis.key]) * 100)}%)</tspan>
              </text>
            </g>
          );
        })}

        {/* ตรงกลาง: คะแนนรวม (ตามคำสั่งผู้ใช้) */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r="34"
          fill="#0b1020"
          fillOpacity="0.72"
          stroke="#f59e0b"
          strokeOpacity="0.35"
        />
        <text x={CENTER.x} y={CENTER.y - 12} fontSize="8" fill="#94a3b8" textAnchor="middle">
          คะแนนรวม
        </text>
        <text
          key={`hex-total-${report.total}`}
          x={CENTER.x}
          y={CENTER.y + 8}
          fontSize="21"
          fontWeight="bold"
          fill="#fbbf24"
          textAnchor="middle"
          className="deck-core__pop"
          data-hex-total={report.total}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          {report.total.toLocaleString('th-TH')}
        </text>
        <text x={CENTER.x} y={CENTER.y + 21} fontSize="8" fill={report.grade.color} textAnchor="middle">
          {report.grade.key === 'EMPTY' ? 'ยังไม่มีการ์ด' : `${report.grade.key} · ${report.grade.labelTh}`}
        </text>
        <text x={CENTER.x} y={CENTER.y + 31} fontSize="7.5" fill="#4ade80" textAnchor="middle">
          โบนัสช่อง +{report.bonusScore + report.affinityScore}
        </text>
      </svg>

      {/* ตารางค่าจริงแบบอ่านตัวเลขชัด (ใช้เทียบตอนสลับการ์ดเข้าออก) */}
      <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
        {HEX_AXES.map((axis) => (
          <div key={`legend-${axis.key}`} className="flex items-center justify-between gap-1">
            <dt className="truncate" style={{ color: axis.color }}>
              {axis.labelTh}
            </dt>
            <dd className="font-bold text-gray-200">{report.axes[axis.key]}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[11px] leading-tight text-gray-400">
        สเตตัสพื้นฐาน <span className="font-bold text-gray-200">{report.baseScore.toLocaleString('th-TH')}</span> + โบนัสบทบาท{' '}
        <span className="font-bold text-amber-300">{report.bonusScore.toLocaleString('th-TH')}</span> + ตรงบทบาท{' '}
        <span className="font-bold text-emerald-400">{report.affinityScore.toLocaleString('th-TH')}</span>
      </p>
    </div>
  );
}
