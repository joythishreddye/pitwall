-- Newsletter / notification subscriptions
-- Captures emails from the Live and Academy shell pages.
-- source: which page captured the email ('live' | 'academy' | 'predictions')

create table if not exists notify_subscriptions (
    id          bigint generated always as identity primary key,
    email       text    not null,
    source      text    not null check (source in ('live', 'academy', 'predictions')),
    created_at  timestamptz not null default now(),

    -- One row per email — later sources upsert silently
    constraint notify_subscriptions_email_key unique (email)
);

-- Index for admin queries filtering by source or date
create index if not exists notify_subscriptions_source_idx on notify_subscriptions (source);
create index if not exists notify_subscriptions_created_at_idx on notify_subscriptions (created_at desc);

-- RLS: only the service role key (backend) can read/write
alter table notify_subscriptions enable row level security;

create policy "service role only"
    on notify_subscriptions
    using (false)         -- no anon/user reads
    with check (false);   -- no anon/user writes
