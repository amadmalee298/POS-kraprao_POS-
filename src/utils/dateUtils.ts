/**
 * Date and Time Utilities for Kaprao POS Enterprise
 * Ensures consistent, timezone-accurate local date comparisons (Thailand UTC+7 / local browser)
 * avoiding UTC midnight shift bugs where orders disappear across midnight/morning hours.
 */

/**
 * Converts a Date object, ISO string, or timestamp into a local YYYY-MM-DD string
 */
export const getLocalDateStr = (d?: string | Date | number | null): string => {
  if (!d) return '';
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Converts a Date object, ISO string, or timestamp into a local YYYY-MM string
 */
export const getLocalMonthStr = (d?: string | Date | number | null): string => {
  if (!d) return '';
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/**
 * Checks if two date representations point to the same local calendar day
 */
export const isSameDayLocal = (
  dateA?: string | Date | number | null,
  dateB?: string | Date | number | null
): boolean => {
  if (!dateA || !dateB) return false;
  const strA = getLocalDateStr(dateA);
  const strB = getLocalDateStr(dateB);
  return strA !== '' && strA === strB;
};

/**
 * Checks if a date falls within the specified local YYYY-MM
 */
export const isSameMonthLocal = (
  dateOrIso?: string | Date | number | null,
  targetMonthStr?: string
): boolean => {
  if (!dateOrIso || !targetMonthStr) return false;
  const mStr = getLocalMonthStr(dateOrIso);
  return mStr !== '' && mStr === targetMonthStr;
};

/**
 * Checks if a date falls within the inclusive range [startDateStr, endDateStr] in local time
 */
export const isDateInRangeLocal = (
  dateOrIso?: string | Date | number | null,
  startDateStr?: string,
  endDateStr?: string
): boolean => {
  if (!dateOrIso) return false;
  const dStr = getLocalDateStr(dateOrIso);
  if (!dStr) return false;
  if (startDateStr && dStr < startDateStr) return false;
  if (endDateStr && dStr > endDateStr) return false;
  return true;
};
