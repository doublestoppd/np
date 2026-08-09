# Profiles and Showcases

The public profile is the game's first asynchronous social surface: it
communicates identity and long-term participation without requiring
simultaneous presence.

## Routing

- `/u/<username>/shrine` — the player's own decorated page (ADR-69).
  Public, viewable without authentication, and **404s unless its owner has
  published it** — an unpublished shrine has to be indistinguishable from
  no shrine. Edited at `/profile/shrine`.
- `/u/<username>` — public profile. Viewable **without authentication**;
  unknown usernames render the app's not-found page. Served outside the
  authenticated game shell with minimal public chrome.
- `/profile` — the signed-in player's management hub (private): account
  facts, recent activity, links to the public page and the editor, sign out.
- `/profile/edit` — authenticated editor for bio, title, featured pet, and
  showcase slots. Must work well at 360px.

## What a public profile shows

Username, chosen title text, join date, featured pet (falls back to the
oldest companion when unset), a short plain-text biography, a link to the
player's storefront when they have an open one, the player's showcase, and
the trophies they have earned. Nothing else — no email, session, or any authentication data. Public reads go through `getPublicProfile`, which
selects only public-safe fields.

**Wealth is private.** The coin balance is deliberately not shown. A
public number that only goes up turns the profile into a scoreboard and
invites the comparison the design philosophy rules out; it also tells
anyone browsing which accounts are worth targeting. Players see their own
balance everywhere they need it, and `getPublicProfile` does not select
the column at all — so the value cannot reach a public page by accident.

## The Shrine is not the profile (ADR-69)

The profile is uniform for everybody: the same layout, the same palette,
the same restrained chrome. That consistency is right for a page whose job
is to communicate identity at a glance, and it is exactly why it is not
the place to let people decorate.

The Shrine is the other half — a second page, deliberately garish, themed
by its owner, with a scrolling banner, a sticker wall, a visitor counter
and a guestbook. Every style rule it uses is scoped under `.shrine` and
driven by CSS custom properties, so the two never contaminate each other.

It also carries a theme tune, falling snow or leaves, and — if its owner
joins — a webring strip (ADR-70). `/ring` is the ring's front door and
deliberately lists nobody: it counts the members and sends you to a random
one, because a directory with any sort order becomes a leaderboard.

Note that the counter here is a deliberate exception to the argument the
Hollow makes against visit counts; see ADR-69 for why it was overridden
and why it cannot be farmed.

## Three distinct concepts (do not blur them)

1. **Prestige** — outwardly visible signals of participation and
   accomplishment (join date, a featured companion, trophies, and a place
   on a game's daily top three — ADR-67). Earned, not bought. Wealth is not one of them: the coin balance stays private,
   see above. Neither is a pet level: companions do not have one
   (ADR-27).
2. **Showcase** — a bounded set of slots (currently 6) in which a player
   displays *whatever owned items they choose*, in an order they choose.
   The UI calls it "On display". It is presentation, chosen by the player.
3. **Developer-defined collections — prohibited.** There is no Collection
   model, no checklist, no completion percentage, no "3 of 8 river items"
   messaging, no set bonuses, no collection rewards. Tags and categories
   describe items; they never score a player's holdings. If a feature idea
   needs the game to say what a "complete" anything looks like, it violates
   the design philosophy.

## Trophies (ADR-65)

One per activity, hard to earn, and recognition only — no coins, no items,
no unlocks. A trophy is a name, a sentence saying exactly what it takes,
and a date.

- **Public profile: earned only.** A stranger's profile answers "what have
  they done", not "what have they failed to do". `getPublicTrophyCase`
  returns an empty `unearned` list rather than omitting the field, so a
  component cannot render the second by accident. A presentation choice
  rather than a privacy rule — ADR-67 withdrew the rule that once made it
  one.
- **Own profile: earned and unearned.** A player is shown what else there
  is, with the criteria spelled out, so they can decide they do not care
  about a trophy — which they are entitled to do.
- **Any trophy opens**, on either profile, and says what it takes and when
  it was earned if it was.
- **Never counted.** No "18 of 27", no percentage, no progress bar. That
  would be the prohibited checklist below wearing a different hat.
- **Nothing expires**, and there is not one streak in the catalogue.

Trophies are the third concept below — prestige — and they are the reason
the phrase "future accomplishment surfaces" is no longer needed there.
They are NOT a collection: they record things done, they never score a
player's holdings, and nothing in the game says what a "complete" trophy
case looks like.

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

## The Hollow

A player's Hollow (`/hollow`, publicly `/u/<name>/hollow`) is the third
presentation surface, and it follows the same rules as the showcase with
one difference worth stating: a showcase is a *list* of things owned, and a
Hollow is an *arrangement* of them.

- The public view shows the pictures, the player's captions (≤ 120 chars,
  plain text, validated like the bio), and the names of what is standing
  there. Nothing else.
- No visit counter — not even for the owner — no likes, ratings, comments,
  guestbook, ranking, or featured list. A featured list is a competition
  wearing a compliment's clothes.
- No total, percentage, "n of m", set, set bonus, or rarity tier anywhere
  in the Hollow or its catalogue, for the same reason no Collection model
  exists. The view models have nowhere to put those numbers and tests pin
  their key sets.
- The link to somebody's Hollow is shown unconditionally, furnished or not:
  hiding it for sparse Hollows would quietly rank people by spending.

Design rationale and the full rule set are in ADR-39.

## Out of scope this phase

Likes, comments, guestbooks, followers, direct messages, clubs, gifting,
trading, and any completion or set language anywhere in the UI.
