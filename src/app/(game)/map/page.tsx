'use client';

// /map — แผนที่ฟาร์ม Item (ผู้ใช้สั่ง 2026-10-03 · รอบ 2: เลือกจุดอิสระ)
//  - เส้นทางอิสระ: ยืนที่จุดไหน เลือกไปจุดไหนก็ได้ (ยกเว้นจุดที่ยืนอยู่) · Stamina หักตามระยะทางจริง
//  - แผนที่ใหญ่ 5 โซน 15 จุด พร้อมภาพพื้นหลัง AI ของแต่ละโซน (gen ด้วย npm run images:maps)
//  - ต่อสู้ → พาไปดู Replay เต็มที่ /battle/map-run:<runId> (เหมือนดันเจี้ยน) แล้วกลับมาฟาร์มต่อ
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import { itemArtUrl } from '@/lib/item-art';
import { mapArtUrl } from '@/lib/map-art';
import { MAP_HEIGHT, MAP_WIDTH, MAP_ZONES, STAMINA_MAX } from '@/lib/map-zones';

interface MapNodeView {
  id: string;
  zone: string;
  nameTh: string;
  x: number;
  y: number;
  visited: boolean;
  current: boolean;
  cost: number;
  enemyCountHint: string;
  jewelChanceLabel: string;
  drops: { code: string; nameTh: string }[];
}

interface DeckView {
  id: string;
  name: string;
}

interface MapState {
  stamina: number;
  max: number;
  staminaPerEnergy: number;
  energy: number;
  /** nodeId ของจุดที่ยืนอยู่ (null = ยังอยู่จุดเริ่มต้น) */
  current: string | null;
  /** ชื่อจุดที่ยืนอยู่ — Stamina คิดจากจุดนี้ */
  currentNameTh: string | null;
  decks: DeckView[];
  coins: number;
  nodes: MapNodeView[];
}

const ZONE_CHIP: Record<string, string> = {
  EMBERFIELD: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  SUNSCAR: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300',
  FROSTREACH: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  MOONFALL: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  VOIDGATE: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
};

const ZONE_TEXT: Record<string, string> = {
  EMBERFIELD: 'text-amber-300',
  SUNSCAR: 'text-yellow-300',
  FROSTREACH: 'text-sky-300',
  MOONFALL: 'text-emerald-300',
  VOIDGATE: 'text-purple-300',
};

