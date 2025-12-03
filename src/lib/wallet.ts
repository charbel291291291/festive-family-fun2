import { supabase } from "@/supabase";
import type { Wallet } from "@/tombola";

export async function updateWalletAndInsertTransaction(
  walletId: string,
  delta: number,
  type: "buy" | "win" | "lose" | "cashout" | "admin_adjustment",
  description = ""
): Promise<Wallet> {
  // RPC name must match migration function name
  const { data, error } = await supabase.rpc(
    "update_wallet_and_insert_transaction",
    {
      p_wallet_id: walletId,
      p_delta: delta,
      p_type: type,
      p_description: description,
    }
  );

  if (error) throw error;
  return data as unknown as Wallet;
}

export async function buyTicketAtomic(
  userId: string,
  gameId: string,
  cardNumbers: unknown,
  cost: number
): Promise<{ ticket: any; wallet: Wallet } | null> {
  const { data, error } = await supabase.rpc("charge_and_create_ticket", {
    p_user_id: userId,
    p_game_id: gameId,
    p_card_numbers: cardNumbers,
    p_cost: cost,
  });

  if (error) {
    throw error;
  }
  if (!data) return null;

  // data contains { ticket: {...}, wallet: {...} }
  return data as unknown as { ticket: any; wallet: Wallet };
}
