-- Share Links — public, unguessable read-only previews of a concept that
-- can be sent to customers or external stakeholders without granting
-- them access to the studio. Each link has a token that's the public
-- identifier; the row tracks who made it, view count, expiry, and
-- whether it's been revoked.

CREATE TABLE IF NOT EXISTS share_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id  UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT DEFAULT '',
  expires_at  TIMESTAMPTZ,
  view_count  INTEGER DEFAULT 0,
  revoked     BOOLEAN DEFAULT false,
  allow_comments BOOLEAN DEFAULT true,
  title_override TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_share_links_concept_id ON share_links(concept_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);

-- Comments coming in from a public preview link are stored in the
-- existing comments table, but tagged with a special user_name like
-- "External: <visitor name>" so the team can distinguish them.
