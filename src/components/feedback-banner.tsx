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
        className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        {error}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      {notice}
    </p>
  );
}

/** Narrows a search param that may arrive as an array. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
