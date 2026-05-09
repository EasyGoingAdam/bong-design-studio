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
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-border-light border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface rounded-xl border border-border p-10 shadow-sm">
          <div className="text-5xl mb-4 opacity-40">⚐</div>
          <h1 className="display-sm mb-2">Preview unavailable</h1>
          <p className="text-sm text-muted">{error || 'This link may have been revoked or expired.'}</p>
        </div>
      </main>
    );
  }

  const heroImage = data.marketingGraphicUrl || data.productMockupUrl || data.coilImageUrl;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              {data.collection && (
                <div className="eyebrow mb-3">{data.collection}</div>
              )}
              <h1 className="display-lg mb-3">{data.title}</h1>
              {data.marketingTagline && (
                <p className="text-lg md:text-xl text-muted italic mb-6 leading-snug">
                  {data.marketingTagline}
                </p>
              )}
              {data.description && (
                <p className="text-base text-foreground leading-relaxed mb-6">
                  {data.description}
                </p>
              )}
              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2.5 py-1 rounded-full bg-background text-muted border border-border"
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
                  className="w-full rounded-xl shadow-md aspect-square object-contain bg-background"
                />
              ) : (
                <div className="w-full aspect-square bg-background rounded-xl flex items-center justify-center text-muted">
                  No image available
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      {data.marketingStory && (
        <section className="bg-background border-b border-border">
          <div className="max-w-3xl mx-auto px-6 py-12 md:py-16 text-center">
            <div className="eyebrow mb-4">The Story</div>
            <p className="serif text-xl md:text-2xl leading-relaxed italic">
              {data.marketingStory}
            </p>
          </div>
        </section>
      )}

      {/* Design assets */}
      <section className="bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
          <div className="eyebrow mb-6 text-center">The Design</div>
          <div className={`grid gap-6 ${data.coilOnly ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'} max-w-4xl mx-auto`}>
            {data.coilImageUrl && (
              <div className="text-center">
                <div className="aspect-square bg-background rounded-xl border border-border overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.coilImageUrl} alt="Coil design" className="w-full h-full object-contain" />
                </div>
                <div className="eyebrow">Coil</div>
              </div>
            )}
            {!data.coilOnly && data.baseImageUrl && (
              <div className="text-center">
                <div className="aspect-square bg-background rounded-xl border border-border overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.baseImageUrl} alt="Base design" className="w-full h-full object-contain" />
                </div>
                <div className="eyebrow">Base</div>
              </div>
            )}
            {data.productMockupUrl && (
              <div className="text-center">
                <div className="aspect-square bg-background rounded-xl border border-border overflow-hidden mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.productMockupUrl} alt="On product" className="w-full h-full object-contain" />
                </div>
                <div className="eyebrow">On Product</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Comments */}
      {data.allowComments && (
        <section className="bg-background">
          <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
            <div className="eyebrow mb-4">Send Feedback</div>
            <h2 className="display-sm mb-6">What do you think?</h2>

            {commentSent ? (
              <div className="st-approved rounded-xl p-6 text-center">
                <div className="text-3xl mb-2">✓</div>
                <h3 className="text-lg font-medium mb-1">Thanks for the feedback</h3>
                <p className="text-sm">The design team will see your comment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder="Your name (optional)"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                  />
                  <input
                    type="email"
                    value={commentEmail}
                    onChange={(e) => setCommentEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                  />
                </div>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={4}
                  placeholder="Share your thoughts on this design…"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground resize-none"
                />
                {commentError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{commentError}</div>
                )}
                <button
                  onClick={submitComment}
                  disabled={commentSending || !commentText.trim()}
                  className="w-full py-2.5 bg-foreground hover:bg-accent text-surface rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {commentSending ? 'Sending…' : 'Send Feedback'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-surface border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-muted">
          Preview shared from Design Studio. This is a private link — please don&apos;t redistribute.
        </div>
      </footer>
    </main>
  );
}
