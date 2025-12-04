import { describe, it, expect } from "vitest";
import detectTombolaWins from "@/lib/tombolaWinDetector";
import type { TombolaCard } from "@/tombola";
import { PRIZE_AMOUNTS } from "@/lib/tombolaPrizes";

function makeCard(
  id: string,
  playerId: string,
  numbers: number[]
): TombolaCard {
  return {
    id,
    room_id: "r1",
    player_id: playerId,
    numbers,
    created_at: new Date().toISOString(),
  } as TombolaCard;
}

describe("tombola win detector", () => {
  it("detects a single row1 win", () => {
    const card = makeCard(
      "c1",
      "p1",
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    );
    const wins = detectTombolaWins([card], [1, 2, 3, 4, 5]);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({
      win_type: "row1",
      player_id: "p1",
      card_id: "c1",
      prize: PRIZE_AMOUNTS.row1,
    });
  });

  it("detects the first matching card for a pattern when multiple cards match", () => {
    const card1 = makeCard(
      "c1",
      "p1",
      [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
    );
    const card2 = makeCard(
      "c2",
      "p2",
      [1, 2, 3, 4, 5, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]
    );
    const wins = detectTombolaWins([card1, card2], [1, 2, 3, 4, 5]);
    expect(wins).toHaveLength(1);
    expect(wins[0].player_id).toBe("p1");
  });

  it("respects existing wins and doesn't re-award the same pattern", () => {
    const card = makeCard(
      "c1",
      "p1",
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    );
    const existing = new Set(["row1"]);
    const wins = detectTombolaWins([card], [1, 2, 3, 4, 5], existing);
    expect(wins).toHaveLength(0);
  });

  it("detects multiple patterns in the correct order for a full card", () => {
    const card = makeCard(
      "c1",
      "p1",
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    );
    const allDrawn = Array.from({ length: 90 }, (_, i) => i + 1).slice(0, 15);
    const wins = detectTombolaWins([card], allDrawn);
    // Should find row1, row2, row3, corners, full in that order
    expect(wins.map((w) => w.win_type)).toEqual([
      "row1",
      "row2",
      "row3",
      "corners",
      "full",
    ]);
    expect(wins.map((w) => w.player_id)).toEqual([
      "p1",
      "p1",
      "p1",
      "p1",
      "p1",
    ]);
    // verify prizes map
    expect(wins.find((w) => w.win_type === "row1")?.prize).toBe(
      PRIZE_AMOUNTS.row1
    );
    expect(wins.find((w) => w.win_type === "full")?.prize).toBe(
      PRIZE_AMOUNTS.full
    );
  });

  it("detects multiple distinct wins across two players", () => {
    // Player 1 has row1 and corners
    const card1 = makeCard(
      "c1",
      "p1",
      [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    );
    const card2 = makeCard(
      "c2",
      "p2",
      [21, 22, 23, 24, 25, 6, 7, 8, 9, 10, 26, 27, 28, 29, 30]
    );
    const drawn = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const wins = detectTombolaWins([card1, card2], drawn);
    expect(wins.map((w) => w.win_type)).toContain("row1");
    expect(wins.map((w) => w.win_type)).toContain("row2");
    // Ensure distinct players for their respective wins
    expect(wins.find((w) => w.win_type === "row1")?.player_id).toBe("p1");
    expect(wins.find((w) => w.win_type === "row2")?.player_id).toBe("p2");
  });

  it("returns empty for no cards", () => {
    const wins = detectTombolaWins([], [1, 2, 3]);
    expect(wins).toHaveLength(0);
  });
});
