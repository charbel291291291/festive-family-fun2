import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TombolaDraw } from "@/tombola";

// Note: the hook now also returns `isShuffling` (room state) so player screens
// can keep their visual state in sync with the admin's actions.

export function useTombolaDraws(roomId: string | null) {
  const [draws, setDraws] = useState<TombolaDraw[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const [inFlightNumber, setInFlightNumber] = useState<number | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    async function fetchDraws() {
      const { data, error } = await supabase
        .from("tombola_draws")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Error loading draws:", error);
        return;
      }

      setDraws(data as TombolaDraw[]);
    }

    // first load
    fetchDraws();

    // also fetch room state (is_shuffling)
    async function fetchRoom() {
      const { data, error } = await supabase
        .from("rooms")
        .select("is_shuffling, in_flight_number")
        .eq("id", roomId)
        .single();
      if (error) {
        // ignore transient failures; we still return draws
        // console.warn("could not fetch room state", error);
        return;
      }
      type RoomData = {
        is_shuffling: boolean | null;
        in_flight_number: number | null;
      };
      const r = data as RoomData;
      setIsShuffling(Boolean(r?.is_shuffling));
      setInFlightNumber(r?.in_flight_number ?? null);
    }

    // first load for room
    fetchRoom();

    // poll every 1.5s
    const intervalId = setInterval(() => {
      fetchDraws();
      fetchRoom();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [roomId]);

  const drawnNumbers = draws.map((d) => d.number);
  const lastDraw = draws.length > 0 ? draws[draws.length - 1] : null;

  return { draws, drawnNumbers, lastDraw, isShuffling, inFlightNumber };
}
