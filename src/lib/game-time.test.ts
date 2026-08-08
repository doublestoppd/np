import { describe, expect, it } from "vitest";
import {
  GAME_TIME_LABEL,
  GAME_TIME_NAME,
  formatGameClock,
  formatGameDate,
} from "./game-time";

describe("the game clock", () => {
  /**
   * The whole point. A player in Auckland and a player in Los Angeles
   * must read the same clock, because it is the clock the daily reset
   * happens on — and the machine running this test is in neither place.
   */
  it("reads in UTC fields, whatever the machine's time zone is", () => {
    const noonUtc = Date.UTC(2026, 7, 8, 12, 0, 0);
    expect(formatGameClock(noonUtc)).toBe("12:00:00");
    expect(formatGameClock(Date.UTC(2026, 7, 8, 0, 0, 0))).toBe("00:00:00");
    expect(formatGameClock(Date.UTC(2026, 7, 8, 23, 59, 59))).toBe("23:59:59");
  });

  it("pads every field, so the width never jumps", () => {
    expect(formatGameClock(Date.UTC(2026, 7, 8, 4, 5, 6))).toBe("04:05:06");
  });

  /** Midnight is the reset, so it is the boundary worth pinning. */
  it("rolls the date over exactly at midnight", () => {
    const lastMoment = Date.UTC(2026, 7, 8, 23, 59, 59);
    const firstMoment = Date.UTC(2026, 7, 9, 0, 0, 0);
    expect(formatGameDate(lastMoment)).toBe("8 August");
    expect(formatGameDate(firstMoment)).toBe("9 August");
  });

  it("names itself in one place", () => {
    expect(GAME_TIME_LABEL).toBe("GST");
    expect(GAME_TIME_NAME).toContain(GAME_TIME_LABEL[0]);
  });
});
