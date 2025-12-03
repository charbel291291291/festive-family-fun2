-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create user roles table (admin/player)
CREATE TYPE public.app_role AS ENUM ('admin', 'player');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view roles"
  ON public.user_roles FOR SELECT
  USING (true);

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Chip wallets table
CREATE TABLE public.chip_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chip_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet"
  ON public.chip_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own wallet"
  ON public.chip_wallets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets"
  ON public.chip_wallets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all wallets"
  ON public.chip_wallets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Transactions table
CREATE TYPE public.transaction_type AS ENUM ('buy', 'win', 'lose', 'cashout', 'admin_adjustment');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  amount BIGINT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Tombola games table
CREATE TYPE public.game_status AS ENUM ('waiting', 'active', 'completed');

CREATE TABLE public.tombola_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status game_status NOT NULL DEFAULT 'waiting',
  ticket_cost_lbp BIGINT NOT NULL DEFAULT 200000,
  profit_margin DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  corner_prize_chips BIGINT NOT NULL DEFAULT 50000,
  line_prize_chips BIGINT NOT NULL DEFAULT 100000,
  full_prize_chips BIGINT NOT NULL DEFAULT 500000,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tombola_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view games"
  ON public.tombola_games FOR SELECT
  USING (true);

CREATE POLICY "Admins can create games"
  ON public.tombola_games FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update games"
  ON public.tombola_games FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for tombola_games
ALTER PUBLICATION supabase_realtime ADD TABLE public.tombola_games;

-- Tombola tickets table
CREATE TABLE public.tombola_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.tombola_games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_numbers JSONB NOT NULL, -- 3x9 array of numbers
  marked_numbers JSONB NOT NULL DEFAULT '[]', -- Array of marked numbers
  has_corner BOOLEAN NOT NULL DEFAULT false,
  has_line BOOLEAN NOT NULL DEFAULT false,
  has_full BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tombola_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tickets"
  ON public.tombola_tickets FOR SELECT
  USING (true);

CREATE POLICY "Users can create own tickets"
  ON public.tombola_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets"
  ON public.tombola_tickets FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime for tombola_tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.tombola_tickets;

-- Drawn numbers table
CREATE TABLE public.tombola_drawn_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.tombola_games(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 1 AND number <= 90),
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, number)
);

ALTER TABLE public.tombola_drawn_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view drawn numbers"
  ON public.tombola_drawn_numbers FOR SELECT
  USING (true);

CREATE POLICY "Admins can add drawn numbers"
  ON public.tombola_drawn_numbers FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for drawn numbers
ALTER PUBLICATION supabase_realtime ADD TABLE public.tombola_drawn_numbers;

-- Function to create profile and wallet on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  INSERT INTO public.chip_wallets (user_id, balance)
  VALUES (NEW.id, 0);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'player');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chip_wallets_updated_at
  BEFORE UPDATE ON public.chip_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();