export default function MapPage() {
  const { t } = useI18n();
  const { play } = useAudio();
  const [state, setState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [deckId, setDeckId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [err, setErr] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  /** แผนที่ (โซน) ที่กำลังดู — 5 แผนที่แยกกัน */
  const [activeZone, setActiveZone] = useState<string>('EMBERFIELD');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/map');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? t('common.error'));
        return;
      }
      setErr('');
      const data = json.data as MapState;
      setState(data);
      setDeckId((prev) => (prev && data.decks.some((d) => d.id === prev) ? prev : (data.decks[0]?.id ?? '')));
      // ค่าเริ่มต้น: จุดแรกที่เลือกได้ (ไม่ใช่จุดที่ยืนอยู่)
      setSelectedId((prev) =>
        prev && data.nodes.some((n) => n.id === prev && !n.current)
          ? prev
          : (data.nodes.find((n) => !n.current)?.id ?? '')
      );
      // ค่าเริ่มต้น: แผนที่ที่เลือก = แผนที่ของจุดที่ยืนอยู่ (หรือใบแรก)
      setActiveZone((prev) =>
        data.nodes.some((n) => n.zone === prev)
          ? prev
          : (data.nodes.find((n) => n.id === data.current)?.zone ?? 'EMBERFIELD')
      );
    } catch {
      setErr(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refill = async (points = 1) => {
    setBusy('refill');
    setErr('');
    try {
      const res = await apiFetch('/api/map/refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? 'เติม Stamina ไม่สำเร็จ');
        play('ui_error');
        return;
      }
      play('coin');
      const d = json.data as { stamina: number; energy: number };
      setState((prev) => (prev ? { ...prev, stamina: d.stamina, energy: d.energy } : prev));
    } catch {
      setErr('เติม Stamina ไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  };

  /** เลือกจุดเดินทาง — จุดที่ยืนอยู่เลือกไม่ได้ (ผู้ใช้สั่ง) */
  const selectNode = (node: MapNodeView) => {
    if (node.current) {
      setErr('คุณอยู่ที่จุดนี้แล้ว — เลือกจุดอื่นบนแผนที่เพื่อเดินทาง');
      return;
    }
    setErr('');
    setSelectedId(node.id);
  };

  /** เดินทาง + ต่อสู้ → พาไปหน้าสนามรบ (Replay เต็ม) */
  const farm = async () => {
    if (!selectedId || !deckId || !state) return;
    const target = state.nodes.find((n) => n.id === selectedId);
    if (!target) return;
    setBusy('farm');
    setErr('');
    setRedirecting(false);
    try {
      const res = await apiFetch('/api/map/farm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, nodeId: target.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? 'ฟาร์มไม่สำเร็จ');
        play('ui_error');
        return;
      }
      play('coin');
      setRedirecting(true);
      // ไปดูการต่อสู้เลย (เหมือนดันเจี้ยน) — จบแล้วกลับมา /map เพื่อฟาร์มต่อ
      window.location.href = String(json.data?.battleUrl ?? '/map');
    } catch {
      setErr('ฟาร์มไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4">
        <p className="py-6 text-center text-sm text-gray-500">{t('common.loading')}</p>
      </main>
    );
  }

  const selected = state?.nodes.find((n) => n.id === selectedId) ?? null;
  const standingNode = state?.nodes.find((n) => n.current) ?? null;
  /** เฉพาะจุดของแผนที่ที่เลือก (แยกทีละใบ) */
  const zoneNodes = state?.nodes.filter((n) => n.zone === activeZone) ?? [];
  const bgZone = MAP_ZONES.find((z) => z.id === activeZone) ?? null;

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">🗺️ แผนที่ฟาร์ม</h1>
          <p className="text-sm text-gray-400">
            Stamina 100 · เดินทางไกลยิ่งหักมาก · เลือกจุดไหนก็ได้ (ยกเว้นจุดที่ยืนอยู่) — 5 โซน 15 จุด
          </p>
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        </header>

        {state && (
          <>
            {/* หลอด Stamina + พลังค้นหา + เติม */}
            <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300">⚡ Stamina</span>
                <span className="text-xs text-gray-300" data-map-stamina={state.stamina}>
                  {state.stamina} / {STAMINA_MAX}
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, (state.stamina / STAMINA_MAX) * 100)}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-300">
                  🔮 พลังค้นหา: {state.energy}/5
                </span>
                <button
                  type="button"
                  data-map-refill
                  onClick={() => void refill(1)}
                  disabled={busy === 'refill' || state.energy <= 0 || state.stamina >= STAMINA_MAX}
                  className="rounded-lg bg-sky-600/80 px-2 py-1 font-bold text-white hover:bg-sky-500 disabled:opacity-40"
                >
                  {busy === 'refill' ? 'กำลังเติม...' : `เติม +${state.staminaPerEnergy} (ใช้พลังค้นหา 1)`}
                </button>
                <span className="text-gray-500">📍 จุดที่ยืนอยู่ — ต้องเลือกไปจุดอื่น</span>
              </div>
            </div>

            {/* แท็บเลือกแผนที่ — 5 แผนที่แยกจากกัน แต่ละใบ 15 จุด */}
            <div className="mb-2 grid grid-cols-5 gap-1.5" data-map-tabs>
              {MAP_ZONES.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  data-map-tab={z.id}
                  onClick={() => {
                    setActiveZone(z.id);
                    setErr('');
                  }}
                  className={`rounded-lg border px-1 py-1.5 text-[10px] font-bold transition-all ${
                    activeZone === z.id
                      ? 'border-white bg-amber-500/80 text-black'
                      : `${ZONE_CHIP[z.id] ?? 'border-gray-700 text-gray-300'} hover:brightness-125`
                  }`}
                >
                  <span className="block text-sm leading-none">{z.icon}</span>
                  {z.nameTh}
                </button>
              ))}
            </div>

            {/* แผนที่ที่เลือก (โซนเดียว — 15 จุด) + พื้นหลังโซน (AI gen) */}
            <div
              className="relative mb-3 h-[320px] overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900"
              data-map-canvas
            >
              {bgZone && (
                <img
                  key={bgZone.id}
                  src={mapArtUrl(bgZone.id)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  data-map-bg={bgZone.id}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/45" />

              {zoneNodes.map((node) => {
                const isSelected = node.id === selectedId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-map-node={node.id}
                    data-state={node.current ? 'current' : node.visited ? 'visited' : 'available'}
                    data-cost={node.cost}
                    onClick={() => selectNode(node)}
                    disabled={node.current || busy !== ''}
                    className={`absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow-lg transition-all ${
                      node.current
                        ? 'animate-pulse border-amber-300 bg-amber-500/30 text-amber-100'
                        : isSelected
                          ? 'border-white bg-sky-500/80 text-white ring-2 ring-white'
                          : node.visited
                            ? 'border-emerald-400/70 bg-emerald-600/40 text-emerald-100 hover:bg-emerald-500/50'
                            : 'border-sky-400/70 bg-sky-600/50 text-white hover:bg-sky-500/70'
                    }`}
                    style={{
                      left: `${(node.x / MAP_WIDTH) * 100}%`,
                      top: `${100 - (node.y / MAP_HEIGHT) * 100}%`,
                    }}
                    title={`${node.nameTh} · Stamina ${node.cost} · อัญมณีดรอป ${node.jewelChanceLabel}`}
                  >
                    {node.current ? '📍' : node.visited ? '✓' : '⚔️'}
                  </button>
                );
              })}

              {bgZone && (
                <span
                  className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-gray-200"
                  data-map-zone-badge
                >
                  {bgZone.icon} {bgZone.nameTh}
                </span>
              )}
            </div>

            <p className="mb-4 text-[11px] text-gray-500">
              📍 จุดที่ยืนอยู่ (คิด Stamina จากจุดนี้) · ✓ เคยไปสู้แล้ว · ⚔️ ยังไม่เคยไป — ต่อสู้แล้วพาไปดูการต่อสู้เต็ม
            </p>

            {/* จุดที่เลือก + ฟาร์ม */}
            {selected ? (
              <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-3" data-map-next-node={selected.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-sm font-bold ${ZONE_TEXT[selected.zone] ?? 'text-white'}`}>
                      {selected.visited ? '✓' : '⚔️'} {selected.nameTh}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      เดินทางจาก 📍 <span className="text-amber-200">{standingNode?.nameTh ?? 'จุดเริ่มต้น'}</span> ·{' '}
                      Stamina <span className="font-bold text-emerald-300">{selected.cost}</span> ·{' '}
                      {selected.enemyCountHint} · อัญมณีดรอป {selected.jewelChanceLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.drops.map((d) => (
                    <span
                      key={d.code}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-200"
                    >
                      <img
                        src={itemArtUrl(d.code)}
                        alt=""
                        className="h-5 w-5 rounded border border-gray-700 object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      {d.nameTh}
                    </span>
                  ))}
                </div>

                <label className="mt-2 block text-[11px] text-gray-400">
                  เลือกเด็ค (ต้องครบ 5 ใบ)
                  <select
                    value={deckId}
                    onChange={(e) => setDeckId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                  >
                    {state.decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  data-map-farm
                  onClick={() => void farm()}
                  disabled={busy === 'farm' || !deckId || state.stamina < selected.cost}
                  className="btn-primary mt-3 w-full disabled:opacity-50"
                >
                  {redirecting
                    ? 'กำลังเปิดสนามรบ...'
                    : busy === 'farm'
                      ? 'กำลังเดินทาง...'
                      : `เดินทาง + ต่อสู้ (หมด Stamina ${selected.cost})`}
                </button>
                {state.stamina < selected.cost && !redirecting && (
                  <p className="mt-1 text-[11px] text-red-400">Stamina ไม่พอ — เติมด้วยพลังค้นหาด้านบน</p>
                )}
                {redirecting && (
                  <p className="mt-1 text-[11px] text-emerald-300">เดินทางสำเร็จ — กำลังพาไปดูการต่อสู้...</p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-center text-sm text-gray-400">
                กดเลือกจุดบนแผนที่เพื่อเดินทางและต่อสู้
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}