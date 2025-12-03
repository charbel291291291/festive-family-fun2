-- Add optional in_flight_number to rooms so clients can sync drawing animation
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS in_flight_number integer NULL;
