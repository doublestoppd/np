/** Fixed-clock tests for the canonical UTC game day. */
import { describe, expect, it } from "vitest";
import { FixedClock } from "@test/helpers/clock";
import {
  addGameDays,
  assertGameDate,
  currentGameDate,
  gameDateFor,
  isGameDate,
  nextGameDateStart,
  startOfGameDate,
} from "./game-day";

describe("game day (UTC)", () => {
  it("changes exactly at 00:00 UTC", () => {
    expect(gameDateFor(new Date("2026-08-06T23:59:59.999Z"))).toBe("2026-08-06");
    expect(gameDateFor(new Date("2026-08-07T00:00:00.000Z"))).toBe("2026-08-07");
    expect(gameDateFor(new Date("2026-08-07T00:00:00.001Z"))).toBe("2026-08-07");
  });

  it("is authoritative regardless of the client's timezone", () => {
    // 20:00 on Aug 6 in UTC-7 is already Aug 7 in UTC — the game day is
    // derived only from the UTC instant, never from local calendars.
    expect(gameDateFor(new Date("2026-08-06T20:00:00-07:00"))).toBe("2026-08-07");
    expect(gameDateFor(new Date("2026-08-07T05:00:00+09:00"))).toBe("2026-08-06");
  });

  it("handles leap days, month ends, and year ends", () => {
    expect(gameDateFor(new Date("2028-02-29T12:00:00Z"))).toBe("2028-02-29");
    expect(addGameDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addGameDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addGameDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addGameDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addGameDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addGameDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("computes window boundaries", () => {
    expect(startOfGameDate("2026-08-06").toISOString()).toBe(
      "2026-08-06T00:00:00.000Z",
    );
    expect(nextGameDateStart("2026-08-06").toISOString()).toBe(
      "2026-08-07T00:00:00.000Z",
    );
    expect(nextGameDateStart("2026-12-31").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("is deterministic under a fixed clock", () => {
    const clock = new FixedClock(new Date("2026-02-28T23:59:59Z"));
    expect(currentGameDate(clock)).toBe("2026-02-28");
    clock.advance(1000);
    expect(currentGameDate(clock)).toBe("2026-03-01");
  });

  it("validates game-date strings strictly", () => {
    expect(isGameDate("2026-08-06")).toBe(true);
    expect(isGameDate("2028-02-29")).toBe(true);
    // Impossible or malformed dates are rejected.
    expect(isGameDate("2026-02-30")).toBe(false);
    expect(isGameDate("2027-02-29")).toBe(false);
    expect(isGameDate("2026-13-01")).toBe(false);
    expect(isGameDate("2026-1-01")).toBe(false);
    expect(isGameDate("garbage")).toBe(false);
    expect(isGameDate("2026-08-06T00:00:00Z")).toBe(false);
    expect(() => assertGameDate("2026-02-30")).toThrowError();
  });
});
