# Marginn → Readdy AI / handoff checklist

Use this file when you copy or re-apply work in **Readdy AI** or another environment. It groups **what changed** and **which paths to replace**, not full diffs.

---

## 0. Cursor + Readdy setup (one workflow)

There is no direct “plug Cursor into Readdy AI” link. You connect **the same codebase and the same Supabase project** in both places.

### Roles

| Where | What you use it for |
|--------|---------------------|
| **Cursor** (`d:\Marginn\project`) | Source of truth: edit `src/`, `supabase/`, run `npm run dev`, `npm run build`, `supabase functions deploy …`. |
| **GitHub** | Optional but recommended bridge between Cursor and Readdy ([Readdy ↔ GitHub](https://docs.readdy.ai/integrations/github)). Sync is **manual**: Push/Pull in Readdy’s GitHub panel — not automatic. |
| **Readdy** | Host/publish the React app, optional AI edits in their editor, [Publish (React)](https://docs.readdy.ai/features/publish-react-v2). |
| **Supabase** | Database + Auth + Edge Functions — [Readdy Supabase integration](https://docs.readdy.ai/integrations/supabase) should point at the **same** project as `VITE_PUBLIC_SUPABASE_*` in this repo. |

**Important:** Readdy **Push to GitHub** overwrites the connected repo’s `main` with the Readdy project snapshot. Prefer **Cursor → `git push` → Readdy Pull** so you do not accidentally wipe GitHub history with an older Readdy version.

### Step-by-step (recommended)

1. **GitHub (from Cursor)**  
   - Initialize remote if needed: `git init`, add `.gitignore`, commit, create a repo on GitHub, `git remote add origin …`, `git push -u origin main`.  
   - Keep `main` the branch Readdy pulls from (per [GitHub integration](https://docs.readdy.ai/integrations/github)).

2. **Readdy ↔ GitHub**  
   - Readdy: **Tools** → **GitHub** → Connect GitHub (install Readdy GitHub App).  
   - Link or create the repository per the wizard, then use **Pull** to import the latest `main` after each push from Cursor.  
   - Use **Push** from Readdy only when you intentionally want Readdy’s current version to become GitHub `main` (overwrites).

3. **Supabase (same project everywhere)**  
   - In Readdy: connect Supabase per [Integrate with Supabase](https://docs.readdy.ai/integrations/supabase).  
   - In Cursor: copy `.env.example` → `.env` with the same `VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`.  
   - Edge secrets (`ANTHROPIC_API_KEY`, `SCRAPINGBEE_*`, `STRIPE_*`, etc.) stay in **Supabase Dashboard → Edge Functions → Secrets**, not in Readdy’s chat.

4. **CORS / preview URLs**  
   - Any Readdy preview or custom host that calls Edge must be allowed: set Supabase Edge secret **`EDGE_EXTRA_ALLOWED_ORIGINS`** (comma-separated), matching [`.env.example`](./.env.example) comments.

5. **Build & publish**  
   - Local check: `npm ci` (or `npm install`), `npm run build` — output is **`dist/`** (Vite).  
   - Readdy: publish / update per [Publish - for React Project](https://docs.readdy.ai/features/publish-react-v2) and your **Project settings** for build commands or env if Readdy builds in the cloud.

6. **After Cursor changes**  
   - **Frontend only:** push to GitHub → Readdy **Pull** → publish/update in Readdy.  
   - **Edge / SQL:** deploy from your machine (`supabase functions deploy …`, `supabase db push` or Dashboard SQL) — Readdy does not deploy Edge for you.  
   - Optional: run `scripts\push-supabase-marginn.ps1` from §4 for a scripted Edge/db push.

### Cursor-only quality-of-life

- Rules in [`.cursor/rules/marginn-project.mdc`](./.cursor/rules/marginn-project.mdc) already describe stack and deploy expectations.  
- For “Readdy-specific” URLs or domains, add them to **`EDGE_EXTRA_ALLOWED_ORIGINS`** and, if needed, one line in project rules so agents do not forget.

---

## 1. Scan persistence (Supabase `scans` + profiles)

**Theme:** Rows were blocked or skipped (RLS, grants, `user_id` resolution, NDJSON buffer, Edge `insertUserId`).

| Area | Paths to sync |
|------|----------------|
| **Migrations** | `supabase/migrations/20260511120000_scans_rls_own_rows.sql`, `supabase/migrations/20260512120000_scans_table_grants_rls.sql` |
| **Edge** | `supabase/functions/analyse-item/index.ts` (persistence, JWT/`body.user_id`, optional `margin`, optional **`partner_shop_id`** / `partnerShopId` for charity shops — see §3c) |
| **Client** | `src/pages/scan/page.tsx`, `src/lib/scanEdgeResponse.ts`, `src/context/AuthContext.tsx` (e.g. `decrementScan` / plan edge cases) |
| **Auth helper** | `src/lib/authUserId.ts` (`resolveAuthUserId` — session/`getUser` fallback) |
| **Lists** | `src/pages/dashboard/history/page.tsx`, `src/pages/dashboard/page.tsx`, `src/pages/home-logged-in/page.tsx` (fetch scans with correct user + RLS; later tweaks for count/limit — see §3) |

**Supabase (manual):** Run migration SQL in Dashboard if you do not use `supabase db push`. Set Edge secret **`SUPABASE_SERVICE_ROLE_KEY`** on `analyse-item` if you rely on service-role inserts.

---

## 2. Stripe + webhook + waitlist + coming soon

| Area | Paths to sync |
|------|----------------|
| **Shared Stripe apply** | `supabase/functions/_shared/stripeCheckoutApply.ts` |
| **Edge** | `supabase/functions/stripe-checkout/index.ts`, `stripe-success/index.ts`, `stripe-cancel/index.ts`, **`stripe-webhook/index.ts`**, **`db-webhook-receiver/index.ts`** |
| **Config** | `supabase/config.toml` — `verify_jwt = false`: `stripe-checkout`, `stripe-cancel`, `stripe-webhook`, **`db-webhook-receiver`**. **`verify_jwt = true`**: **`stripe-success`**, `analyse-item`, `delete-account` |
| **Migrations** | `supabase/migrations/20260512160000_processed_stripe_sessions.sql`, `supabase/migrations/20260512160100_waitlist.sql` |
| **Frontend** | `src/pages/waitlist/page.tsx`, `src/lib/comingSoon.ts`, `src/router/config.tsx`, `src/vite-env.d.ts`, `.env.example` |
| **Pricing / billing copy** | `src/pages/pricing/page.tsx`, `src/pages/dashboard/pricing/page.tsx`, `src/pages/dashboard/billing/page.tsx`, `src/pages/landing/components/PricingSection.tsx` |

**Prices (code):** Drop In **£3 → 10 scans** (`drop_in`), Scout **£9.99/mo**, Trader **£19.99/mo** (checkout uses pence in Edge).

**Secrets (Supabase Edge, not in repo):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus existing keys for `analyse-item` (see `.env.example` / function header comments). **`stripe-success`** also needs **`SUPABASE_ANON_KEY`** so it can resolve the caller JWT and enforce `metadata.user_id === auth.uid()` before applying checkout.

**Frontend env:** `VITE_PUBLIC_COMING_SOON` — when `true`/`1`, anonymous users are steered to **`/waitlist`** (auth routes excluded).

---

## 3. Scan results UI + dashboard + history (fees, CO₂, thumbnails)

| Area | Paths to sync |
|------|----------------|
| **Edge** | `supabase/functions/analyse-item/index.ts` — returns **`margin`** (fee breakdown, net, max buy, ROI) + **`decision`** aligned with DB columns; optional **`partner_shop_id`** (§3c) |
| **Types / stream** | `src/lib/scanEdgeResponse.ts` (`AnalyseItemMargin` export) |
| **Scan flow + merge** | `src/pages/scan/page.tsx` (`applyAnalyseItemMargin` or equivalent merge of Edge `margin`) |
| **Result card** | `src/pages/scan/components/ScanResultCard.tsx` (fee breakdown, net, max buy, ~2.1 kg CO₂ hint where implemented) |
| **Dashboard** | `src/pages/dashboard/page.tsx` — scans remaining, **total profit** (sum), **CO₂ = scan count × 2.1 kg**, recent scans **`image_url`** |
| **History** | `src/pages/dashboard/history/page.tsx` — higher cap (e.g. **500**), count display, **`image_url`** |
| **Modal** | `src/pages/dashboard/history/components/ScanDetailModal.tsx` — real `scans` columns, **`image_url`** hero |

**Deploy:** `supabase functions deploy analyse-item` after Edge changes.

---

## 3a. Edge RPM rate limits (JWT functions only)

**Theme:** Rolling **1 minute** requests-per-user caps by **`profiles.plan`**, enforced **after** JWT identity. **`supabase/config.toml`** has `verify_jwt = true` only for **`analyse-item`** and **`delete-account`** (all Stripe functions stay `verify_jwt = false`).

| Plan | RPM (per function slug) |
|------|-------------------------|
| `free` / unknown | 3 |
| `scout` | 10 |
| `trader` | 60 |
| `pro` | 60 (same as trader) |
| `drop_in` | 5 |

| Area | Paths to sync |
|------|----------------|
| **Migration** | `supabase/migrations/20260524120000_rate_limits.sql` — table `public.rate_limits`, index `(user_id, function_slug, created_at desc)`, **`rate_limit_consume(uuid, text, int)`** `SECURITY DEFINER` (atomic count + insert); **`REVOKE ALL`** on table from `anon`/`authenticated`; **`GRANT EXECUTE` on RPC to `service_role` only** |
| **Shared** | `supabase/functions/_shared/rateLimit.ts` — `rpmForPlan`, `enforceUserRateLimit` |
| **Edge** | `supabase/functions/analyse-item/index.ts`, `supabase/functions/delete-account/index.ts` |

**Flow:** Edge uses **service role** → read `profiles.plan` for `auth` user → RPC **`rate_limit_consume`** records one row or returns **`retry_after_sec`**. Over limit: **HTTP 429** JSON `{"message":"Rate limit exceeded. Try again in X seconds."}` and header **`Retry-After: X`**.

**Secrets:** **`SUPABASE_SERVICE_ROLE_KEY`** required on **`delete-account`**; on **`analyse-item`** RPM is skipped with a **console warning** if the secret is missing (legacy/dev); set the secret in production so limits apply.

**Deploy:** `supabase functions deploy analyse-item` and `supabase functions deploy delete-account` after Edge or migration changes.

---

## 3b. Scan identification cache (48h, fingerprint — vision only)

**Theme:** Reuse **structured identification** (brand, item, condition, etc.) for the same **image fingerprint** for up to **48 hours**. **Live marketplace scrapes and pricing** always run (eBay/Vinted/Depop, `listing_cache`, margin math) — no short-circuit on cache hit.

| Area | Paths to sync |
|------|----------------|
| **Migration** | `supabase/migrations/20260521130000_scan_identification_cache.sql` |
| **Edge** | `supabase/functions/analyse-item/index.ts`, `supabase/functions/_shared/identificationCache.ts` |
| **Table** | `public.scan_identification_cache` — columns `fingerprint` (PK), `payload` (jsonb, identification fields only), `schema_version`, `created_at` |

**Fingerprint:** SHA-256 (64-char hex) of UTF-8 bytes of the **base64 image payload** after stripping a `data:*;base64,` prefix (same string the client sends as `imageBase64` / `image_base64`). Returned as `fingerprint` on the JSON / NDJSON `analysis` + final payload; UI can show it instead of the old client-only hash when present.

**Cache scope:** **Global per fingerprint** (no `user_id`) so any user benefits from a prior vision result for the same image bytes.

**RLS / access:** Table is **Edge + service role only** (`REVOKE` from `anon`/`authenticated`; `GRANT` to `service_role` only). Requires **`SUPABASE_SERVICE_ROLE_KEY`** on `analyse-item` for cache read/write (same as reliable `scans` insert).

**Schema drift:** Bump `IDENT_CACHE_SCHEMA_VERSION` in `identificationCache.ts` and migration default / existing rows as needed; stale `schema_version` rows are ignored.

**Manual test:** Scan the **same** image twice within 48h (same encoded bytes). Logs / `identification_from_cache: true` on the second call; ScrapingBee / live prices still run (check logs and different `livePrices` if market moved).

---

### Similar sold comps (`listing_cache` + scan UI)

**Carousel thumbnails** on the scan result card are **eBay sold listings only**: `analyse-item` inserts `listing_cache` rows with **`platform = 'ebay'`** after parsing the eBay sold SERP HTML. **Vinted and Depop** are scraped for **`livePrices`** (median / counts) and exposed as **“Browse similar on Vinted / Depop”** links in `src/pages/scan/components/ScanResultCard.tsx` — they are **not** written to `listing_cache` and do not populate the horizontal comp cards. That split is intentional (single persisted source for sold comps).

**`scan_identification_cache`:** Skips repeat vision only; **market scrapes and `listing_cache` inserts still run** on every scan (see §3b).

**Parser drift:** eBay markup changes can shrink how many segments pass `extractEbayListingCards` (users may report “only a couple of comps” while Vinted pricing still looks fine). The Edge function scores multiple HTML split strategies and widens title/URL/image patterns; if comps vanish entirely, the next lever is ScrapingBee **`render_js=true`** for the eBay URL only (higher cost/latency).

| Area | Paths |
|------|--------|
| **Edge** | `supabase/functions/analyse-item/index.ts` — `pickEbayListingHtmlSegments`, `extractEbayListingCards`, `finishScanAfterVision` |
| **Client** | `src/pages/scan/page.tsx` — `listing_cache` select `platform = 'ebay'` |

---

## 3c. Partner charity shop portal (`/partner`)

| Area | Paths to sync |
|------|----------------|
| **Migration** | `supabase/migrations/20260522120000_partner_shops_portal.sql` — `partner_shops`, `profiles.role` / `profiles.partner_shop_id`, `scans.partner_shop_id` + index, RLS |
| **Edge** | `supabase/functions/analyse-item/index.ts` — optional JSON body `partner_shop_id` or `partnerShopId`; validated against `profiles` (must be `role = 'partner'` and shop id match) before persisting on `scans` |
| **Frontend** | `src/router/config.tsx`, `src/components/feature/PartnerProtectedRoute.tsx`, `src/pages/partner/page.tsx`, `src/pages/dashboard/components/DashboardLayout.tsx` (`variant="partner"`), `src/context/AuthContext.tsx` (`profileLoading`, profile `role` / `partner_shop_id`), `src/pages/scan/page.tsx` (sends `partner_shop_id` from `?shop=<uuid>` when it matches profile, else profile’s shop when partner) |

**Route guard:** `/partner` requires auth and `profiles.role === 'partner'`. Others redirect to `/dashboard` with toast “Partner access only”.

**Mark a user as partner (SQL):**

```sql
insert into public.partner_shops (owner_user_id, name)
values ('<USER_UUID>', 'My Charity Shop')
returning id;

update public.profiles
set role = 'partner', partner_shop_id = '<SHOP_UUID_FROM_ABOVE>'
where id = '<USER_UUID>';
```

**RLS (summary):** `partner_shops` — authenticated **SELECT** where `owner_user_id = auth.uid()`. `scans` — **SELECT** if row is own (`user_id = auth.uid()`) **or** caller is a partner and `scans.partner_shop_id = profiles.partner_shop_id`; **INSERT** — `user_id = auth.uid()` and `partner_shop_id` is null **or** equals the inserter’s `profiles.partner_shop_id` with `role = 'partner'`.

**MVP attribution:** Scan page passes `partner_shop_id` into `analyse-item` (and fallback client insert). Stricter alternative: only Edge sets shop id (already enforced for invalid ids); avoid letting non-partners pass arbitrary shop UUIDs — Edge returns **403** if `partner_shop_id` does not match the resolved user’s profile.

**Deploy:** `supabase functions deploy analyse-item` when the Edge file changes.

---

## 4. Order to apply in a fresh environment

1. **SQL:** All migrations under `supabase/migrations/` in timestamp order (especially scans RLS/grants, **`20260527140000_scans_grants_authenticated.sql`**, `listing_cache` if you use it, **`scan_identification_cache`**, **partner shops portal (`20260522120000_…`)**, **`20260523120000_rls_hardening.sql`**, **`20260524120000_rate_limits.sql`** (Edge RPM), **`20260526120000_alerts_scan_failures_webhook_settings.sql`**, `processed_stripe_sessions`, `waitlist`).
2. **Supabase:** Edge secrets + deploy **all** functions (`analyse-item`, **`delete-account`**, `stripe-checkout`, `stripe-success`, `stripe-cancel`, **`stripe-webhook`**, **`db-webhook-receiver`**).

   **Browser CORS:** `supabase/functions/_shared/cors.ts` allowlists **`https://marginn.co.uk`**, **`https://www.marginn.co.uk`**, **`http://localhost:5173`**, plus any comma-separated origins in Edge secret **`EDGE_EXTRA_ALLOWED_ORIGINS`** (e.g. Readdy preview). Other origins get no `Access-Control-Allow-Origin` (no wildcard). **`stripe-webhook`** and **`db-webhook-receiver`** omit browser CORS.
3. **Stripe Dashboard:** Webhook URL `…/functions/v1/stripe-webhook`, event `checkout.session.completed`, signing secret → `STRIPE_WEBHOOK_SECRET`.
4. **Frontend:** Copy/sync entire `src/` (or diff the files above), root `.env.example`, `package.json` / `vite.config` if changed.
5. **Readdy:** Set `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY`, optional `VITE_PUBLIC_COMING_SOON`; build `npm run build`, publish **`dist`**.

**One-shot CLI (local):** after `supabase login` + `supabase link`, run `scripts\push-supabase-marginn.ps1` to `db push` and deploy all Edge functions listed inside.

---

## 5. Quick “did I miss a file?” grep (local)

```powershell
cd d:\Marginn\project
git status
git diff --stat
```

If not using git, compare this doc’s tables against your Readdy export.

---

## 6. RLS hardening (`20260523120000_rls_hardening.sql`)

**Migration file:** `supabase/migrations/20260523120000_rls_hardening.sql` (after `20260522120000_partner_shops_portal.sql`).

| Table | Policies / notes |
|------|-------------------|
| **`profiles`** | `profiles_select_own`, `profiles_update_own`, `profiles_insert_own` — `id = auth.uid()`. Trigger `handle_new_user` is **SECURITY DEFINER** (bypasses RLS). Referral lookup: RPC **`profile_id_for_referral_code(p_code text)`** + `src/pages/signup/page.tsx`. |
| **`scans`** | Keeps **`scans_select_own_or_partner_shop`** / **`scans_insert_own_optional_partner_shop`**; adds **`scans_update_own`**, **`scans_delete_own`** (`user_id = auth.uid()`). **service_role** bypasses RLS (Edge). |
| **`referrals`** | `referrals_select_as_party` (referrer or referred); `referrals_insert_as_referred` (`referred_user_id = auth.uid()`). |
| **`saved_items`** | If **`scan_id`** exists: SELECT/INSERT/DELETE require `user_id = auth.uid()` and (`scan_id` is null or scan owned by caller). Else **user_id-only** policies (NOTICE in logs). |
| **`listing_cache`** | Replaces legacy insert policy name; **`listing_cache_insert_for_accessible_scan`** + **`listing_cache_select_for_accessible_scan`** (own scan or partner shop path, aligned with `scans`). |
| **`brand_aliases`** | Only if table exists: **`brand_aliases_select_authenticated`** (`SELECT` for authenticated). Not used in repo. |
| **`waitlist`** | Re-enables RLS; existing insert-only policies unchanged (no public `SELECT`). |

**Skipped at apply time:** `RAISE NOTICE` when `to_regclass('public.<table>')` is null — e.g. **`brand_aliases`** or **`saved_items`** if those tables were never created.

**Manual verification (SQL editor as a logged-in user)**

```sql
select auth.uid();
select count(*) from profiles;
select id, user_id from scans limit 20;
select * from referrals;
select * from saved_items;
select * from listing_cache;
select * from waitlist;  -- expect RLS denial / empty for typical roles
```

**Grants:** Migration grants **`authenticated`** where the app reads/writes; **`service_role`** bypasses RLS for Edge when **`SUPABASE_SERVICE_ROLE_KEY`** is set.

---

## 7. Dashboard UX, onboarding, settings, delete-account, scan fingerprint

| Area | Paths to sync |
|------|----------------|
| **Migration** | `supabase/migrations/20260512170000_profiles_onboarding_default_mode.sql` — `onboarding_completed`, `default_mode`, `handle_new_user` |
| **Edge** | `supabase/functions/analyse-item/index.ts` — `fingerprint`, **plan RPM (§3a)**; **`supabase/functions/delete-account/index.ts`** — **plan RPM (§3a)** |
| **Config** | `supabase/config.toml` — `[functions.delete-account] verify_jwt = true` |
| **Types** | `src/lib/scanEdgeResponse.ts` — `AnalyseItemCompletePayload` |
| **Scan** | `src/pages/scan/page.tsx`, `src/pages/scan/components/ScanResultCard.tsx` |
| **Dashboard** | `src/pages/dashboard/page.tsx`, `components/BestFlipCard.tsx`, `MonthlySummaryCard.tsx`, `BrandBreakdownChart.tsx`, `DashboardOnboardingOverlay.tsx`, `DashboardLayout.tsx` |
| **History** | `src/pages/dashboard/history/page.tsx` — `?scan=` |
| **Settings** | `src/pages/dashboard/settings/page.tsx` |
| **Auth** | `src/context/AuthContext.tsx` — `UserProfile.onboarding_completed` |

**Deploy:** `supabase functions deploy analyse-item` and **`supabase functions deploy delete-account`**. `delete-account` needs **`SUPABASE_SERVICE_ROLE_KEY`** and **`SUPABASE_ANON_KEY`**.

---

## 8. Database alerts (new signups) + `db-webhook-receiver` + scan failure streaks

| Area | Paths to sync |
|------|----------------|
| **Migration** | `supabase/migrations/20260526120000_alerts_scan_failures_webhook_settings.sql` — `scan_failure_streaks` + RPC `scan_failure_streak_record`; optional **`webhook_alert_settings`** + **`pg_net`** profile INSERT trigger when `pg_net` is already enabled |
| **Edge** | `supabase/functions/db-webhook-receiver/index.ts`; **`_shared/scanFailureStreak.ts`**; **`analyse-item`** (records hard failures when service role is configured) |
| **Config** | `supabase/config.toml` — `[functions.db-webhook-receiver] verify_jwt = false`; **`[functions.stripe-success] verify_jwt = true`** |

### New user signup → HTTP notify (Dashboard path — recommended)

Use **`public.profiles` INSERT** (fires when **`handle_new_user`** creates the profile).

1. Deploy Edge **`db-webhook-receiver`** and set secret **`DB_WEBHOOK_SECRET`** (long random string; never commit or log it).
2. Supabase Dashboard → **Integrations** / **Database** → **Database Webhooks** → **Create a new hook**.
3. **Table:** `public.profiles`. **Events:** Insert.
4. **Target URL:** `https://<project-ref>.supabase.co/functions/v1/db-webhook-receiver`.
5. **HTTP Headers:** `X-Webhook-Secret: <same value as DB_WEBHOOK_SECRET>` and `Content-Type: application/json`.
6. Optional: set **`ALERT_WEBHOOK_FORWARD_URL`** on the function to a Slack/Discord incoming webhook; the receiver forwards only `{ source, type, table }` (not full row payloads).

### Optional: `pg_net` trigger (same migration)

If **`pg_net`** is enabled (**Database → Extensions**), the migration may create **`profiles_after_insert_webhook`**. Populate targets via SQL (no secrets in git):

```sql
update public.webhook_alert_settings
set
  profile_insert_url = 'https://<project-ref>.supabase.co/functions/v1/db-webhook-receiver',
  profile_insert_secret = '<DB_WEBHOOK_SECRET>'
where id = 1;
```

If `pg_net` is not enabled, the migration emits a **NOTICE** — use the Dashboard webhook path above.

### Scan failures (repeated hard errors)

- **Definition:** `analyse-item` returns **HTTP 5xx** after the user is known (AI failure, parse failure, stream pipeline failure, or unhandled exception).
- **Storage:** `scan_failure_streaks` via RPC **`scan_failure_streak_record`** (service role only).
- **Optional HTTP notify:** **`SCAN_FAILURE_ALERT_URL`**, header secret **`SCAN_FAILURE_ALERT_SECRET`** (optional). Tunables: **`SCAN_FAILURE_ALERT_THRESHOLD`** (default `5`), **`SCAN_FAILURE_WINDOW_MINUTES`** (default `15`).

---

## 9. Edge request logging (all functions)

| Area | Paths to sync |
|------|----------------|
| **Shared** | `supabase/functions/_shared/requestLog.ts` — one JSON line per request: `req_id`, `fn`, `method`, `outcome` (`ok` / `error` / `429` / `400`), `http_status`, `user_h` (first 16 hex chars of SHA-256 of `user_id` + **`REQUEST_LOG_USER_SALT`**), `ts`, `ms`. **Never** bodies, arbitrary headers, tokens, or Stripe payloads. |
| **Functions** | All `supabase/functions/*/index.ts` use **`withRequestLog("<slug>", …)`**. |

---

## 10. Signup honeypot (frontend only)

| Area | Paths to sync |
|------|----------------|
| **Signup** | `src/pages/signup/page.tsx` — hidden `website` field; if non-empty on submit, mimic success **without** calling `signUp`. |

---

## 11. `stripe-success` security model

- **Authoritative billing:** **`stripe-webhook`** with **`Stripe-Signature`** verification remains the source of truth for `checkout.session.completed`.
- **Browser callback:** `stripe-success` requires a valid **Supabase JWT** (`verify_jwt = true` + `Authorization` + `apikey` from the SPA), validates **`session_id`** as a Stripe Checkout id (`cs_…`), **retrieves** the session with **`STRIPE_SECRET_KEY`**, then requires **`metadata.user_id ===`** resolved JWT user (and **`client_reference_id`** must match when present). This prevents applying someone else’s paid session using only a leaked `session_id` query param.
- **Checkout:** `stripe-checkout` continues to set **`metadata[user_id]`** and **`client_reference_id`**.

**Frontend:** `src/pages/scan/page.tsx` — Stripe return handler uses **`edgeFunctionAuthHeaders({ session })`** on the `fetch` to `stripe-success`.

---

## 12. PITR / backups (Dashboard only)

Not configurable from the repo. In Supabase: **Project Settings → Database** (plan-dependent): enable **Point-in-time recovery** where available and confirm **Backups** / retention for production.

---

*Last updated for handoff: **§0 Cursor + Readdy + GitHub**; §8–12 alerts, `db-webhook-receiver`, scan failure streaks, Edge request logging, signup honeypot, `stripe-success` JWT + metadata binding, PITR note; §3a Edge RPM; §7 dashboard/onboarding/settings/delete-account/fingerprint; §6 RLS hardening; §3c partner portal; §3b identification cache; scan persistence, Stripe/webhook/waitlist, scan results + dashboard + history.*
