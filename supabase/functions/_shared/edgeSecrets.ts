/**
 * Centralised Edge Function secret reads (Deno.env only — never hard-code keys).
 * Logs once per isolate cold start so deploys can verify secrets loaded.
 */

export type EdgeSecretDiag = {
  present: boolean;
  /** Which env var supplied the value (if any). */
  source: string | null;
  /** First 8 characters for deploy verification — never log full keys. */
  prefix8: string;
  length: number;
};

function cleanSecret(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  // Dashboard paste often wraps values in quotes.
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function readFirstSecret(names: readonly string[]): { value: string; source: string | null } {
  for (const name of names) {
    const value = cleanSecret(Deno.env.get(name));
    if (value) return { value, source: name };
  }
  return { value: "", source: null };
}

function diag(names: readonly string[]): EdgeSecretDiag {
  const { value, source } = readFirstSecret(names);
  return {
    present: value.length > 0,
    source,
    prefix8: value.length > 0 ? value.slice(0, 8) : "",
    length: value.length,
  };
}

const SCRAPINGBEE_ENV_NAMES = ["SCRAPINGBEE_API_KEY", "SCRAPINGBEE_KEY"] as const;
const EBAY_APP_ID_ENV_NAMES = ["EBAY_APP_ID", "EBAY_FINDING_APP_ID"] as const;
const EBAY_CERT_ID_ENV_NAMES = ["EBAY_CERT_ID", "EBAY_CERT_SECRET"] as const;
const ANTHROPIC_ENV_NAMES = ["ANTHROPIC_API_KEY"] as const;
const IMGBB_ENV_NAMES = ["IMGBB_API_KEY", "IMGBB_KEY"] as const;

let startupLogged = false;

/** Log secret presence once per edge isolate (prefix only). */
export function logEdgeSecretsAtStartup(fn = "edge"): void {
  if (startupLogged) return;
  startupLogged = true;

  const scrapingbee = diag(SCRAPINGBEE_ENV_NAMES);
  const ebayApp = diag(EBAY_APP_ID_ENV_NAMES);
  const ebayCert = diag(EBAY_CERT_ID_ENV_NAMES);
  const anthropic = diag(ANTHROPIC_ENV_NAMES);
  const imgbb = diag(IMGBB_ENV_NAMES);

  console.log(
    `[edge-secrets] ${fn} startup`,
    JSON.stringify({
      ebay_app: {
        present: ebayApp.present,
        source: ebayApp.source,
        prefix8: ebayApp.prefix8,
        length: ebayApp.length,
        checked: [...EBAY_APP_ID_ENV_NAMES],
      },
      ebay_cert: {
        present: ebayCert.present,
        source: ebayCert.source,
        length: ebayCert.length,
        checked: [...EBAY_CERT_ID_ENV_NAMES],
      },
      scrapingbee: {
        present: scrapingbee.present,
        source: scrapingbee.source,
        prefix8: scrapingbee.prefix8,
        length: scrapingbee.length,
        checked: [...SCRAPINGBEE_ENV_NAMES],
      },
      anthropic: {
        present: anthropic.present,
        source: anthropic.source,
        prefix8: anthropic.prefix8,
        length: anthropic.length,
      },
      imgbb: {
        present: imgbb.present,
        source: imgbb.source,
        prefix8: imgbb.prefix8,
        length: imgbb.length,
        checked: [...IMGBB_ENV_NAMES],
      },
    }),
  );
}

export function scrapingBeeKeyDiag(): EdgeSecretDiag {
  return diag(SCRAPINGBEE_ENV_NAMES);
}

/** Prefer SCRAPINGBEE_API_KEY (Supabase secret name) then SCRAPINGBEE_KEY. */
export function scrapingBeeKey(): string {
  return readFirstSecret(SCRAPINGBEE_ENV_NAMES).value;
}

export function scrapingBeeKeyRequired(): string {
  const { value, source } = readFirstSecret(SCRAPINGBEE_ENV_NAMES);
  if (!value) {
    throw new Error(
      "SCRAPINGBEE_API_KEY missing — set it in Supabase Edge Function secrets",
    );
  }
  return value;
}

export function scrapingBeeKeySource(): string | null {
  return readFirstSecret(SCRAPINGBEE_ENV_NAMES).source;
}

export function ebayAppIdDiag(): EdgeSecretDiag {
  return diag(EBAY_APP_ID_ENV_NAMES);
}

/** eBay App ID (client id) — used for Browse API OAuth. */
export function ebayAppId(): string {
  return readFirstSecret(EBAY_APP_ID_ENV_NAMES).value;
}

export function ebayCertIdDiag(): EdgeSecretDiag {
  return diag(EBAY_CERT_ID_ENV_NAMES);
}

/** eBay Cert ID (client secret) — pairs with EBAY_APP_ID for Browse API OAuth. */
export function ebayCertId(): string {
  return readFirstSecret(EBAY_CERT_ID_ENV_NAMES).value;
}

export function anthropicKey(): string {
  const k = readFirstSecret(ANTHROPIC_ENV_NAMES).value;
  if (!k) throw new Error("ANTHROPIC_API_KEY missing — set it in Edge Function secrets");
  return k;
}

export function anthropicKeyOptional(): string {
  return readFirstSecret(ANTHROPIC_ENV_NAMES).value;
}

export function imgbbKey(): string {
  return readFirstSecret(IMGBB_ENV_NAMES).value;
}

logEdgeSecretsAtStartup("shared");
