-- Charge wallet and create a tombola ticket atomically
CREATE OR REPLACE FUNCTION public.charge_and_create_ticket(
  p_user_id UUID,
  p_game_id UUID,
  p_card_numbers JSONB,
  p_cost BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_wallet public.chip_wallets%ROWTYPE;
  new_ticket public.tombola_tickets%ROWTYPE;
BEGIN
  -- get wallet for user
  SELECT * INTO updated_wallet FROM public.chip_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  IF updated_wallet.balance < p_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- update wallet balance
  UPDATE public.chip_wallets
  SET balance = balance - p_cost
  WHERE id = updated_wallet.id
  RETURNING * INTO updated_wallet;

  -- insert a transaction for audit (amount negative for deduction)
  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'buy', -p_cost, 'Buy tombola ticket');

  -- create ticket
  INSERT INTO public.tombola_tickets (game_id, user_id, card_numbers, marked_numbers, has_corner, has_line, has_full)
  VALUES (p_game_id, p_user_id, p_card_numbers, '[]', false, false, false)
  RETURNING * INTO new_ticket;

  RETURN jsonb_build_object('ticket', row_to_json(new_ticket), 'wallet', row_to_json(updated_wallet));
END;
$$;
