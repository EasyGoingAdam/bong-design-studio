-- Bot chat: a shared message thread between the manufacturing team and the Grok
-- bot. The team member posts from the in-app chat; the bot pulls unread human
-- messages via /api/bot/messages and posts replies back. So the tech can raise
-- issues or ideas and steer what the bot designs.

create table if not exists bot_messages (
  id           uuid primary key default gen_random_uuid(),
  role         text not null default 'human',   -- 'human' | 'bot'
  author       text,                            -- team member name, or 'Grok'
  text         text not null default '',
  metadata     jsonb,                           -- optional structured payload (e.g. referenced design ids)
  read_by_bot  boolean not null default false,  -- has the bot consumed this human message
  created_at   timestamptz not null default now()
);

create index if not exists bot_messages_created_idx on bot_messages (created_at);
create index if not exists bot_messages_unread_idx on bot_messages (read_by_bot) where read_by_bot = false;
