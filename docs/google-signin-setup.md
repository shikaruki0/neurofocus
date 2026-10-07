# “Continue with Google” setup — Hinglish guide (one screen at a time)

Ye guide NeuroFocusX ke **Google sign-in** ko live karne ke liye hai.
School/college style: **ek baar mein ek hi screen**, phir “done” bolo, phir next.

Live app: `https://neurofocusx.vercel.app`
Supabase project ref: `zgrwthwfbjzpwngfazwc`

> **Important:** Client Secret sirf Google Cloud aur Supabase dashboard mein rahega.
> Kabhi frontend code, Vercel env variables, Git, chat ya screenshot mein nahi.

## Kya-kya change hua (product decision)

| Topic                      | Decision                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- |
| New users                  | **Continue with Google** — primary aur sabse aasan raasta                             |
| Existing users             | Email + password sign-in **waise hi chalta rahega** (sirf already confirmed accounts) |
| Password sign-up           | **Paused** (`isEmailSignupEnabled = false`) jab tak reliable email delivery na ho     |
| Confirm Email              | **ON hi rahega** — koi manually verified karne wala workaround nahi                   |
| Old unconfirmed accounts   | Na delete, na merge, na migrate — waise hi chhode gaye hain                           |
| Gmail/Drive/Contacts scope | Kabhi nahi — sirf `openid email profile`                                              |

## Manual steps (har step chhota hai)

### Step 1 — Google Cloud project

1. `https://console.cloud.google.com/` kholo.
2. Agar pehle se project hai to wahi select karo, warna **New Project** → naam `NeuroFocusX` → **Create**.
3. **Stop** karo agar page card, billing, paid plan ya UPI maange.

### Step 2 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → **Create**.
3. App name: `NeuroFocusX`, support email: apna email, developer email: apna email.
4. Scopes: sirf `openid`, `email`, `profile` (basic identity). **Gmail/Drive/Contacts add nahi karna.**
5. Test users (agar app “Testing” mode mein hai): apna + jinke liye test karna hai, unke Gmail addresses.
6. Publishing status ko **Testing** par chhodna bhi theek hai (100 test users tak chalta hai).
   Baad mein “Publish app” kar sakte ho — Google verification tab tak zaroori nahi jab tak basic scopes hi hon.

### Step 3 — OAuth client (Web application)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Naam: `NeuroFocusX Web`.
4. **Authorized JavaScript origins:** `https://neurofocusx.vercel.app`
5. **Authorized redirect URIs:** `https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/callback`
6. **Create** → Client ID aur Client Secret screen par dikhega.
   - Client ID copy kar sakte ho (public hai).
   - **Client Secret ko kahin paste karne ki zaroorat nahi** — bas agle step mein Supabase dashboard mein seedha paste karna hai.

### Step 4 — Supabase: Google provider enable

1. `https://supabase.com/dashboard/project/zgrwthwfbjzpwngfazwc/auth/providers` kholo.
2. **Google** provider enable karo.
3. Client ID aur Client Secret seedha wahi paste karo → **Save**.
   (Ye values sirf Supabase ke backend mein store hoti hain — frontend ko nahi milti.)

### Step 5 — Supabase: URL configuration (exact URLs, koi wildcard nahi)

1. `https://supabase.com/dashboard/project/zgrwthwfbjzpwngfazwc/auth/url-configuration` kholo.
2. **Site URL:** `https://neurofocusx.vercel.app`
3. **Redirect URLs** mein exactly ye add karo:
   - `https://neurofocusx.vercel.app/`
   - `http://localhost:5173/` (sirf local development ke liye — optional)
4. `*.vercel.app` jaisa broad/wildcard entry **mat** add karna.

### Step 6 — Email settings ko waise hi rakho

`https://supabase.com/dashboard/project/zgrwthwfbjzpwngfazwc/auth/providers` par:

- **Email** provider: **enabled**
- **Confirm email**: **ON**

Kuch bhi manually verify nahi karna. Existing unconfirmed accounts ko delete/merge bhi nahi karna.

### Step 7 — Vercel

Vercel par sirf build/deploy hota hai; koi naya env variable zaroori nahi.
`VITE_SUPABASE_URL` aur `VITE_SUPABASE_ANON_KEY` pehle se set hain to kaam chal jayega.

Optional (local dev ya kisi doosre exact origin ke liye):
`VITE_AUTH_ALLOWED_ORIGINS=http://localhost:5173` — comma separated **exact** origins only.

## Test checklist (asli phone + laptop par)

1. `https://neurofocusx.vercel.app` kholo → **Continue with Google** dikhna chahiye.
2. Button par tap/click → Google account chooser khule.
3. Google account choose karo → wapas app mein aa jao → XP/dashboard dikhe.
4. Google chooser par **Cancel / back** dabao → app wapas aaye aur friendly message dikhe
   (“Google sign-in was cancelled…”), raw error nahi.
5. Purane email/password account se sign-in karo → waise hi chale.
6. “Continue without an account” → pehle jaisa local mode chale.
7. Phone + laptop same Google account se sign-in karo → progress sync ho.
8. Settings mein “Sign out” → wapas account screen aaye.

## Agar kuch galat ho

| Symptom                                                         | Reason                                              | Fix                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Button par message: “Google sign-in is not available right now” | Supabase mein Google provider enable nahi hai       | Step 4 dobara karo                                                                |
| “Google sign-in works on the live app”                          | Preview URL (jaise `…-git-main….vercel.app`) par ho | Live URL use karo                                                                 |
| Google par “redirect_uri_mismatch”                              | Google Cloud redirect URI galat/adhoora hai         | Step 3 ka URI exactly `https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/callback` |
| Supabase par “Unsupported provider”                             | Provider save nahi hua                              | Step 4 save dobara                                                                |
| Sign-in ke baad email confirm maang rahe ho                     | Ye email/password account hai, Google account nahi  | Google button use karo ya email link confirm karo                                 |
