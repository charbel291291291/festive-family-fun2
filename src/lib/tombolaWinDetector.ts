import type { TombolaCard } from "@/tombola";
import { PRIZE_AMOUNTS } from "./tombolaPrizes";

export type WinType = "row1" | "row2" | "row3" | "corners" | "full";

export interface DetectedWin {
  win_type: WinType | string;
  player_id: string;
  card_id: string;
  prize?: number;
}

export function detectTombolaWins(
  cards: (TombolaCard & { player_id?: string })[],
  drawnNumbers: number[],
  existingWins?: Set<string>
): DetectedWin[] {
  const wins: DetectedWin[] = [];
  const existing = new Set(existingWins ?? []);

  // helpers
  const isRowComplete = (nums: number[], row: number) => {
    const start = (row - 1) * 5;
    const indexes = [0, 1, 2, 3, 4].map((i) => nums[start + i]);
    return indexes.every((n) => drawnNumbers.includes(n));
  };
  const isCornersComplete = (nums: number[]) => {
    const corners = [nums[0], nums[4], nums[10], nums[14]];
    return corners.every((n) => drawnNumbers.includes(n));
  };
  const isFull = (nums: number[]) =>
    nums.every((n) => drawnNumbers.includes(n));

  const patterns: Array<{
    key: WinType;
    check: (nums: number[]) => boolean;
    prize: number;
  }> = [
    {
      key: "row1",
      check: (n) => isRowComplete(n, 1),
      prize: PRIZE_AMOUNTS.row1,
    },
    {
      key: "row2",
      check: (n) => isRowComplete(n, 2),
      prize: PRIZE_AMOUNTS.row2,
    },
    {
      key: "row3",
      check: (n) => isRowComplete(n, 3),
      prize: PRIZE_AMOUNTS.row3,
    },
    { key: "corners", check: isCornersComplete, prize: PRIZE_AMOUNTS.corners },
    { key: "full", check: isFull, prize: PRIZE_AMOUNTS.full },
  ];

  for (const p of patterns) {
    if (existing.has(p.key)) continue;
    const matching = cards.find((c) => p.check(c.numbers));
    if (!matching) continue;
    const playerId = matching.player_id ?? String(matching.id);
    wins.push({
      win_type: p.key,
      player_id: playerId,
      card_id: matching.id,
      prize: p.prize,
    });
    existing.add(p.key);
  }

  return wins;
}

export default detectTombolaWins;
