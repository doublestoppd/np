import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { countVisit, ensureShrine, getPublicShrine, saveShrine } from "./shrine";
import {
  getGuestbook,
  hideGuestbookEntry,
  signGuestbook,
} from "./guestbook";
import { ShrineError } from "./errors";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

/**
 * A player's Shrine (ADR-69).
 *
 * Three things carry real weight here and the rest is decoration:
 *
 * 1. **Nothing unpublished is visible.** A half-built page must be
 *    indistinguishable from no page at all.
 * 2. **The owner can always clear their own guestbook**, and nobody else
 *    can clear it for them unless they are a moderator. This is what makes
 *    it safe to give strangers a text box on somebody's page.
 * 3. **The counter cannot be inflated by reloading**, which is the one
 *    thing every counter of this kind got wrong.
 */

const prefix = fixturePrefix("shrine");

describe.skipIf(!testDb)("the shrine (integration)", () => {
  const db = testDb as PrismaClient;
  let ownerId: string;
  let ownerName: string;
  let visitorId: string;

  beforeEach(async () => {
    const owner = await createTestUser(db, {
      username: `${prefix}_${randomUUID().slice(0, 8)}`,
    });
    ownerId = owner.id;
    ownerName = owner.username;
    visitorId = (
      await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 8)}`,
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  const draft = (over: Partial<Parameters<typeof saveShrine>[1]["draft"]> = {}) => ({
    theme: "TERMINAL" as const,
    banner: "welcome",
    blink: false,
    body: "hello",
    stickers: ["construction"],
    published: true,
    guestbookOpen: true,
    ...over,
  });

  it("makes a shrine on first ask and reuses it after", async () => {
    const first = await ensureShrine(db, ownerId);
    const second = await ensureShrine(db, ownerId);
    expect(second.id).toBe(first.id);
    expect(first.published).toBe(false);
  });

  it("saves what the player chose, and only what the catalogue allows", async () => {
    await saveShrine(db, {
      userId: ownerId,
      draft: draft({ stickers: ["construction", "not-a-sticker", "moon"] }),
    });
    const saved = await ensureShrine(db, ownerId);
    expect(saved.theme).toBe("TERMINAL");
    // The bogus key is dropped by the domain even though the action would
    // have accepted the string — two independent chances to catch it.
    expect(saved.stickers).toBe("construction,moon");
  });

  it("hides an unpublished shrine from everybody but its owner", async () => {
    await saveShrine(db, { userId: ownerId, draft: draft({ published: false }) });
    expect(await getPublicShrine(db, { username: ownerName })).toBeNull();

    await saveShrine(db, { userId: ownerId, draft: draft({ published: true }) });
    expect(await getPublicShrine(db, { username: ownerName })).not.toBeNull();
  });

  it("finds it however the username is cased", async () => {
    await saveShrine(db, { userId: ownerId, draft: draft() });
    const found = await getPublicShrine(db, {
      username: ownerName.toUpperCase(),
    });
    expect(found).not.toBeNull();
  });

  describe("the counter", () => {
    it("counts one visit per viewer per day, however many times they look", async () => {
      const shrine = await ensureShrine(db, ownerId);
      expect(
        await countVisit(db, { shrineId: shrine.id, viewerKey: visitorId }),
      ).toBe(true);
      // The refresh that every counter of this kind was ruined by.
      expect(
        await countVisit(db, { shrineId: shrine.id, viewerKey: visitorId }),
      ).toBe(false);
      expect(
        await countVisit(db, { shrineId: shrine.id, viewerKey: visitorId }),
      ).toBe(false);

      const after = await ensureShrine(db, ownerId);
      expect(after.visits).toBe(1);
    });

    it("counts different viewers separately", async () => {
      const shrine = await ensureShrine(db, ownerId);
      await countVisit(db, { shrineId: shrine.id, viewerKey: "one" });
      await countVisit(db, { shrineId: shrine.id, viewerKey: "two" });
      expect((await ensureShrine(db, ownerId)).visits).toBe(2);
    });
  });

  describe("the guestbook", () => {
    async function open() {
      await saveShrine(db, { userId: ownerId, draft: draft() });
      return ensureShrine(db, ownerId);
    }

    it("takes a signature and shows it", async () => {
      const shrine = await open();
      await signGuestbook(db, {
        shrineId: shrine.id,
        authorId: visitorId,
        body: "  nice page  ",
      });
      const entries = await getGuestbook(db, {
        shrineId: shrine.id,
        viewerId: visitorId,
        viewerRole: "PLAYER",
        ownerId,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.body).toBe("nice page");
      // A visitor cannot remove somebody else's note from a page that is
      // not theirs.
      expect(entries[0]?.canRemove).toBe(false);
    });

    it("refuses an unpublished page, a closed book, and the owner", async () => {
      const shrine = await ensureShrine(db, ownerId);
      await saveShrine(db, {
        userId: ownerId,
        draft: draft({ published: false }),
      });
      await expect(
        signGuestbook(db, {
          shrineId: shrine.id,
          authorId: visitorId,
          body: "hello",
        }),
      ).rejects.toThrow(ShrineError);

      await saveShrine(db, {
        userId: ownerId,
        draft: draft({ guestbookOpen: false }),
      });
      await expect(
        signGuestbook(db, {
          shrineId: shrine.id,
          authorId: visitorId,
          body: "hello",
        }),
      ).rejects.toThrow(ShrineError);

      await saveShrine(db, { userId: ownerId, draft: draft() });
      await expect(
        signGuestbook(db, {
          shrineId: shrine.id,
          authorId: ownerId,
          body: "hello",
        }),
      ).rejects.toThrow(ShrineError);
    });

    it("refuses a signature that is only whitespace", async () => {
      const shrine = await open();
      await expect(
        signGuestbook(db, {
          shrineId: shrine.id,
          authorId: visitorId,
          body: "   \n  ",
        }),
      ).rejects.toThrow(ShrineError);
    });

    it("lets the owner take anything down, and nobody else", async () => {
      const shrine = await open();
      const entry = await signGuestbook(db, {
        shrineId: shrine.id,
        authorId: visitorId,
        body: "something unwelcome",
      });

      // A third party cannot, even though the note is on a public page.
      const stranger = await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 8)}`,
      });
      await expect(
        hideGuestbookEntry(db, {
          entryId: entry.id,
          actorId: stranger.id,
          actorRole: "PLAYER",
        }),
      ).rejects.toThrow(ShrineError);

      // Not even its own author — removing it is the page owner's call,
      // and an author who could unsay things could delete the evidence.
      await expect(
        hideGuestbookEntry(db, {
          entryId: entry.id,
          actorId: visitorId,
          actorRole: "PLAYER",
        }),
      ).rejects.toThrow(ShrineError);

      await hideGuestbookEntry(db, {
        entryId: entry.id,
        actorId: ownerId,
        actorRole: "PLAYER",
      });
      const left = await getGuestbook(db, {
        shrineId: shrine.id,
        viewerId: ownerId,
        viewerRole: "PLAYER",
        ownerId,
      });
      expect(left).toHaveLength(0);
    });

    it("lets a moderator take one down on somebody else's page", async () => {
      const shrine = await open();
      const entry = await signGuestbook(db, {
        shrineId: shrine.id,
        authorId: visitorId,
        body: "moderate me",
      });
      const moderator = await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 8)}`,
      });
      await hideGuestbookEntry(db, {
        entryId: entry.id,
        actorId: moderator.id,
        actorRole: "MODERATOR",
      });
      expect(
        await getGuestbook(db, {
          shrineId: shrine.id,
          viewerId: null,
          viewerRole: null,
          ownerId,
        }),
      ).toHaveLength(0);
    });

    it("keeps a hidden entry rather than deleting it", async () => {
      const shrine = await open();
      const entry = await signGuestbook(db, {
        shrineId: shrine.id,
        authorId: visitorId,
        body: "kept for the record",
      });
      await hideGuestbookEntry(db, {
        entryId: entry.id,
        actorId: ownerId,
        actorRole: "PLAYER",
      });
      // Still there, still readable by anybody looking at the table — the
      // owner sweeping their page must not destroy what a moderator would
      // need to see.
      const row = await db.shrineGuestbookEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(row.hidden).toBe(true);
      expect(row.body).toBe("kept for the record");
      expect(row.hiddenById).toBe(ownerId);
    });

    it("refuses to hide the same entry twice", async () => {
      const shrine = await open();
      const entry = await signGuestbook(db, {
        shrineId: shrine.id,
        authorId: visitorId,
        body: "once",
      });
      await hideGuestbookEntry(db, {
        entryId: entry.id,
        actorId: ownerId,
        actorRole: "PLAYER",
      });
      // The guard is in the `where`, so a double submit is refused rather
      // than silently restamping who hid it and when.
      await expect(
        hideGuestbookEntry(db, {
          entryId: entry.id,
          actorId: ownerId,
          actorRole: "PLAYER",
        }),
      ).rejects.toThrow(ShrineError);
    });
  });
});
