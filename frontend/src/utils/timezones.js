/** Fallback when Intl.supportedValuesOf('timeZone') is unavailable */
const FALLBACK_IANA_ZONES = [
  'UTC',
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
];

/**
 * Sorted list of IANA time zones for `<select>` options.
 */
export function getIanaTimeZoneIds() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').sort((a, b) => a.localeCompare(b));
    }
  } catch {
    // ignore
  }
  return [...FALLBACK_IANA_ZONES].sort((a, b) => a.localeCompare(b));
}

/**
 * Build option list: all standard zones, plus `currentValue` if it is not in the list (e.g. legacy DB value).
 */
export function getTimeZoneOptionsForValue(currentValue) {
  const zones = getIanaTimeZoneIds();
  if (!currentValue) return zones;
  if (zones.includes(currentValue)) return zones;
  return [...zones, currentValue].sort((a, b) => a.localeCompare(b));
}
