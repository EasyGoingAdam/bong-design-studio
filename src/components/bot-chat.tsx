'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'human' | 'bot';
  author: string | null;
  text: string;
  readByBot?: boolean;
  createdAt: string;
  pending?: boolean; // optimistic, not yet confirmed stored
  failed?: boolean;  // POST failed — never reached the bot
}

/**
 * Simple chat between the manufacturing team and the Grok bot. Messages persist
 * in bot_messages; the bot reads new ones via /api/bot/messages and replies
 * there. Polls every few seconds so the bot's replies show up.
 */
export function BotChat({ heightClass = 'h-[calc(100vh-8rem)]', compact = false }: { heightClass?: string; compact?: boolean } = {}) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/bot-chat');
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch { /* ignore */ }
    finally { setLoaded(true); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // poll for the bot's replies
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = async (retryText?: string) => {
    const text = (retryText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    if (!retryText) setInput('');
    // Optimistic bubble, marked pending until the server confirms it stored.
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = { id: tmpId, role: 'human', author: currentUser.name, text, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch('/api/bot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author: currentUser.name }),
      });
      if (!res.ok) {
        // The message never persisted, so the bot can't see it. Surface it
        // instead of leaving a fake "sent" bubble.
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) detail = j.error; } catch {}
        setMessages((m) => m.map((x) => (x.id === tmpId ? { ...x, pending: false, failed: true } : x)));
        setSendError(`Message didn't send (${detail}). It never reached the bot — tap Retry.`);
        return;
      }
      await load(); // replaces the optimistic bubble with the stored row
    } catch {
      setMessages((m) => m.map((x) => (x.id === tmpId ? { ...x, pending: false, failed: true } : x)));
      setSendError("Message didn't send (network). It never reached the bot — tap Retry.");
    } finally {
      setSending(false);
    }
  };

  const retry = (m: ChatMessage) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    send(m.text);
  };

  return (
    <div className={`${compact ? 'p-3' : 'p-4 sm:p-6'} max-w-3xl mx-auto ${heightClass} flex flex-col`}>
      <div className={compact ? 'mb-2' : 'mb-3'}>
        {!compact && <div className="eyebrow mb-1">Manufacturing ↔ Grok</div>}
        <h2 className={compact ? 'text-base font-bold' : 'text-2xl font-bold'}>Chat with the Bot</h2>
        {!compact && (
          <p className="text-sm text-muted mt-1">
            Raise an issue or a design idea — the bot reads your messages and can adjust what it designs and prioritizes.
          </p>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface border border-border rounded-xl p-4 space-y-3">
        {loaded && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-10">No messages yet. Say hello, flag a problem, or pitch a design idea.</p>
        )}
        {messages.map((m) => {
          const mine = m.role === 'human';
          const status = mine
            ? m.failed ? 'failed' : m.pending ? 'sending' : m.readByBot ? 'seen' : 'sent'
            : null;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? (m.failed ? 'bg-red-500 text-white' : 'bg-accent text-white') + ' rounded-br-sm' : 'bg-background border border-border rounded-bl-sm'}`}>
                <div className={`text-[10px] mb-0.5 ${mine ? 'text-white/70' : 'text-muted'}`}>
                  {m.role === 'bot' ? (m.author || 'Grok') : (m.author || 'You')} · {formatDate(m.createdAt)}
                </div>
                <div className="text-sm whitespace-pre-wrap leading-snug">{m.text}</div>
              </div>
              {status && (
                <div className="text-[10px] text-muted mt-0.5 mr-1 flex items-center gap-1">
                  {status === 'sending' && <span>Sending…</span>}
                  {status === 'sent' && <span>Sent · waiting for bot to read</span>}
                  {status === 'seen' && <span className="text-emerald-600">✓ Seen by bot</span>}
                  {status === 'failed' && (
                    <button onClick={() => retry(m)} className="text-red-600 underline">Not sent — Retry</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delivery hint: the last human message is stored but the bot hasn't
          read it. Tells the operator the bot isn't picking messages up. */}
      {(() => {
        const humans = messages.filter((m) => m.role === 'human' && !m.pending && !m.failed);
        const last = humans[humans.length - 1];
        if (!last || last.readByBot) return null;
        const ageMs = Date.now() - new Date(last.createdAt).getTime();
        if (ageMs < 20000) return null; // give the bot a moment to poll
        return (
          <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            The bot hasn&apos;t read your last message yet. It only receives messages when it polls <code>GET /api/bot/messages</code> or when <code>BOT_WEBHOOK_URL</code> is set. If this keeps happening, the bot isn&apos;t checking in.
          </div>
        );
      })()}
      {sendError && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{sendError}</div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the bot… (Enter to send, Shift+Enter for a new line)"
          rows={2}
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
