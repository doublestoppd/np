interface FeedbackBannerProps {
  notice?: string;
  error?: string;
}

/** Renders action feedback passed via search params after a redirect. */
export function FeedbackBanner({ notice, error }: FeedbackBannerProps) {
  if (!notice && !error) {
    return null;
  }
  if (error) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
      >
        {error}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="mb-4 rounded-control border border-success/25 bg-success-soft px-4 py-3 text-sm text-success"
    >
      {notice}
    </p>
  );
}
