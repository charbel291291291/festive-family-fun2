import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TombolaWin } from "@/tombola";

export function useTombolaWins(roomId: string | null) {
  const [wins, setWins] = useState<TombolaWin[]>([]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function fetchWins() {
      const { data, error } = await supabase
        .from("tombola_wins")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load wins:", error);
        return;
      }
      if (!cancelled) setWins(data as TombolaWin[]);
    }

    fetchWins();

    const ch = supabase
      .channel("public:tombola_wins")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tombola_wins",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setWins((s) => [...s, payload.new as TombolaWin]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      try {
        ch.unsubscribe();
      } catch (e) {
        /* ignore */
      }
    };
  }, [roomId]);

  return { wins };
}
