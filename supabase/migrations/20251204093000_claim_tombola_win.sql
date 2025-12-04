-- Add unique constraint to prevent duplicate wins per room and win_type,
-- and create an RPC to atomically claim a tombola pattern (insert win + credit wallets)

BEGIN;

-- Create unique index for room+win_type to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'tombola_wins' AND indexname = 'tombola_wins_room_id_win_type_unique'
  ) THEN
    CREATE UNIQUE INDEX tombola_wins_room_id_win_type_unique ON public.tombola_wins (room_id, win_type);
  END IF;
END$$;

-- Create an atomic RPC to insert the win and credit wallets
CREATE OR REPLACE FUNCTION public.claim_tombola_win(
  p_room_id UUID,
  p_win_type TEXT,
  p_card_id UUID,
  p_player_id UUID,
  p_prize BIGINT,
  p_system_wallet_user_id UUID DEFAULT NULL
)
RETURNS public.tombola_wins
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing public.tombola_wins%ROWTYPE;
  inserted public.tombola_wins%ROWTYPE;
  sys_wallet public.chip_wallets%ROWTYPE;
  player_wallet public.chip_wallets%ROWTYPE;
BEGIN
  -- Check for existing win for this room and type
  SELECT * INTO existing
  FROM public.tombola_wins
  WHERE room_id = p_room_id AND win_type = p_win_type
  LIMIT 1;

  IF FOUND THEN
    RETURN existing; -- already claimed for this pattern
  END IF;

  -- Try to insert the win row. The uniqueness constraint will protect against duplicates
  INSERT INTO public.tombola_wins (room_id, player_id, card_id, win_type)
  VALUES (p_room_id, p_player_id, p_card_id, p_win_type)
  RETURNING * INTO inserted;

  -- Debit system wallet if provided
  IF p_system_wallet_user_id IS NOT NULL THEN
    SELECT * INTO sys_wallet FROM public.chip_wallets WHERE user_id = p_system_wallet_user_id LIMIT 1;
    IF FOUND THEN
      PERFORM public.update_wallet_and_insert_transaction(sys_wallet.id, -p_prize, 'admin_adjustment'::public.transaction_type, 'Tombola prize ' || p_win_type);
    END IF;
  END IF;

  -- Credit player's wallet (create if missing)
  SELECT * INTO player_wallet FROM public.chip_wallets WHERE user_id = p_player_id LIMIT 1;
  IF FOUND THEN
    PERFORM public.update_wallet_and_insert_transaction(player_wallet.id, p_prize, 'win'::public.transaction_type, 'Tombola ' || p_win_type || ' prize');
  ELSE
    INSERT INTO public.chip_wallets (user_id, balance) VALUES (p_player_id, p_prize) RETURNING * INTO player_wallet;
    INSERT INTO public.transactions (user_id, type, amount, description) VALUES (p_player_id, 'win'::public.transaction_type, p_prize, 'Tombola ' || p_win_type || ' prize');
  END IF;

  RETURN inserted;
END;
$$;

COMMIT;
