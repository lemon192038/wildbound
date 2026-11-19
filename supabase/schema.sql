-- Wildbound — database schema for Supabase (PostgreSQL).
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- (The game server also creates the tables automatically on first start; running this file first
--  makes the security settings explicit and is safe to re-run.)
--
-- Security model: ONLY the game server (connecting with the database password via DATABASE_URL)
-- reads or writes these tables. Supabase's auto-generated REST/GraphQL API must never expose them,
-- so Row Level Security is enabled with NO policies and all access for the public API roles
-- (anon, authenticated) is revoked. The server's `postgres` role is unaffected.

create table if not exists public.users (
  id          text primary key,
  name        text   not null,
  name_key    text   not null unique,      -- normalised (case-insensitive) name for uniqueness
  pass        text   not null,             -- scrypt hash: scrypt$N$salt$hash (never plain text)
  created_at  bigint not null
);

create table if not exists public.sessions (
  token_hash  text primary key,            -- SHA-256 of the session token (the token itself is never stored)
  user_id     text   not null,
  created_at  bigint not null,
  expires_at  bigint not null
);
create index if not exists sessions_user on public.sessions (user_id);
create index if not exists sessions_expiry on public.sessions (expires_at);

create table if not exists public.saves (
  user_id     text primary key,            -- one save document per account
  version     integer not null,            -- optimistic concurrency (atomic per-player updates)
  data        text    not null,            -- JSON save document (coins, items, equipment, quests…)
  updated_at  bigint  not null
);

-- Shared world state (stage 6+): the island ecosystem (key 'eco'), later world events. One JSON document per key.
create table if not exists public.world_state (
  key         text primary key,
  version     integer not null,            -- optimistic concurrency
  data        text    not null,            -- JSON document (see src/shared/ecosystem.js serializeEco)
  updated_at  bigint  not null
);

-- Lock the tables away from Supabase's public APIs.
alter table public.users    enable row level security;
alter table public.sessions enable row level security;
alter table public.saves    enable row level security;
alter table public.world_state enable row level security;
revoke all on table public.users, public.sessions, public.saves, public.world_state from anon, authenticated;
