# Supabase cloud sync setup

NeuroFocusX uses Supabase Auth magic links and one `user_states` row per account. No Firebase is used. The app remains usable offline and with **Skip for now** when these variables are absent.

## 1. Create the table

In Supabase SQL Editor, run:

```sql
create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;

create policy "Users can read their own state"
  on public.user_states for select using (auth.uid() = user_id);
create policy "Users can insert their own state"
  on public.user_states for insert with check (auth.uid() = user_id);
create policy "Users can update their own state"
  on public.user_states for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

If policies already exist, do not create duplicate policies; review them in the Table Editor.

## 2. Configure email login

In Authentication → Providers, enable Email. Magic-link email delivery can use Supabase's development email service for testing; configure custom SMTP before production. Add your deployed app URL and local URL (`http://localhost:5173`) to Authentication → URL Configuration → Redirect URLs.

## 3. Configure the app

Copy `.env.example` to `.env.local` and set the project URL and public **anon** key:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Never put a service-role key in the frontend or commit `.env.local`. Restart Vite after changing environment variables.

## Data safety behavior

On first login, an empty cloud row receives local data; an empty device restores cloud data. If both contain progress, NeuroFocusX creates a local backup snapshot before offering local, cloud, or merge choices. Merge keeps local values for keys already present and restores cloud-only keys. Logout only ends the account session; it does not delete local progress.
