# Run on YOUR machine (requires Node + Supabase CLI on PATH).
# 1) Install: https://supabase.com/docs/guides/cli
# 2) From repo root: supabase login && supabase link --project-ref nuvizoiozourydaqwvqp
# 3) Run this script: powershell -ExecutionPolicy Bypass -File .\scripts\push-supabase-marginn.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host "Supabase CLI not found. Install from https://supabase.com/docs/guides/cli then re-run." -ForegroundColor Red
  exit 1
}

Write-Host "Applying migrations (db push)..." -ForegroundColor Cyan
supabase db push

$functions = @(
  "analyse-item",
  "authenticate-item",
  "delete-account",
  "stripe-checkout",
  "stripe-success",
  "stripe-cancel",
  "stripe-webhook",
  "db-webhook-receiver"
)

foreach ($fn in $functions) {
  Write-Host "Deploying $fn..." -ForegroundColor Cyan
  supabase functions deploy $fn
}

Write-Host "Done. Confirm secrets in Dashboard (SUPABASE_SERVICE_ROLE_KEY, STRIPE_*, DB_WEBHOOK_SECRET, EDGE_EXTRA_ALLOWED_ORIGINS if needed)." -ForegroundColor Green
