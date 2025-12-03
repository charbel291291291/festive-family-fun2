import React, { useCallback, useState } from "react";
import { supabase } from "@/supabase";
import type { Room, Player, Wallet } from "@/tombola";
import { useTombolaDraws } from "@/hooks/useTombolaDraws";
import { useRoomPlayers } from "@/hooks/useRoomPlayers";
import { updateWalletAndInsertTransaction } from "@/lib/wallet";

interface AdminScreenProps {
  room: Room;
  onBackHome: () => void;
  buyCode?: string | null;
  onSetBuyCode?: (code: string | null) => void;
  systemWalletUserId?: string | null;
  onSetSystemWallet?: (uid: string | null) => void;
}

interface BuyRequest {
  id: string;
  room_id?: string | null;
  device_id?: string | null;
  name?: string | null;
  phone?: string | null;
  amount?: number | null;
  status?: string | null;
  code?: string | null;
  created_at?: string | null;
}

const ALL_NUMBERS = Array.from({ length: 90 }, (_, i) => i + 1);

function speakNumber(num: number) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance();
    utter.text = num.toString();
    utter.lang = "ar-SA"; // Arabic voice
    utter.rate = 0.85; // slower + more dramatic
    utter.pitch = 1; // natural tone
    utter.volume = 1;

    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("speech synthesis failed", e);
  }
}

