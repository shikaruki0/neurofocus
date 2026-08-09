# Supabase cloud sync setup

NeuroFocusX uses **email + password** auth (no magic links) and one `user_states` row per account. The app remains usable offline and with **Continue without an account** when these variables are absent.

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

## 2. Configure email login (important)

In **Authentication → Providers**, enable **Email**.

### Stop random / fake accounts

1. Open **Authentication → Providers → Email**.
2. Turn **Confirm email** **ON**.  
   Users must open the link in their inbox before they can use the account.  
   This stops “type anything @gmail.com + random password and I’m in” behavior.
3. Optional but recommended: **Authentication → Attack Protection**
   - Enable CAPTCHA (hCaptcha / Turnstile) for sign-ups.
   - Keep rate limits on.

### Password policy

In **Authentication → Providers → Email** (or project Auth settings), set minimum password length to **at least 8**. The app already requires 8+ characters with a letter and a number.

### Redirect URLs

Add your deployed app URL and local URL (`http://localhost:5173`) to  
**Authentication → URL Configuration → Redirect URLs**.

Also set **Site URL** to your live app URL. Password reset and confirmation emails use these.

For production, configure custom SMTP under **Project Settings → Auth** so confirmation and reset emails actually arrive.

### Forgot password

The app has a **Forgot password?** flow:

1. User enters email → Supabase sends a reset link.
2. User opens the link → lands back in the app on **Choose a new password**.
3. User saves → signed in with the new password.

No extra SQL is required. Just make sure redirect URLs (above) include your app.

## 3. Configure the app

Copy `.env.example` to `.env.local` and set the project URL and public **anon** key:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Never put a service-role key in the frontend or commit `.env.local`. Restart Vite after changing environment variables.

## 4. How cross-device sync works

| Moment | What happens |
|--------|----------------|
| Sign in / open app while signed in | Device loads cloud progress for **this account**. Empty device restores cloud. Richer side wins; close scores smart-merge. |
| You add backlog, XP, habits, etc. | Local save triggers a **debounced cloud push** (~1s). |
| You switch tabs / leave the page | Latest progress is flushed to cloud. |
| You come back / other device was used | App **pulls** newer cloud data and refreshes the UI. |
| Settings → **Sync now** | Pull + merge + push immediately. |
| Logout | Flushes cloud, then ends session. Local guest data is not deleted. |

One row in `user_states` = one account. PC and phone signed into the **same email** share that row.

## Data safety behavior

- Logout only ends the account session; it does not delete local progress.
- Switching accounts on one device isolates caches so User A never inherits User B’s backlog.
- Import backup is still local-first; cloud sync remains a separate step (or automatic once signed in).

## Cleaning junk test accounts

If random emails already appear under **Authentication → Users**:

1. Delete the junk users you do not need.
2. Turn **Confirm email** ON (step 2 above).
3. Ask real users to sign up again with a real inbox they can open.
