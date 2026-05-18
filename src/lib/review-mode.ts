export const REVIEW_MODE_COOKIE = "arkon_review_mode";
export const REVIEW_MODE_QUERY_PARAM = "review";
export const REVIEW_MODE_QUERY_VALUE = "1";

export function canUseReviewMode() {
  return process.env.NODE_ENV === "development";
}

export function hasReviewModeCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${REVIEW_MODE_COOKIE}=1`);
}

export function hasReviewModeQuery(url: URL) {
  return url.searchParams.get(REVIEW_MODE_QUERY_PARAM) === REVIEW_MODE_QUERY_VALUE;
}

export function isReviewModeActive(cookieHeader: string | null | undefined, url?: URL) {
  if (!canUseReviewMode()) return false;
  return hasReviewModeCookie(cookieHeader) || (url ? hasReviewModeQuery(url) : false);
}

export function isReviewModeActiveInBrowser() {
  if (!canUseReviewMode() || typeof document === "undefined") return false;
  return hasReviewModeCookie(document.cookie);
}
