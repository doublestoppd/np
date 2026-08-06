# Profiles and Showcases

The public profile is the game's first asynchronous social surface: it
communicates identity and long-term participation without requiring
simultaneous presence.

## Routing

- `/u/<username>` — public profile. Viewable **without authentication**;
  unknown usernames render the app's not-found page. Served outside the
  authenticated game shell with minimal public chrome.
- `/profile` — the signed-in player's management hub (private): account
  facts, recent activity, links to the public page and the editor, sign out.
- `/profile/edit` — authenticated editor for bio, title, featured pet, and
  showcase slots. Must work well at 360px.

## What a public profile shows

Username, chosen title text, join date, featured pet (falls back to the
oldest companion when unset), a short plain-text biography, and the
player's showcase. Nothing else — no email, session, or any
authentication data. Public reads go through `getPublicProfile`, which
selects only public-safe fields.

**Wealth is private.** The coin balance is deliberately not shown. A
public number that only goes up turns the profile into a scoreboard and
invites the comparison the design philosophy rules out; it also tells
anyone browsing which accounts are worth targeting. Players see their own
balance everywhere they need it, and `getPublicProfile` does not select
the column at all — so the value cannot reach a public page by accident.

## Three distinct concepts (do not blur them)

1. **Prestige** — outwardly visible signals of participation and
   accomplishment (join date, a featured companion, and future
   accomplishment surfaces). Earned, not bought. Wealth is not one of
   them: the coin balance stays private, see above. Neither is a pet
   level: companions do not have one (ADR-27).
2. **Showcase** — a bounded set of slots (currently 6) in which a player
   displays *whatever owned items they choose*, in an order they choose.
   The UI calls it "On display". It is presentation, chosen by the player.
3. **Developer-defined collections — prohibited.** There is no Collection
   model, no checklist, no completion percentage, no "3 of 8 river items"
   messaging, no set bonuses, no collection rewards. Tags and categories
   describe items; they never score a player's holdings. If a feature idea
   needs the game to say what a "complete" anything looks like, it violates
   the design philosophy.

## Showcase rules

- Slots are bounded (`SHOWCASE_MAX = 6`) and ordered (`position`).
- Entries are **references** (`userId`, `itemId`, `position`) — item data is
  never duplicated. An item can appear at most once per showcase (DB unique).
- A player may showcase an item only while they own at least one copy;
  ownership is checked server-side inside the same transaction that writes
  the entry.
- **Stale ownership policy (decided for this phase):** if the last owned
  copy of a showcased item is later consumed (or, in the future,
  transferred), the entry is *hidden from all reads* immediately —
  public profiles and the editor only display entries whose owned quantity
  is still positive — and physically *pruned on the player's next showcase
  edit*. Stale references therefore can never crash or falsify a profile.
- Featured pet uses a dedicated `Profile.featuredPetId` column (not the
  showcase model); ownership is validated on write and on read.

## Safety

- All editable text (bio ≤ 300 chars, title ≤ 60 chars, single-line) is
  validated with Zod, stored as plain text, and rendered as plain text
  (React escaping; newlines only in bio via `whitespace-pre-line`).
  No HTML, Markdown, custom CSS, or scriptable profile content.
- Control characters are rejected at validation.
- Every profile/showcase mutation authenticates the session, authorizes
  ownership server-side, and never trusts client-supplied ownership or
  economy data.

## Out of scope this phase

Likes, comments, guestbooks, followers, direct messages, clubs, gifting,
trading, and any completion or set language anywhere in the UI.
