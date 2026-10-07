'use client';

// หน้าจัดการกิจกรรม (Events) — Phase 44 (ผู้ใช้สั่ง 2026-10-07)
// ตารางรายการ + ฟอร์มสร้าง/แก้ + ปุ่มเปิด-ปิด + ปุ่มลบ (ยืนยัน)
// สไตล์เดียวกับ src/app/admin/quests/page.tsx · ข้อความทั้งหมดผ่าน i18n (t) ตามข้อกำหนดโปรเจกต์
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';

interface AdminEvent {
  id: string;
  name: string;
  nameTh: string;
  description: string | null;
  descriptionTh: string | null;
  eventType: string;
  status: string;
  startDate: string;
  endDate: string;
  gracePeriodEnd: string | null;
  currencyName: string;
  maxCurrency: number | null;
  isActive: boolean;
  participantCount: number;
}

const EVENT_TYPES = ['SEASONAL', 'WEEKLY', 'SPECIAL', 'COMMUNITY'] as const;
const EVENT_STATUSES = ['UPCOMING', 'ACTIVE', 'GRACE_PERIOD', 'ENDED'] as const;

const TYPE_KEY: Record<string, string> = {
  SEASONAL: 'admin.events.typeSeasonal',
  WEEKLY: 'admin.events.typeWeekly',
  SPECIAL: 'admin.events.typeSpecial',
  COMMUNITY: 'admin.events.typeCommunity',
};

const STATUS_KEY: Record<string, string> = {
  UPCOMING: 'admin.events.statusUpcoming',
  ACTIVE: 'admin.events.statusActive',
  GRACE_PERIOD: 'admin.events.statusGrace',
  ENDED: 'admin.events.statusEnded',
};

interface FormState {
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  eventType: string;
  status: string;
  startDate: string;
  endDate: string;
  gracePeriodEnd: string;
  currencyName: string;
  maxCurrency: string;
  isActive: boolean;
}

// ค่าเริ่มต้น = ปิด (isActive false) — ห้ามเปิดกิจกรรมให้ผู้เล่นจริงโดยไม่ตั้งใจ
const EMPTY_FORM: FormState = {
  name: '',
  nameTh: '',
  description: '',
  descriptionTh: '',
  eventType: 'SEASONAL',
  status: 'UPCOMING',
  startDate: '',
  endDate: '',
  gracePeriodEnd: '',
  currencyName: 'Veil Shards',
  maxCurrency: '',
  isActive: false,
};

