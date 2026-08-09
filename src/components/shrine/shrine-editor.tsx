"use client";

import { startTransition, useActionState, useState } from "react";
import type { ShrineTheme } from "@prisma/client";
import { saveShrineAction, type ShrineSaveState } from "@/server/actions/shrine";
import {
  parseStickers,
  STICKER_LIMIT,
  STICKERS,
  themeList,
  themeStyle,
  THEMES,
} from "@/lib/shrine/themes";
import { BANNER_MAX, BODY_MAX } from "@/server/modules/shrine/config";
import { ShrinePage } from "./shrine-page";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { TextLink } from "@/components/ui/text-link";

/**
 * The editor (ADR-69).
 *
 * **It previews live.** Decorating a page through a form and then
 * navigating somewhere else to see the result is how you get pages nobody
 * finishes; every control here updates the real renderer underneath, using
 * the same component the public page uses, so what is on screen while you
 * fiddle is what a visitor gets.
 *
 * The chrome around the preview stays in the app's own design language —
 * this is a tool, and a tool that adopts the theme being edited becomes
 * unusable the moment somebody picks Terminal.
 */

const INITIAL: ShrineSaveState = { ok: false, error: null, nonce: 0 };

export interface EditorShrine {
  theme: ShrineTheme;
  banner: string;
  blink: boolean;
  body: string;
  stickers: string;
  published: boolean;
  guestbookOpen: boolean;
  visits: number;
}

export function ShrineEditor({
  shrine,
  username,
}: {
  shrine: EditorShrine;
  username: string;
}) {
  const [state, save, saving] = useActionState(saveShrineAction, INITIAL);

  const [theme, setTheme] = useState<ShrineTheme>(shrine.theme);
  const [banner, setBanner] = useState(shrine.banner);
  const [blink, setBlink] = useState(shrine.blink);
  const [body, setBody] = useState(shrine.body);
  const [published, setPublished] = useState(shrine.published);
  const [guestbookOpen, setGuestbookOpen] = useState(shrine.guestbookOpen);
  const [stickers, setStickers] = useState<string[]>(() =>
    parseStickers(shrine.stickers).map((sticker) => sticker.key),
  );

  const toggleSticker = (key: string) => {
    setStickers((current) =>
      current.includes(key)
        ? current.filter((chosen) => chosen !== key)
        : current.length >= STICKER_LIMIT
          ? current
          : [...current, key],
    );
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData();
    data.set("theme", theme);
    data.set("banner", banner);
    if (blink) data.set("blink", "on");
    data.set("body", body);
    for (const key of stickers) data.append("stickers", key);
    if (published) data.set("published", "on");
    if (guestbookOpen) data.set("guestbookOpen", "on");
    startTransition(() => save(data));
  };

  return (
    <form onSubmit={submit}>
      {state.error && (
        <InlineNotice tone="warning" className="mb-3">
          {state.error}
        </InlineNotice>
      )}
      {state.ok && state.nonce > 0 && (
        <InlineNotice tone="success" className="mb-3">
          Saved.{" "}
          {published ? (
            <TextLink href={`/u/${username}/shrine`}>
              Go and look at it
            </TextLink>
          ) : (
            <>It is still private — tick &ldquo;open to visitors&rdquo; when
            you are ready.</>
          )}
        </InlineNotice>
      )}

      {/* The preview: the real renderer, with the unsaved values. */}
      <div className="mb-5">
        <h2 className="mb-2 text-sm font-medium text-text-muted">
          What visitors see
        </h2>
        <ShrinePage
          shrine={{
            theme,
            banner,
            blink,
            body,
            stickers: stickers.join(","),
            visits: shrine.visits,
            keeper: username,
          }}
        />
      </div>

      <fieldset className="mb-5" disabled={saving}>
        <legend className="text-sm font-medium text-text">Theme</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {themeList().map(({ key, spec }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              aria-pressed={theme === key}
              className={`rounded-control border-2 p-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                theme === key ? "border-accent" : "border-border"
              }`}
            >
              {/* A swatch in the theme's own colours, so the name is not
                  the only thing to go on. */}
              <span
                className="mb-1 block h-8 rounded"
                style={{
                  ...themeStyle(key),
                  background: spec.page,
                  border: `2px solid ${spec.edge}`,
                }}
                aria-hidden="true"
              />
              <span className="font-semibold text-text">{spec.name}</span>
              <span className="mt-0.5 block text-text-muted">{spec.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-5 flex flex-col gap-3" disabled={saving}>
        <legend className="text-sm font-medium text-text">The page</legend>

        <label className="block">
          <span className="text-sm text-text">Scrolling banner</span>
          <input
            type="text"
            value={banner}
            maxLength={BANNER_MAX}
            onChange={(event) => setBanner(event.target.value)}
            placeholder="~*~ welcome to my page ~*~"
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={blink}
            onChange={(event) => setBlink(event.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-sm text-text">Make it blink</span>
        </label>

        <label className="block">
          <span className="text-sm text-text">About this page</span>
          <textarea
            value={body}
            rows={6}
            maxLength={BODY_MAX}
            onChange={(event) => setBody(event.target.value)}
            placeholder={"Tell visitors who you are.\n\nA blank line starts a new paragraph."}
            className="mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text"
          />
          <span className="text-xs text-text-muted">
            Plain text. {body.length} of {BODY_MAX}.
          </span>
        </label>
      </fieldset>

      <fieldset className="mb-5" disabled={saving}>
        <legend className="text-sm font-medium text-text">
          Stickers — up to {STICKER_LIMIT}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STICKERS.map((sticker) => {
            const chosen = stickers.includes(sticker.key);
            const full = !chosen && stickers.length >= STICKER_LIMIT;
            return (
              <button
                key={sticker.key}
                type="button"
                onClick={() => toggleSticker(sticker.key)}
                aria-pressed={chosen}
                disabled={full}
                className={`min-h-11 rounded-control border px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                  chosen
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border-strong bg-surface text-text"
                }`}
              >
                <span aria-hidden="true">{sticker.face}</span> {sticker.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mb-5 flex flex-col gap-3" disabled={saving}>
        <legend className="text-sm font-medium text-text">Visitors</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-sm text-text">
            Open to visitors — anybody can find it at /u/{username}/shrine
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={guestbookOpen}
            onChange={(event) => setGuestbookOpen(event.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-sm text-text">
            Let people sign the guestbook
          </span>
        </label>
        <p className="max-w-prose text-xs text-text-muted">
          You can remove anything anybody writes in your guestbook, whenever
          you like, without asking anybody. The theme is {THEMES[theme].name}.
        </p>
      </fieldset>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save my shrine"}
      </Button>
    </form>
  );
}
