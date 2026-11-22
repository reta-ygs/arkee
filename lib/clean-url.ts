const DEFAULT_TRACKING_PARAMS = new Set([
  // UTM
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_cid',
  'utm_reader',
  'utm_name',
  'utm_social',
  'utm_social-type',
  // Ad / social click IDs
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'si',
  // Newsletter / email / misc
  'mc_cid',
  'mc_eid',
  'oly_anon_id',
  'oly_enc_id',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  'vero_id',
  'mkt_tok',
  'ref_src',
  'ref_url',
  'spm',
]);

const TRACKING_PREFIXES = ['utm_', 'mtm_', 'pk_'];

export function cleanUrl(
  rawUrl: string,
  options: { enabled?: boolean; extraStripParams?: string[] } = {},
): { url: string; changed: boolean } {
  const enabled = options.enabled ?? true;
  if (!enabled) {
    return { url: rawUrl, changed: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, changed: false };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: rawUrl, changed: false };
  }

  const extra = new Set(
    (options.extraStripParams ?? [])
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  );

  let changed = false;
  const keysToDelete: string[] = [];

  for (const key of parsed.searchParams.keys()) {
    const lower = key.toLowerCase();
    const isDefault = DEFAULT_TRACKING_PARAMS.has(lower);
    const isPrefix = TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
    const isExtra = extra.has(lower);

    if (isDefault || isPrefix || isExtra) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    parsed.searchParams.delete(key);
    changed = true;
  }

  return {
    url: changed ? parsed.toString() : rawUrl,
    changed,
  };
}
