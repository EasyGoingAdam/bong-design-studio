'use client';

import { useEffect, useState, use } from 'react';

interface PreviewData {
  title: string;
  description: string;
  intendedAudience: string;
  collection: string;
  tags: string[];
  coilOnly: boolean;
  coilImageUrl: string;
  baseImageUrl: string;
  combinedImageUrl: string;
  productMockupUrl: string;
  marketingGraphicUrl: string;
  marketingStory: string;
  marketingTagline: string;
  allowComments: boolean;
  conceptId: string;
}

export default function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Comment form
  const [commentName, setCommentName] = useState('');
  const [commentEmail, setCommentEmail] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentSent, setCommentSent] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const [commentError, setCommentError] = useState('');

  useEffect(() => {
    fetch(`/api/preview/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `Preview unavailable (status ${r.status})`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setCommentSending(true);
    setCommentError('');
    try {
      const res = await fetch(`/api/preview/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorName: commentName.trim() || 'Anonymous',
          visitorEmail: commentEmail.trim(),
          text: commentText.trim(),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCommentError(result.error || 'Could not send comment');
        return;
      }
      setCommentSent(true);
      setCommentText('');
    } catch {
      setCommentError('Network error — please try again.');
    } finally {
      setCommentSending(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white rounded-2xl border border-stone-200 p-10 shadow-sm">
          <div className="text-5xl mb-4 opacity-40">⚐</div>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">Preview unavailable</h1>
          <p className="text-sm text-stone-500">{error || 'This link may have been revoked or expired.'}</p>
        </div>
      </main>
    );
  }

  const heroImage = data.marketingGraphicUrl || data.productMockupUrl || data.coilImageUrl;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* Hero */}
      <section className="relative bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              {data.collection && (
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-3 font-medium">
                  {data.collection}
                </div>
              )}
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-stone-900 leading-tight mb-3">
                {data.title}
              </h1>
              {data.marketingTagline && (
                <p className="text-lg md:text-xl text-stone-600 italic mb-6 leading-snug">
                  {data.marketingTagline}
                </p>
              )}
              {data.description && (
                <p className="text-base text-stone-700 leading-relaxed mb-6">
                  {data.description}
                </p>
              )}
              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt={data.title}
                  className="w-full rounded-xl shadow-md aspect-square object-contain bg-stone-100"
                />
              ) : (
                <div className="w-full aspect-square bg-stone-100 rounded-xl flex items-center justify-center text-stone-400">
                  No image available
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      {data.marketingStory && (
        <section className="bg-stone-50 border-b border-stone-200">
          <div className="max-w-3xl mx-auto px-6 py-12 md:py-16 text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4 font-medium">
              The Story
            </div>
            <p className="text-lg md:text-xl text-stone-800 leading-relaxed font-light italic">
              {data.marketingStory}
            </p>
          </div>
        </section>
      )}

      {/* Design assets */}
      <section className="bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-6 font-medium text-center">
            The Design
          </div>
          <div className={`grid gap-6 ${data.coilOnly ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'} max-w-4xl mx-auto`}>
            {data.coilImageUrl && (
              <div className="text-center">
                <div className="aspect-square bg-stone-50 rounded-xl border border-stone-200 overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.coilImageUrl} alt="Coil design" className="w-full h-full object-contain" />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500">Coil</div>
              </div>
            )}
            {!data.coilOnly && data.baseImageUrl && (
              <div className="text-center">
                <div className="aspect-square bg-stone-50 rounded-xl border border-stone-200 overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.baseImageUrl} alt="Base design" className="w-full h-full object-contain" />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500">Base</div>
              </div>
            )}
            {data.productMockupUrl && (
              <div className="text-center">
                <div className="aspect-square bg-stone-50 rounded-xl border border-stone-200 overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.productMockupUrl} alt="On product" className="w-full h-full object-contain" />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500">On Product</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Comments */}
      {data.allowComments && (
        <section className="bg-stone-50">
          <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4 font-medium">
              Send Feedback
            </div>
            <h2 className="text-2xl font-semibold text-stone-900 mb-6">
              What do you think?
            </h2>

            {commentSent ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                <div className="text-3xl mb-2">✓</div>
                <h3 className="text-lg font-medium text-emerald-900 mb-1">Thanks for the feedback</h3>
                <p className="text-sm text-emerald-700">The design team will see your comment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder="Your name (optional)"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    type="email"
                    value={commentEmail}
                    onChange={(e) => setCommentEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={4}
                  placeholder="Share your thoughts on this design…"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
                />
                {commentError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{commentError}</div>
                )}
                <button
                  onClick={submitComment}
                  disabled={commentSending || !commentText.trim()}
                  className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {commentSending ? 'Sending…' : 'Send Feedback'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-stone-500">
          Preview shared from Design Studio. This is a private link — please don&apos;t redistribute.
        </div>
      </footer>
    </main>
  );
}
