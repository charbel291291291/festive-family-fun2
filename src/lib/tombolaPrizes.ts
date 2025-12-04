export const PRIZE_AMOUNTS = {
  row1: 500,
  row2: 400,
  row3: 300,
  corners: 1000,
  full: 5000,
} as const;

export type PrizeKey = keyof typeof PRIZE_AMOUNTS;
export const getPrizeForKey = (k: PrizeKey) => PRIZE_AMOUNTS[k];
