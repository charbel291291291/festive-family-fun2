-- Add is_shuffling boolean column to rooms so the UI can be synchronized
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS is_shuffling boolean NOT NULL DEFAULT false;
