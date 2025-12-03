-- Create buy_requests table to track offline buy requests
CREATE TYPE public.buy_request_status AS ENUM ('pending', 'issued', 'rejected', 'completed');

CREATE TABLE public.buy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  device_id TEXT,
  name TEXT,
  phone TEXT,
  amount BIGINT NOT NULL,
  status public.buy_request_status NOT NULL DEFAULT 'pending',
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at TIMESTAMPTZ
);

ALTER TABLE public.buy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert buy requests"
  ON public.buy_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view buy requests"
  ON public.buy_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all buy requests"
  ON public.buy_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.buy_requests;
