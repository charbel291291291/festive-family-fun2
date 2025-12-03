import { useEffect, useState } from "react";
import { supabase } from "@/supabase";
import type { Player } from "@/tombola";

export function useRoomPlayers(roomId: string | null) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (!cancelled) {
          setPlayers((data ?? []) as Player[]);
          setError(null);
        }
      } catch (err: unknown) {
        console.error("load players error:", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : String(err) || "Failed to load players"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPlayers();

    // realtime: re-fetch when players insert/delete
    const channel = supabase
      .channel(`room_players_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { players, loading, error };
}
