'use client';

// AvatarEditor — เลือกอิโมจิ หรือวาดอวตารเอง 6×6 (Phase 26)
//
// ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
//  - แท็บ 1 "อิโมจิ": เลือกจากรายการที่เกมมี (บันทึกทันที)
//  - แท็บ 2 "วาดเอง": ช่อง 6×6 กดระบายสีทีละช่อง (เลือกสี/ยางลบ/ล้างทั้งหมด) แล้วกดบันทึก
//  - มีตัวอย่างขนาดจริงให้เห็นก่อนบันทึก + ล้างอวตารกลับเป็นค่าเริ่มต้นได้
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import {
  AVATAR_EMOJIS,
  AVATAR_EMPTY_CELL,
  AVATAR_GRID_CELLS,
  AVATAR_GRID_SIZE,
  AVATAR_PALETTE,
  avatarKind,
  gridRows,
  paintedCells,
  sanitizeAvatarGrid,
} from '@/lib/avatar';
import { emitAvatarChanged } from '@/lib/avatar-events';
import AvatarView from '@/components/profile/AvatarView';

type Tab = 'emoji' | 'draw';

export default function AvatarEditor({
  initialEmoji,
  initialGrid,
  onSaved,
}: {
  initialEmoji?: string | null;
  initialGrid?: string | null;
  onSaved?: (avatar: { avatarEmoji: string | null; avatarGrid: string | null }) => void;
}) {
  const { t } = useI18n();
  const { play } = useAudio();
  const [tab, setTab] = useState<Tab>('emoji');
  const [emoji, setEmoji] = useState<string | null>(initialEmoji ?? null);
  const [grid, setGrid] = useState<string>(sanitizeAvatarGrid(initialGrid ?? ''));
  const [brush, setBrush] = useState<string>(AVATAR_PALETTE[0].key);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setEmoji(initialEmoji ?? null);
    setGrid(sanitizeAvatarGrid(initialGrid ?? ''));
  }, [initialEmoji, initialGrid]);

  const save = async (payload: { emoji?: string | null; grid?: string | null; clear?: boolean }) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      play('reward_claim');
      setMessage(json.data?.message ?? t('profile.saved'));
      setEmoji(json.data?.avatarEmoji ?? null);
      setGrid(sanitizeAvatarGrid(json.data?.avatarGrid ?? ''));
      emitAvatarChanged({ emoji: json.data?.avatarEmoji ?? null, grid: json.data?.avatarGrid ?? null });
      onSaved?.({ avatarEmoji: json.data?.avatarEmoji ?? null, avatarGrid: json.data?.avatarGrid ?? null });
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const paint = (index: number) => {
    setGrid((prev) => {
      const chars = prev.padEnd(AVATAR_GRID_CELLS, AVATAR_EMPTY_CELL).split('');
      chars[index] = brush;
      return chars.join('');
    });
  };

  const previewGrid = tab === 'draw' ? grid : '';
  const previewEmoji = tab === 'emoji' ? emoji : null;
  const painted = paintedCells(previewGrid);

  return (
    <section data-avatar-editor="true" className="rounded-xl border border-white/10 bg-gray-800/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-200">✨ {t('profile.avatarTitle')}</h2>
        <div className="flex items-center gap-2">
          <AvatarView emoji={previewEmoji} grid={previewGrid} size={40} />
          <span className="text-[11px] text-gray-500">
            {tab === 'draw' ? t('profile.avatarPainted', { n: painted }) : ''}
          </span>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {(['emoji', 'draw'] as const).map((key) => (
          <button
            key={key}
            type="button"
            data-avatar-tab={key}
            onClick={() => { setTab(key); play('ui_tap'); }}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              tab === key ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            {key === 'emoji' ? `😀 ${t('profile.avatarEmojiTab')}` : `🎨 ${t('profile.avatarDrawTab')}`}
          </button>
        ))}
      </div>

      {tab === 'emoji' && (
        <div data-avatar-emoji-picker className="grid grid-cols-8 gap-1.5">
          {AVATAR_EMOJIS.map((value) => (
            <button
              key={value}
              type="button"
              data-avatar-emoji-option={value}
              disabled={busy}
              onClick={() => { setEmoji(value); void save({ emoji: value }); }}
              className={`rounded-lg border p-1 text-xl leading-none transition-colors ${
                emoji === value ? 'border-amber-400 bg-amber-500/20' : 'border-gray-700 bg-gray-900 hover:bg-gray-800'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {tab === 'draw' && (
        <div data-avatar-canvas>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {AVATAR_PALETTE.map((entry) => (
              <button
                key={entry.key}
                type="button"
                data-avatar-color={entry.key}
                title={entry.nameTh}
                onClick={() => setBrush(entry.key)}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  brush === entry.key ? 'scale-110 border-white' : 'border-gray-600'
                }`}
                style={{ backgroundColor: entry.color }}
              />
            ))}
            <button
              type="button"
              data-avatar-color={AVATAR_EMPTY_CELL}
              title={t('profile.avatarEraser')}
              onClick={() => setBrush(AVATAR_EMPTY_CELL)}
              className={`rounded-lg border px-2 py-1 text-[11px] ${
                brush === AVATAR_EMPTY_CELL ? 'border-white text-white' : 'border-gray-600 text-gray-300'
              }`}
            >
              🧽 {t('profile.avatarEraser')}
            </button>
          </div>

          <div
            className="mb-3 inline-grid gap-[2px] rounded-lg bg-gray-900 p-1"
            style={{
              gridTemplateColumns: `repeat(${AVATAR_GRID_SIZE}, 24px)`,
              gridTemplateRows: `repeat(${AVATAR_GRID_SIZE}, 24px)`,
            }}
          >
            {gridRows(grid).join('').split('').map((char, index) => (
              <button
                key={index}
                type="button"
                data-avatar-cell-paint={index}
                data-avatar-cell-value={char}
                onClick={() => paint(index)}
                className="rounded-[3px] border border-gray-700/70"
                style={{
                  backgroundColor:
                    char === AVATAR_EMPTY_CELL
                      ? 'rgba(31,41,55,0.9)'
                      : AVATAR_PALETTE.find((entry) => entry.key === char)?.color ?? 'transparent',
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-avatar-save
              disabled={busy}
              onClick={() => save({ grid })}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              💾 {t('profile.avatarSave')}
            </button>
            <button
              type="button"
              data-avatar-clear-paint
              onClick={() => setGrid(AVATAR_EMPTY_CELL.repeat(AVATAR_GRID_CELLS))}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-100 hover:bg-white/20"
            >
              🧼 {t('profile.avatarClearPaint')}
            </button>
            <button
              type="button"
              data-avatar-reset
              disabled={busy}
              onClick={() => {
                setEmoji(null);
                setGrid(AVATAR_EMPTY_CELL.repeat(AVATAR_GRID_CELLS));
                void save({ clear: true });
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/20"
            >
              ♻️ {t('profile.avatarReset')}
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}
