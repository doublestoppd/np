import { InlineNotice } from "./inline-notice";

interface FeedbackBannerProps {
  notice?: string;
  error?: string;
}

/**
 * Renders action feedback passed via search params after a redirect —
 * a thin adapter over InlineNotice so redirect feedback and inline
 * feedback share one visual language.
 */
export function FeedbackBanner({ notice, error }: FeedbackBannerProps) {
  if (!notice && !error) {
    return null;
  }
  if (error) {
    return (
      <InlineNotice tone="error" className="mb-4">
        {error}
      </InlineNotice>
    );
  }
  return (
    <InlineNotice tone="success" className="mb-4">
      {notice}
    </InlineNotice>
  );
}