/** ISO → ค่าให้ <input type="datetime-local"> (ตามเวลาท้องถิ่น) */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ค่าจาก <input type="datetime-local"> → ISO string (หรือ null) */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminEventsPage() {
  const { t } = useI18n();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminEvent | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/events');
      const data = await res.json();
      if (res.ok && data.success) setEvents(data.data);
      else setError(data.error || t('admin.events.loadFailed'));
    } catch {
      setError(t('admin.events.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMsg(null);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (ev: AdminEvent) => {
    setEditingId(ev.id);
    setForm({
      name: ev.name,
      nameTh: ev.nameTh,
      description: ev.description ?? '',
      descriptionTh: ev.descriptionTh ?? '',
      eventType: ev.eventType,
      status: ev.status,
      startDate: toLocalInput(ev.startDate),
      endDate: toLocalInput(ev.endDate),
      gracePeriodEnd: toLocalInput(ev.gracePeriodEnd),
      currencyName: ev.currencyName,
      maxCurrency: ev.maxCurrency != null ? String(ev.maxCurrency) : '',
      isActive: ev.isActive,
    });
    setMsg(null);
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setMsg(null);
    setError(null);
    if (!form.name.trim() || !form.nameTh.trim() || !form.currencyName.trim()) {
      setError(t('admin.events.needRequired'));
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError(t('admin.events.needDates'));
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      nameTh: form.nameTh.trim(),
      eventType: form.eventType,
      status: form.status,
      startDate: fromLocalInput(form.startDate),
      endDate: fromLocalInput(form.endDate),
      currencyName: form.currencyName.trim(),
      isActive: form.isActive,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.descriptionTh.trim()) payload.descriptionTh = form.descriptionTh.trim();
    if (form.gracePeriodEnd) payload.gracePeriodEnd = fromLocalInput(form.gracePeriodEnd);
    if (form.maxCurrency !== '') payload.maxCurrency = parseInt(form.maxCurrency, 10);

    try {
      const res = await fetch(editingId ? `/api/admin/events/${editingId}` : '/api/admin/events', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('admin.events.saveFailed'));
        return;
      }
      setMsg(
        editingId
          ? t('admin.events.updated', { name: form.nameTh })
          : t('admin.events.created', { name: form.nameTh })
      );
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch {
      setError(t('admin.events.saveFailed'));
    }
  };

  const handleToggle = async (ev: AdminEvent) => {
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${ev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !ev.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('admin.events.saveFailed'));
        return;
      }
      setMsg(
        ev.isActive
          ? t('admin.events.toggledOff', { name: ev.nameTh })
          : t('admin.events.toggledOn', { name: ev.nameTh })
      );
      await load();
    } catch {
      setError(t('admin.events.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setMsg(null);
    setError(null);
    const name = deleteTarget.nameTh;
    try {
      const res = await fetch(`/api/admin/events/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('admin.events.deleteFailed'));
        return;
      }
      setMsg(t('admin.events.deleted', { name }));
      setDeleteTarget(null);
      await load();
    } catch {
      setError(t('admin.events.deleteFailed'));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-amber-400">{t('admin.events.title')}</h2>
        <button onClick={openCreate} className="btn-primary text-sm">
          ➕ {t('admin.events.new')}
        </button>
      </div>

      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {loading ? (
        <p className="text-gray-400">{t('admin.events.loading')}</p>
      ) : events.length === 0 ? (
        <p className="text-gray-400">{t('admin.events.empty')}</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="p-2 text-left">{t('admin.events.colName')}</th>
                <th className="p-2 text-left">{t('admin.events.colWindow')}</th>
                <th className="p-2 text-center">{t('admin.events.colStatus')}</th>
                <th className="p-2 text-right">{t('admin.events.colParticipants')}</th>
                <th className="p-2 text-center">{t('admin.events.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr
                  key={ev.id}
                  className={`border-t border-gray-700 text-gray-200 ${!ev.isActive ? 'opacity-50' : ''}`}
                >
                  <td className="p-2">
                    <div className="font-bold">{ev.nameTh}</div>
                    <div className="text-xs text-gray-500">
                      {ev.name} · {t(TYPE_KEY[ev.eventType] ?? 'admin.events.eventType')}
                    </div>
                  </td>
                  <td className="p-2 text-xs">
                    <div>{fmtDate(ev.startDate)}</div>
                    <div className="text-gray-500">→ {fmtDate(ev.endDate)}</div>
                  </td>
                  <td className="p-2 text-center text-xs">
                    <div className="text-gray-400">{t(STATUS_KEY[ev.status] ?? 'admin.events.status')}</div>
                    <button
                      onClick={() => handleToggle(ev)}
                      className={`mt-1 px-2 py-1 rounded-full ${ev.isActive ? 'bg-green-600' : 'bg-gray-600'}`}
                    >
                      {ev.isActive ? t('admin.events.open') : t('admin.events.closed')}
                    </button>
                  </td>
                  <td className="p-2 text-right">{ev.participantCount}</td>
                  <td className="p-2 text-center whitespace-nowrap">
                    <button onClick={() => openEdit(ev)} className="btn-secondary text-xs px-3 py-1 mr-1">
                      {t('admin.events.edit')}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(ev)}
                      className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1 rounded-lg"
                    >
                      {t('admin.events.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full border border-gray-600 my-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">
                {editingId ? t('admin.events.editTitle') : t('admin.events.newTitle')}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.nameTh')}</label>
                <input
                  value={form.nameTh}
                  onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.name')}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.descriptionTh')}</label>
                <input
                  value={form.descriptionTh}
                  onChange={(e) => setForm({ ...form, descriptionTh: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.description')}</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.eventType')}</label>
                <select
                  value={form.eventType}
                  onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  {EVENT_TYPES.map((ty) => (
                    <option key={ty} value={ty}>{t(TYPE_KEY[ty])}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.status')}</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  {EVENT_STATUSES.map((st) => (
                    <option key={st} value={st}>{t(STATUS_KEY[st])}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.startDate')}</label>
                <input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.endDate')}</label>
                <input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.gracePeriodEnd')}</label>
                <input
                  type="datetime-local"
                  value={form.gracePeriodEnd}
                  onChange={(e) => setForm({ ...form, gracePeriodEnd: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.currencyName')}</label>
                <input
                  value={form.currencyName}
                  onChange={(e) => setForm({ ...form, currencyName: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.events.maxCurrency')}</label>
                <input
                  type="number"
                  min={0}
                  value={form.maxCurrency}
                  onChange={(e) => setForm({ ...form, maxCurrency: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 self-end">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                {t('admin.events.isActive')}
              </label>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={handleSubmit} className="btn-primary flex-1 text-sm">
                {editingId ? t('admin.events.save') : t('admin.events.create')}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="btn-secondary text-sm px-4"
              >
                {t('admin.events.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full border border-gray-600">
            <p className="text-gray-100 mb-4">
              {t('admin.events.confirmDelete', { name: deleteTarget.nameTh })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="bg-red-700 hover:bg-red-600 text-white flex-1 text-sm py-2 rounded-lg font-bold"
              >
                {t('admin.events.delete')}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary text-sm px-4">
                {t('admin.events.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
