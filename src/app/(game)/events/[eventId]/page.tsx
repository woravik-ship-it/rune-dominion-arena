'use client';

// Event Hub — Phase 11: Seasonal Event "Call of the Moonless Gate" (GDD §13)
// Banner + Countdown / Boss Raid (HP·Phase) / Milestone / Quest / Shop / Story
import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import EventHubView, {
  EventHubData,
  EventQuestView,
  MilestoneView,
  StoryView,
} from '@/components/events/EventHubView';

function formatDuration(ms: number): string {
  if (ms <= 0) return 'สิ้นสุดแล้ว';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d} วัน ${h} ชม.` : `${h} ชม. ${m} นาที`;
}

export default function EventHubPage({ params }: { params: { eventId: string } }) {
  const [hub, setHub] = useState<EventHubData | null>(null);
  const [milestones, setMilestones] = useState<MilestoneView[]>([]);
  const [story, setStory] = useState<StoryView[]>([]);
  const [eventQuests, setEventQuests] = useState<EventQuestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all([
        apiFetch('/api/events'),
        apiFetch(`/api/events/${params.eventId}/milestones`),
        apiFetch(`/api/events/${params.eventId}/story`),
        apiFetch(`/api/events/${params.eventId}/quests`),
        apiFetch('/api/decks'),
      ]);
      const [hubData, msData, storyData, questData, decksData] = await Promise.all(
        results.map((r) => r.json())
      );
      if (hubData.success) setHub(hubData.data);
      if (msData.success) setMilestones(msData.data);
      if (storyData.success) setStory(storyData.data);
      if (questData.success) setEventQuests(questData.data);
      if (decksData.success && decksData.data.length > 0) setDeckId(decksData.data[0].id);
    } catch (e) {
      console.error(e);
      setErr('โหลดข้อมูลกิจกรรมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [params.eventId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const postJson = async (path: string, body: unknown) => {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  };

  const handleRaid = async () => {
    if (!hub?.boss || !deckId) { setErr('ต้องมีทีม 5 ใบก่อนเข้า Raid'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { res, data } = await postJson(`/api/events/${params.eventId}/raid`, {
        bossId: hub.boss.id,
        deckId,
        idempotencyKey: `raid-${params.eventId}-${Date.now()}`,
        won: true,
        turn: 3,
      });
      if (!res.ok) { setErr(data.error || 'เข้า Raid ไม่สำเร็จ'); return; }
      const d = data.data;
      setMsg(`ดาเมจ ${d.damageDealt.toLocaleString('th-TH')} · Points ${d.eventPoints.toLocaleString('th-TH')} · ได้ ${d.shardsEarned} Veil Shards`);
      await loadAll();
    } finally { setBusy(false); }
  };

  const handleClaim = async (milestoneId: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { res, data } = await postJson(`/api/events/${params.eventId}/milestones`, { milestoneId });
      if (!res.ok) { setErr(data.message || 'รับรางวัลไม่สำเร็จ'); return; }
      setMsg(data.data.message);
      await loadAll();
    } finally { setBusy(false); }
  };

  const handleClaimQuest = async (eventQuestId: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { res, data } = await postJson(`/api/events/${params.eventId}/quests`, { eventQuestId });
      if (!res.ok) { setErr(data.message || 'รับรางวัลไม่สำเร็จ'); return; }
      setMsg(`${data.data.message} (+${data.data.coin} Coin)`);
      await loadAll();
    } finally { setBusy(false); }
  };

  const handleBuy = async (itemId: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { res, data } = await postJson(`/api/events/${params.eventId}/shop`, {
        itemId,
        idempotencyKey: `buy-${itemId}-${Date.now()}`,
      });
      if (!res.ok) { setErr(data.message || 'ซื้อไม่สำเร็จ'); return; }
      setMsg(data.data.message);
      await loadAll();
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4">
        <p className="text-center text-gray-400 py-10">กำลังโหลดกิจกรรม...</p>
      </main>
    );
  }

  if (!hub || hub.id !== params.eventId) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-gray-400 mb-4">ไม่พบกิจกรรมนี้ หรือยังไม่เปิดให้เล่น</p>
          <Link href="/events" className="btn-primary">ดูกิจกรรมทั้งหมด</Link>
        </div>
      </main>
    );
  }

  return <EventHubView
    hub={hub} milestones={milestones} story={story} eventQuests={eventQuests} busy={busy}
    msg={msg} err={err} deckId={deckId}
    onRaid={handleRaid} onClaim={handleClaim} onClaimQuest={handleClaimQuest} onBuy={handleBuy}
  />;
}