export function AdminScreen({
  room,
  onBackHome,
  buyCode,
  onSetBuyCode,
  systemWalletUserId,
  onSetSystemWallet,
}: AdminScreenProps) {
  const { drawnNumbers, lastDraw } = useTombolaDraws(room.id);

  // TTS is triggered explicitly when admin clicks Draw Next Ball

  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState<Room["status"]>(room.status);

  // players in this room (realtime)
  const {
    players,
    loading: playersLoading,
    error: playersError,
  } = useRoomPlayers(room.id);
  interface BuyRequest {
    id: string;
    name: string;
    phone: string;
    amount: number;
    created_at: string;
    status: string;
    code?: string;
    issued_at?: string;
    room_id: string;
    // Add any other fields as needed
  }
  const [buyRequests, setBuyRequests] = useState<BuyRequest[]>([]);

  // prize controls
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [prizeAmount, setPrizeAmount] = useState<number>(1000);
  const [prizeMessage, setPrizeMessage] = useState<string | null>(null);
  const [buyCodeInput, setBuyCodeInput] = useState<string>("");
  const [copiedBuyCode, setCopiedBuyCode] = useState(false);
  const [systemWalletName, setSystemWalletName] = useState<string | null>(null);

  // If systemWalletUserId is provided, fetch profile display name
  React.useEffect(() => {
    (async () => {
      if (!systemWalletUserId) return setSystemWalletName(null);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", systemWalletUserId)
          .maybeSingle();
        setSystemWalletName(profile?.display_name ?? null);
      } catch (err) {
        console.warn("Failed to fetch system wallet profile", err);
        setSystemWalletName(null);
      }
    })();
  }, [systemWalletUserId]);

  const generateBuyCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const remainingNumbers = ALL_NUMBERS.filter((n) => !drawnNumbers.includes(n));

  // realtime players are provided by useRoomPlayers hook

  // --- game status handlers ---
  const handleStartGame = useCallback(async () => {
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ status: "running" })
        .eq("id", room.id);

      if (error) throw error;
      setStatus("running");
    } catch (err) {
      console.error(err);
      alert("Failed to start game");
    }
  }, [room.id]);

  const handleFinishGame = useCallback(async () => {
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ status: "finished" })
        .eq("id", room.id);

      if (error) throw error;
      setStatus("finished");
    } catch (err) {
      console.error(err);
      alert("Failed to finish game");
    }
  }, [room.id]);

  const handleDrawNext = useCallback(async () => {
    if (status !== "running") {
      alert("Game is not running yet.");
      return;
    }
    if (remainingNumbers.length === 0) {
      alert("All numbers have been drawn.");
      return;
    }
    if (isDrawing) return;

    setIsDrawing(true);
    try {
      const randomIndex = Math.floor(Math.random() * remainingNumbers.length);
      const nextNumber = remainingNumbers[randomIndex];

      const { error } = await supabase.from("tombola_draws").insert({
        room_id: room.id,
        number: nextNumber,
      });

      if (error) throw error;

      // 🔥 Speak only when admin clicks draw
      speakNumber(nextNumber);
      // realtime hook will update everyone
    } catch (err) {
      console.error(err);
      alert("Failed to draw next ball");
    } finally {
      setIsDrawing(false);
    }
  }, [room.id, isDrawing, remainingNumbers, status]);

  // --- give chips prize to a player ---
  const handleGivePrize = useCallback(async () => {
    setPrizeMessage(null);

    if (!selectedPlayerId || prizeAmount <= 0) {
      setPrizeMessage("Select a player and enter a positive prize.");
      return;
    }

    const winner = players.find((p) => p.id === selectedPlayerId);
    if (!winner) {
      setPrizeMessage("Player not found.");
      return;
    }

    try {
      // Best-effort: try to find an authenticated profile by display name
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("display_name", winner.name)
        .maybeSingle();

      let finalWallet: Wallet | null = null;

      if (profile && profile.id) {
        const { data: wallet } = await supabase
          .from("chip_wallets")
          .select("*")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (!wallet) {
          const { data: newWallet, error: createErr } = await supabase
            .from("chip_wallets")
            .insert({ user_id: profile.id, balance: prizeAmount })
            .select("*")
            .single();
          if (createErr)
            throw createErr || new Error("Failed to create wallet for winner");
          finalWallet = newWallet as Wallet;
        } else {
          // credit via atomic RPC (adds a win transaction)
          try {
            // If a system wallet is configured, try to debit it first
            if (systemWalletUserId) {
              // find system wallet by user_id
              const { data: sw } = await supabase
                .from("chip_wallets")
                .select("*")
                .eq("user_id", systemWalletUserId)
                .maybeSingle();
              if (!sw) throw new Error("System wallet not found");

              // debit system wallet
              await updateWalletAndInsertTransaction(
                (sw as Wallet).id,
                -prizeAmount,
                "admin_adjustment",
                `Prize for ${winner.name}`
              );
            }

            const updated = await updateWalletAndInsertTransaction(
              wallet.id,
              prizeAmount,
              "win",
              `Admin prize to ${winner.name}`
            );
            finalWallet = updated as Wallet;
          } catch (err) {
            // if RPC fails, fall back to a simple update
            const { data: updated } = await supabase
              .from("chip_wallets")
              .update({ balance: (wallet as Wallet).balance + prizeAmount })
              .eq("id", (wallet as Wallet).id)
              .select("*")
              .single();
            finalWallet = updated as Wallet;
          }
        }
      }

      // Log the win for audit (include prize in type if no dedicated column)
      const { error: winErr } = await supabase.from("tombola_wins").insert({
        room_id: room.id,
        player_id: winner.id,
        win_type: `admin_prize:${prizeAmount}`,
      });
      if (winErr) throw winErr;

      setPrizeMessage(
        `✅ Gave ${prizeAmount.toLocaleString()} chips to ${
          winner.name
        }. New balance: ${finalWallet?.balance ?? "(unknown)"}`
      );
    } catch (err: unknown) {
      console.error("give prize error:", err);
      setPrizeMessage(err instanceof Error ? err.message : String(err));
    }
  }, [players, prizeAmount, room.id, selectedPlayerId, systemWalletUserId]);

  // --- buy requests (pending) fetched by admin ---
  React.useEffect(() => {
    let sub: import("@supabase/supabase-js").RealtimeChannel | null = null;
    const load = async () => {
      try {
        const base = supabase
          .from("buy_requests")
          .select("*")
          .eq("status", "pending");
        const { data } = room.id
          ? await base.or(`room_id.eq.${room.id},room_id.is.null`)
          : await base;
        setBuyRequests(data ?? []);

        sub = supabase
          .channel("public:buy_requests")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "buy_requests" },
            (payload) => {
              if (
                (payload?.new?.room_id === room.id ||
                  payload?.new?.room_id == null) &&
                payload?.new?.status === "pending"
              ) {
                setBuyRequests((s) => [...s, payload.new as BuyRequest]);
              }
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "buy_requests" },
            (payload) => {
              if (
                payload?.old?.room_id === room.id ||
                payload?.old?.room_id == null
              ) {
                setBuyRequests((s) =>
                  s
                    .map((r) =>
                      r.id === payload.new.id ? (payload.new as BuyRequest) : r
                    )
                    .filter((r) => r.status === "pending")
                );
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.warn("Failed to load buy requests", err);
      }
    };
    load();

    return () => {
      if (sub) {
        try {
          sub.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [room.id]);

  return (
    <div className="app-container">
      <header className="app-header">
        <button className="btn-secondary" onClick={onBackHome}>
          ⬅ Back home
        </button>
        <h1 className="title-glow">🎄 Festive Family Tombola (Host)</h1>
      </header>

      <main className="admin-layout">
        {/* Left: Machine + controls */}
        <section className="admin-machine-card glass-card">
          <div className="tombola-wrapper">
            <div className="tombola-machine">
              <div className="tombola-drum">
                <div className="tombola-balls">
                  {[7, 12, 23, 45, 56, 78].map((n, i) => (
                    <div
                      key={i}
                      className={
                        "tombola-ball " +
                        (i % 4 === 0
                          ? "ball-red"
                          : i % 4 === 1
                          ? "ball-gold"
                          : i % 4 === 2
                          ? "ball-green"
                          : "ball-blue")
                      }
                    >
                      {n}
                    </div>
                  ))}
                </div>
              </div>
              <div className="tombola-neck" />
              <div className="tombola-exit">
                <div className="tombola-exit-ball">
                  {lastDraw ? lastDraw.number : "?"}
                </div>
              </div>
              <div className="tombola-base" />
            </div>
            {buyCode && (
              <div className="mt-2 flex flex-col items-start gap-2">
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-300">
                    Current buy code: <strong>{buyCode}</strong>
                  </p>
                  <div>
                    <button
                      className="btn-secondary mr-2"
                      onClick={() => {
                        // copy the code to clipboard
                        try {
                          navigator.clipboard.writeText(String(buyCode));
                          setCopiedBuyCode(true);
                          setTimeout(() => setCopiedBuyCode(false), 2000);
                        } catch (e) {
                          console.warn("Clipboard write failed", e);
                          alert(`Copy failed: ${e}`);
                        }
                      }}
                    >
                      Copy
                    </button>
                    <button
                      className="btn-secondary mr-2"
                      onClick={() => {
                        // Open WhatsApp web to let admin choose the recipient and send the code
                        try {
                          const msg = encodeURIComponent(
                            `Your Festive Family Fun buy code is: ${buyCode}. Enter it into the app to top up your wallet.`
                          );
                          const waUrl = `https://wa.me/?text=${msg}`;
                          window.open(waUrl, "_blank");
                        } catch (e) {
                          console.warn("Failed to open WhatsApp:", e);
                          alert(
                            "Could not open WhatsApp. Please paste the code into your chat manually."
                          );
                        }
                      }}
                    >
                      Send
                    </button>
                    <button
                      className="btn-secondary mr-2"
                      onClick={() => {
                        if (onSetBuyCode) onSetBuyCode(null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {copiedBuyCode && (
                  <div className="text-xs text-emerald-300">Copied!</div>
                )}
              </div>
            )}
            {systemWalletUserId && (
              <div className="mt-2">
                <p className="text-xs text-slate-300">
                  System wallet owner:{" "}
                  <strong>{systemWalletName ?? systemWalletUserId}</strong>
                </p>
                <div className="mt-2">
                  <button
                    className="btn-secondary mr-2"
                    onClick={() => {
                      if (onSetSystemWallet) onSetSystemWallet(null);
                    }}
                  >
                    Clear system wallet
                  </button>
                </div>
              </div>
            )}
            <p className="tombola-hint">
              Hit <strong>Draw Next Ball</strong> to roll the machine.
            </p>
          </div>

          <div className="room-code-display">
            <span className="label">Room Code</span>
            <div className="code">
              {room.code.split("").map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>

            <div className="mt-4 text-center">
              <label className="block text-slate-200 mb-2">
                Set Buy Code (4 digits)
              </label>
              <div className="flex gap-2 justify-center">
                <input
                  className="input-name w-40"
                  value={buyCodeInput}
                  onChange={(e) =>
                    setBuyCodeInput(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                    )
                  }
                  placeholder="e.g. 1234"
                />
                <button
                  className="btn-primary"
                  onClick={async () => {
                    const code = buyCodeInput || generateBuyCode();
                    if (onSetBuyCode) {
                      onSetBuyCode(code);
                    } else {
                      window.dispatchEvent(
                        new CustomEvent("set-buy-code", { detail: { code } })
                      );
                    }
                    setBuyCodeInput("");
                    alert(`Buy code set: ${code}`);
                  }}
                >
                  Set Code
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setBuyCodeInput(generateBuyCode());
                  }}
                >
                  Generate
                </button>
              </div>
            </div>
          </div>

          {/* Pending Buy Requests */}
          <div className="mt-4">
            <label className="block text-slate-200 mb-2">
              Pending Buy Requests
            </label>
            {buyRequests.length === 0 ? (
              <p className="text-xs text-slate-300">No pending buy requests.</p>
            ) : (
              <ul className="space-y-2">
                {buyRequests.map((r) => (
                  <li
                    key={r.id}
                    className="rounded p-2 bg-[#02160c] border border-[#10301f] flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm text-slate-200">
                        {r.name || "Unknown"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.phone} • {r.amount?.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          // Confirm – generate code, update row to issued and open WhatsApp to buyer
                          try {
                            const code = generateBuyCode();
                            // set code in the global buy code so buyer can redeem
                            if (onSetBuyCode) onSetBuyCode(code);
                            else
                              window.dispatchEvent(
                                new CustomEvent("set-buy-code", {
                                  detail: { code },
                                })
                              );

                            const { error } = await supabase
                              .from("buy_requests")
                              .update({
                                status: "issued",
                                code,
                                issued_at: new Date().toISOString(),
                              })
                              .eq("id", r.id);
                            if (error) throw error;

                            // Open WA to buyer with code prefilled
                            const buyerPhone = String(r.phone ?? "").replace(
                              /\D/g,
                              ""
                            );
                            const msg = encodeURIComponent(
                              `Your Festive Family Fun buy code: ${code}. Use it in the app to top up your wallet.`
                            );
                            window.open(
                              `https://wa.me/${buyerPhone}?text=${msg}`,
                              "_blank"
                            );
                            // remove from UI list
                            setBuyRequests((s) =>
                              s.filter((x) => x.id !== r.id)
                            );
                          } catch (err) {
                            console.warn("Failed to confirm buy request", err);
                            alert("Failed to confirm buy request");
                          }
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={async () => {
                          try {
                            const { error } = await supabase
                              .from("buy_requests")
                              .update({ status: "rejected" })
                              .eq("id", r.id);
                            if (error) throw error;
                            setBuyRequests((s) =>
                              s.filter((x) => x.id !== r.id)
                            );
                          } catch (err) {
                            console.warn("Failed to reject buy", err);
                            alert("Failed to reject buy");
                          }
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-controls">
            <div className="status-badge">
              Status:{" "}
              <span
                className={
                  status === "lobby"
                    ? "badge-warning"
                    : status === "running"
                    ? "badge-success"
                    : "badge-muted"
                }
              >
                {status.toUpperCase()}
              </span>
            </div>

            <div className="buttons-row">
              {status === "lobby" && (
                <button className="btn-primary" onClick={handleStartGame}>
                  ▶ Start Game
                </button>
              )}

              {status === "running" && (
                <>
                  <button
                    className="btn-primary"
                    onClick={handleDrawNext}
                    disabled={isDrawing || remainingNumbers.length === 0}
                  >
                    🎱 Draw Next Ball
                  </button>
                  <button className="btn-danger" onClick={handleFinishGame}>
                    ⏹ End Game
                  </button>
                </>
              )}

              {status === "finished" && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    alert("Game finished – create a new room for a new round.")
                  }
                >
                  ✅ Game Finished
                </button>
              )}
            </div>

            <p className="helper-text">
              Ask everyone to join this room code on their phone. When you hit{" "}
              <strong>Draw Next Ball</strong>, their cards update live.
            </p>
          </div>
        </section>

        {/* Right: last ball + history + prizes */}
        <section className="admin-draws-card glass-card">
          <h2 className="section-title">Last Drawn Ball</h2>
          <div className="last-ball">
            {lastDraw ? (
              <span className="ball-number">{lastDraw.number}</span>
            ) : (
              <span className="ball-placeholder">No balls yet</span>
            )}
          </div>

          <h3 className="section-title">History</h3>
          <div className="draw-history-grid">
            {drawnNumbers.length === 0 ? (
              <p className="helper-text">No numbers drawn yet.</p>
            ) : (
              ALL_NUMBERS.map((n) => (
                <span
                  key={n}
                  className={
                    drawnNumbers.includes(n)
                      ? "history-number drawn"
                      : "history-number"
                  }
                >
                  {n}
                </span>
              ))
            )}
          </div>

          <div className="admin-players-card">
            <h3 className="section-title">Players & prizes</h3>

            {playersLoading && <p className="helper-text">Loading players…</p>}
            {playersError && <p className="helper-text">⚠ {playersError}</p>}
            {!playersLoading && players.length === 0 && !playersError && (
              <p className="helper-text">
                No players joined yet. Ask everyone to enter the room code.
              </p>
            )}

            {players.length > 0 && (
              <>
                <div className="prize-row">
                  <select
                    className="prize-select"
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                  >
                    <option value="">Choose winner…</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    className="prize-input"
                    value={prizeAmount}
                    min={1}
                    onChange={(e) => setPrizeAmount(Number(e.target.value))}
                  />

                  <button className="btn-primary" onClick={handleGivePrize}>
                    💰 Give prize
                  </button>
                </div>

                <ul className="players-mini-list">
                  {players.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-3">
                        {p.name}
                        {systemWalletName === p.name && (
                          <span className="text-xs text-amber-300">
                            (System)
                          </span>
                        )}
                      </span>
                      <div>
                        <button
                          className="btn-secondary mr-2"
                          onClick={async () => {
                            if (!onSetSystemWallet) return;
                            try {
                              const { data: profile } = await supabase
                                .from("profiles")
                                .select("*")
                                .eq("display_name", p.name)
                                .maybeSingle();
                              if (!profile || !profile.id) {
                                alert(
                                  "Player has no linked system account (local device). Cannot set as system wallet."
                                );
                                return;
                              }
                              onSetSystemWallet(profile.id);
                              alert(
                                `System wallet set to ${profile.display_name}`
                              );
                            } catch (err) {
                              console.warn("Failed to set system wallet", err);
                              alert(
                                "Failed to set system wallet: check console"
                              );
                            }
                          }}
                        >
                          Set as system wallet
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {prizeMessage && (
              <p className="helper-text" style={{ marginTop: 8 }}>
                {prizeMessage}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
