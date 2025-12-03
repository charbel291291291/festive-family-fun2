-- Create a helper function to atomically update a chip_wallets balance and insert a transaction
CREATE OR REPLACE FUNCTION public.update_wallet_and_insert_transaction(
  p_wallet_id UUID,
  p_delta BIGINT,
  p_type public.transaction_type,
  p_description TEXT
)
RETURNS public.chip_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.chip_wallets%ROWTYPE;
BEGIN
  -- Update the wallet balance atomically
  UPDATE public.chip_wallets
  SET balance = balance + p_delta
  WHERE id = p_wallet_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  END IF;

  IF updated_row.balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Insert a transaction row for auditing
  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (updated_row.user_id, p_type, p_delta, p_description);

  RETURN updated_row;
END;
$$;
