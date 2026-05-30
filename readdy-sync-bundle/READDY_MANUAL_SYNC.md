# Get Marginn changes into Readdy (no GitHub)

Readdy’s **GitHub** integration is optional. Your full app code lives in **`d:\Marginn\project`**. Use the **Code** tab in Readdy to replace/create files, or work from the export bundle below.

---

## Step 1 — Export a copy from your PC

In PowerShell:

```powershell
cd d:\Marginn\project
powershell -ExecutionPolicy Bypass -File .\scripts\export-readdy-bundle.ps1
```

This creates **`readdy-sync-bundle.zip`** on your Desktop (or `d:\Marginn\project\readdy-sync-bundle\`).

Unzip it on a second monitor. For each file, open the same path in **Readdy → Code → File Explorer** and paste/replace the full contents. **Save** in Readdy (preview should refresh).

---

## Step 2 — Files you must add or replace

### Modified (replace entire file in Readdy)

| Path | Why |
|------|-----|
| `src/lib/scanEdgeResponse.ts` | `finding_api`, pipeline types, NDJSON errors |
| `src/lib/pipelineDiagnostics.ts` | **NEW** — E-/U- codes, scan error messages |
| `src/lib/ensureScanPersisted.ts` | **NEW** — scan history saved to `scans` table |
| `src/lib/authUserId.ts` | **NEW** if missing — correct `user_id` for history queries |
| `src/pages/scan/page.tsx` | Scan persist, pipeline errors, trust fields |
| `src/pages/scan/components/ScanResultCard.tsx` | Manual browse, `finding_api` label, system warnings |
| `src/pages/dashboard/components/NewScanSection.tsx` | Pipeline error display |
| `src/pages/dashboard/page.tsx` | History refresh after scan (`marginn:scan-saved`) |
| `src/pages/dashboard/history/page.tsx` | History refresh + load error toast |
| `src/pages/scan/components/FlipScoreMeter.tsx` *(new — create if missing)* |
| `src/pages/scan/components/PreScanChecklist.tsx` *(new)* |
| `src/pages/share/scan-page.tsx` *(new folder `share`)* |
| `src/pages/dashboard/history/components/ScanDetailModal.tsx` |
| `src/pages/dashboard/history/components/ScanOutcomeDialogs.tsx` *(new)* |
| `src/pages/dashboard/components/NewScanSection.tsx` |
| `src/pages/dashboard/components/BrandPerformanceCard.tsx` *(new)* |
| `src/router/config.tsx` |
| `src/lib/scanEconomics.ts` *(new)* |
| `src/lib/scanListingInsights.ts` *(new)* |
| `src/lib/brandSizeSensitivity.ts` *(new)* |
| `src/lib/scanBrandAggregates.ts` *(new)* |
| `src/lib/scanProfit.ts` *(new)* |
| `src/lib/scanWatchlistAlerts.ts` *(new)* |
| `src/lib/watchlistConstants.ts` *(new)* |
| `src/types/scans.ts` *(new)* |

Readdy’s editor usually **does not** include `supabase/functions/` or SQL migrations. Those stay on **Supabase** (see Step 4).

### If Readdy project is missing imports

After pasting, if the preview errors on missing modules, ensure every **new** file above exists. Check the browser **Console** in Readdy (Ctrl+Shift+I) for “Cannot find module …”.

---

## Step 3 — Environment variables in Readdy

**Project settings → Environment** (names must match Vite):

```env
VITE_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Optional: `VITE_PUBLIC_COMING_SOON=true`, `VITE_AUTH_ALLOWLIST_OFF=true`

**Do not** put Stripe, Anthropic, ScrapingBee, or eBay keys in Readdy — only in **Supabase Edge secrets**.

---

## Step 4 — Supabase (required for scans to work)

Readdy hosts the **frontend only**. Run on your PC (Supabase CLI linked to project `nuvizoiozourydaqwvqp`):

```powershell
cd d:\Marginn\project
supabase db push
supabase functions deploy analyse-item
```

Apply these SQL files if you don’t use CLI (Dashboard → SQL Editor, in order):

1. `supabase/migrations/20260514120000_scan_watchlist_and_outcomes.sql`
2. `supabase/migrations/20260514120100_scans_flip_score.sql`
3. `supabase/migrations/20260528120000_scans_share_token.sql`

Edge file to deploy (not in Readdy): `supabase/functions/analyse-item/index.ts` + `supabase/functions/_shared/flipScore.ts` + `identificationCache.ts`.

Set **`EDGE_EXTRA_ALLOWED_ORIGINS`** in Supabase to your Readdy preview URL and production domain.

---

## Step 5 — Publish in Readdy

**Publish / Update** after all files save and preview loads without console errors.

---

## GitHub (backup — works even if Readdy won’t connect)

```powershell
cd d:\Marginn\project
git add -A
git commit -m "Marginn: scan UX, flip score, trust, watchlist, share"
git push origin main
```

Use **Vercel** or another host with GitHub import if Readdy GitHub stays broken.

---

## Fix Readdy ↔ GitHub (optional)

1. Readdy → **Tools → GitHub** → **Reconnect** (project **Owner** only).
2. On GitHub: **Settings → Applications → Readdy** — reinstall app, grant **JaedanH/Marginn**.
3. If org repo: admin must approve third-party app / SSO.
4. In Readdy: **Pull** from `main` after a successful `git push` from your PC.

Support: [hi@readdy.ai](mailto:hi@readdy.ai) with “GitHub connect fails” + screenshot.
