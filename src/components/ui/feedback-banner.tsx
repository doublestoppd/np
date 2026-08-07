import { InlineNotice } from "./inline-notice";
import { FeedbackFocus } from "./feedback-focus";

interface FeedbackBannerProps {
  notice?: string;
  error?: string;
}

/** Longest message any action produces, with room to spare. */
const MAX_LENGTH = 160;

/**
 * Anything that could carry a player somewhere else: a URL scheme, a bare
 * host, an @-handle, or an email address. React escapes the value, so
 * this is not about markup — it is about the sentence. The scheme list is
 * explicit rather than "any word followed by a colon", so a real message
 * like "Reward: 40 coins" is never mistaken for one.
 */
const OFF_SITE =
  /(?:\b(?:https?|ftp|file|data|javascript|vbscript):|\/\/|\bwww\.|@|\b[a-z0-9-]+\.(?:com|net|org|io|co|xyz|app|dev|ru|cn|info|link|click|top|live|site|online)\b)/i;

/**
 * Cleans a redirect message before it is rendered.
 *
 * The value arrives in a search param, so anyone can put a sentence of
 * their choosing inside the app's own success or error chrome by sending
 * a link — `/inventory?error=Your+account+is+locked,+verify+at+…`. That is
 * not XSS (React escapes it) but it is a credible phishing primitive on a
 * same-origin page the player already trusts.
 *
 * Every message the app itself produces is a short sentence with no link
 * in it, so refusing anything longer, and anything that names a
 * destination, costs the real messages nothing and takes the useful half
 * of the payload away.
 */
export function sanitizeFeedback(message: string | undefined): string | null {
  if (!message) {
    return null;
  }
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (
    collapsed.length === 0 ||
    collapsed.length > MAX_LENGTH ||
    OFF_SITE.test(collapsed)
  ) {
    return null;
  }
  return collapsed;
}

/**
 * Renders action feedback passed via search params after a redirect —
 * a thin adapter over InlineNotice so redirect feedback and inline
 * feedback share one visual language.
 *
 * The message takes focus when it appears (see FeedbackFocus). Keyed by
 * its own text so that doing the same thing twice — two feeds, two
 * forages — remounts and lands again rather than sitting there silently.
 */
export function FeedbackBanner({ notice, error }: FeedbackBannerProps) {
  const safeError = sanitizeFeedback(error);
  const safeNotice = sanitizeFeedback(notice);
  if (safeError) {
    return (
      <FeedbackFocus key={`e:${safeError}`}>
        <InlineNotice tone="error" className="mb-4">
          {safeError}
        </InlineNotice>
      </FeedbackFocus>
    );
  }
  if (safeNotice) {
    return (
      <FeedbackFocus key={`n:${safeNotice}`}>
        <InlineNotice tone="success" className="mb-4">
          {safeNotice}
        </InlineNotice>
      </FeedbackFocus>
    );
  }
  return null;
}
