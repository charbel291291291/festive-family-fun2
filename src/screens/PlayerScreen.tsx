import React, { useEffect, useState, useRef } from "react";
import type { Room, Player, TombolaCard } from "@/tombola";
import { useTombolaDraws } from "@/hooks/useTombolaDraws";
import { speakNumber, resumeAudioContext } from "@/lib/audio";
import { flyFromTo } from "@/lib/animations";
import { LastDrawnBall } from "@/components/LastDrawnBall";
import { AudioToggle } from "@/components/AudioToggle";
import { useAudio } from "@/hooks/useAudio";

interface PlayerScreenProps {
  room: Room;
  player: Player;
  card: TombolaCard;
  onBackHome: () => void;
  walletBalance?: number | null;
  creditChips?: (amount: number) => void | Promise<void>;
  chargeChips?: (amount: number, description?: string) => Promise<boolean>;
  onBuyTicket?: (
    cost: number,
    cardNumbers: unknown
  ) => Promise<{ ok: boolean; ticket: unknown | null; message?: string }>;
  onOpenBuyModal?: () => void;
}

export function PlayerScreen({
  room,
  player,
  card,
  onBackHome,
  walletBalance,
  creditChips,
  chargeChips,
  onBuyTicket,
  onOpenBuyModal,
}: PlayerScreenProps) {
  const {
    drawnNumbers,
    lastDraw,
    isShuffling: remoteShuffling,
    inFlightNumber,
  } = useTombolaDraws(room.id);
  const { muted } = useAudio();
  const [justDrew, setJustDrew] = useState(false);
  const [miniNumbers, setMiniNumbers] = useState<Array<number | null>>(
    Array.from({ length: 6 }, () => null)
  );
  const miniClusterRef = useRef<HTMLDivElement | null>(null);
  const lastBallRef = useRef<HTMLDivElement | null>(null);
  const [miniHighlightIndex, setMiniHighlightIndex] = useState<number | null>(
    null
  );

  const isNumberHit = (n: number) => drawnNumbers.includes(n);

  // helper to generate 15 unique numbers for a new card
  function generateCardNumbersLocal(): number[] {
    const nums = new Set<number>();
    while (nums.size < 15) {
      const n = Math.floor(Math.random() * 90) + 1;
      nums.add(n);
    }
    return Array.from(nums);
  }

  const [lastBuySuccess, setLastBuySuccess] = useState<boolean | null>(null);
  const [lastBuyMessage, setLastBuyMessage] = useState<string | null>(null);
  const [cards, setCards] = useState<
    Array<{ id: string | number; card_numbers: number[] }>
  >([]);
  const [selectedCard, setSelectedCard] = useState<{
    id: string | number;
    card_numbers: number[];
  } | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const MAX_CARDS = 4;

  useEffect(() => {
    if (lastDraw?.id) {
      setJustDrew(true);
      try {
        resumeAudioContext();
        speakNumber(lastDraw.number);
      } catch (err) {
        console.error("speakNumber failed", err);
      }
      const t = setTimeout(() => setJustDrew(false), 700);
      return () => clearTimeout(t);
    }
    return;
  }, [lastDraw?.id, lastDraw?.number]);

  // when remoteShuffling, animate mini-screen numbers with a pseudo-rolling effect
  React.useEffect(() => {
    if (!remoteShuffling) {
      // reset mini numbers when not shuffling
      setMiniNumbers((_) => Array.from({ length: 6 }, () => null));
      setMiniHighlightIndex(null);
      return;
    }

    let cancelled = false;
    const intervalId = setInterval(() => {
      if (cancelled) return;
      setMiniNumbers(() =>
        Array.from({ length: 6 }, () => Math.floor(Math.random() * 90) + 1)
      );
    }, 90);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      // small clear to a neutral state after shuffling stops
      setMiniNumbers((_) => Array.from({ length: 6 }, () => null));
      setMiniHighlightIndex(null);
    };
  }, [remoteShuffling]);

  // Animate the rolling mini-screen then fly animation when inFlightNumber is set
  useEffect(() => {
    if (inFlightNumber == null) return;
    let cancelled = false;
    (async () => {
      try {
        // decelerating roll: increase delay from 60ms to ~360ms
        let delay = 60;
        while (!cancelled && delay < 360) {
          setMiniNumbers(() =>
            Array.from({ length: 6 }, () => Math.floor(Math.random() * 90) + 1)
          );
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.round(delay * 1.25);
        }

        if (cancelled) return;
        // pick a target mini slot and show the final cadence there; use fixed slot count (6)
        const slotCount = 6;
        const targetIndex = Math.floor(Math.random() * slotCount);
        setMiniHighlightIndex(targetIndex);
        const cadence = [
          inFlightNumber + 1,
          inFlightNumber - 1,
          inFlightNumber,
        ];
        for (const n of cadence) {
          if (cancelled) break;
          setMiniNumbers((prev) => {
            const next = prev.slice();
            next[targetIndex] = n;
            return next;
          });
          await new Promise((r) => setTimeout(r, 120));
        }

        if (cancelled) return;
        // then animate the flying ball from the highlighted mini slot to the target
        const startEl = (miniClusterRef.current?.querySelector(
          `[data-mini-index="${targetIndex}"]`
        ) ?? miniClusterRef.current) as HTMLElement | null;
        const targetEl = lastBallRef.current as HTMLElement | null;
        await flyFromTo(startEl, targetEl, inFlightNumber);

        // clear highlight and mini numbers after flight
        setMiniHighlightIndex(null);
        setMiniNumbers((_) => Array.from({ length: 6 }, () => null));
      } catch (err) {
        console.error("inFlightNumber animation failed", err);
      }
    })();
    return () => {
      cancelled = true;
      setMiniHighlightIndex(null);
    };
  }, [inFlightNumber]);

  return (
    <div className="app-container">
      <header className="app-header">
        <AudioToggle />
        <button className="btn-secondary" onClick={onBackHome}>
          ⬅ Back home
        </button>
        <div className="player-header-info">
          <h1 className="title-glow">🎄 Festive Family Tombola</h1>
          <p className="helper-text">
            Room <strong>{room.code}</strong> • You are{" "}
            <strong>{player.name}</strong>
          </p>
          {typeof walletBalance === "number" && (
            <div className="text-xs text-slate-200">
              💰 Chips: <strong>{walletBalance.toLocaleString()}</strong>
            </div>
          )}
          {showCardModal && selectedCard && (
            <div
              className="modal-overlay"
              onClick={() => {
                setShowCardModal(false);
                setSelectedCard(null);
              }}
            >
              <div
                className="modal-card"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 720 }}
              >
                <div className="flex justify-between items-center mb-2">
                  <h2 className="section-title">
                    Card #{String(selectedCard.id).slice(-6)}
                  </h2>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowCardModal(false);
                      setSelectedCard(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                <div className="player-card-grid">
                  {selectedCard.card_numbers.map((n, idx) => (
                    <div
                      key={idx}
                      className={
                        "player-card-cell" + (isNumberHit(n) ? " hit" : "")
                      }
                    >
                      <span className="cell-number">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="player-layout">
        <section className="glass-card player-card">
          <h2 className="section-title">Your Card</h2>

          <div className="player-card-grid">
            {card.numbers.map((n, idx) => (
              <div
                key={idx}
                className={"player-card-cell" + (isNumberHit(n) ? " hit" : "")}
              >
                <span className="cell-number">{n}</span>
              </div>
            ))}
          </div>

          <p className="helper-text">
            When the host draws a ball, matching numbers will light up in{" "}
            <span className="text-success">green</span>.
          </p>
        </section>

        <section className="glass-card player-info">
          <h2 className="section-title">Last Drawn Ball</h2>
          <div className="last-ball small">
            {remoteShuffling ? (
              <div className="digital-mini" ref={miniClusterRef}>
                <div className="mini-screen grid grid-cols-3 gap-1">
                  {miniNumbers.map((n, i) => (
                    <div
                      key={i}
                      data-mini-index={i}
                      className={`mini-screen-ball ${
                        n == null ? "empty" : ""
                      } ${miniHighlightIndex === i ? "highlight" : ""}`}
                    >
                      {n ?? ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : lastDraw ? (
              <LastDrawnBall
                ref={lastBallRef}
                number={lastDraw.number}
                displayNumber={inFlightNumber ?? lastDraw.number}
                justDrew={justDrew}
              />
            ) : (
              <span className="ball-placeholder">Waiting for host…</span>
            )}
          </div>

          <p className="helper-text">
            Stay ready – as soon as the host taps{" "}
            <strong>Draw Next Ball</strong>, your card updates instantly.
          </p>
          {creditChips && (
            <div className="mt-3 text-center">
              <button
                className="btn-small"
                onClick={() => creditChips(100)}
                title="Add 100 chips"
              >
                +100 chips
              </button>
            </div>
          )}
          {onOpenBuyModal && (
            <div className="mt-3 text-center">
              <button
                className="btn-small ml-2"
                onClick={() => onOpenBuyModal()}
                title="Buy chips"
              >
                💳 Buy chips
              </button>
            </div>
          )}
          {(onBuyTicket || chargeChips) && (
            <div className="mt-3 text-center">
              <button
                className="btn-small btn-warning ml-2"
                onClick={async () => {
                  const ticketCost = 1000; // cost in chips
                  if (onBuyTicket) {
                    // local client limit check: initial card + bought cards must be <= MAX_CARDS
                    const totalCards = 1 + cards.length; // initial card (prop `card`) + bought cards
                    if (totalCards >= MAX_CARDS) {
                      setLastBuySuccess(false);
                      setLastBuyMessage(
                        `You may own up to ${MAX_CARDS} cards this round.`
                      );
                      setTimeout(() => setLastBuyMessage(null), 4000);
                      return;
                    }
                    try {
                      const { ok, ticket, message } = await onBuyTicket(
                        ticketCost,
                        card.numbers ?? []
                      );
                      setLastBuySuccess(ok);
                      if (message) {
                        setLastBuyMessage(message);
                        setTimeout(() => setLastBuyMessage(null), 4000);
                      }
                      if (ok && ticket) {
                        const raw = ticket as {
                          id?: string | number;
                          card_numbers?: number[] | string;
                        };
                        let numbers: number[] = [];
                        if (Array.isArray(raw.card_numbers)) {
                          numbers = raw.card_numbers as number[];
                        } else if (typeof raw.card_numbers === "string") {
                          try {
                            const parsed = JSON.parse(raw.card_numbers);
                            if (Array.isArray(parsed))
                              numbers = parsed as number[];
                          } catch (e) {
                            console.warn(
                              "Failed to parse card_numbers for ticket",
                              e
                            );
                          }
                        }
                        const newCard = {
                          id: raw.id ?? `card-${Date.now()}`,
                          card_numbers: numbers,
                        };
                        setCards((t) => [newCard, ...t]);
                        setSelectedCard(newCard);
                        setShowCardModal(true);
                        setLastBuyMessage("Card purchased!");
                        setTimeout(() => setLastBuyMessage(null), 2000);
                      }
                    } catch (err) {
                      console.error("onBuyTicket failed", err);
                      setLastBuySuccess(false);
                      setLastBuyMessage(
                        err instanceof Error ? err.message : String(err)
                      );
                      setTimeout(() => setLastBuyMessage(null), 4000);
                    }
                  } else if (chargeChips) {
                    const ok = await chargeChips(
                      ticketCost,
                      "Buy tombola ticket"
                    );
                    setLastBuySuccess(ok);
                    if (ok) {
                      const newCardNumbers = generateCardNumbersLocal();
                      const newCard = {
                        id: `local-${Date.now()}`,
                        card_numbers: newCardNumbers,
                      } as { id: string | number; card_numbers: number[] };
                      setCards((t) => [newCard, ...t]);
                      setSelectedCard(newCard);
                      setShowCardModal(true);
                      setLastBuyMessage("Card purchased!");
                      setTimeout(() => setLastBuyMessage(null), 2000);
                    }
                  }
                  setTimeout(() => setLastBuySuccess(null), 4000);
                }}
                title="Buy a ticket"
              >
                Buy Card
              </button>
              {lastBuySuccess === true && (
                <div className="text-xs text-emerald-300 mt-2">
                  Card purchased!
                </div>
              )}
              {lastBuySuccess === false && lastBuyMessage && (
                <div className="text-xs text-rose-400 mt-2">
                  {lastBuyMessage}
                </div>
              )}
              {lastBuySuccess === false && !lastBuyMessage && (
                <div className="text-xs text-rose-400 mt-2">
                  Not enough chips
                </div>
              )}
            </div>
          )}

          {cards.length > 0 && (
            <div className="mt-4">
              <h3 className="section-title">My Cards ({cards.length})</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {cards.map((t, i) => (
                  <button
                    key={t.id ?? i}
                    className="briefcase bg-[#02140b] p-2 text-left"
                    onClick={() => {
                      setSelectedCard(t);
                      setShowCardModal(true);
                    }}
                  >
                    <div className="text-xs font-semibold">
                      Card #{String(t.id).slice(-6)}
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {Array.isArray(t.card_numbers)
                        ? (t.card_numbers as number[]).slice(0, 6).join(", ") +
                          (t.card_numbers.length > 6 ? ", …" : "")
                        : typeof t.card_numbers === "string"
                        ? (() => {
                            try {
                              const arr = JSON.parse(t.card_numbers);
                              if (Array.isArray(arr))
                                return (
                                  arr.slice(0, 6).join(", ") +
                                  (arr.length > 6 ? ", …" : "")
                                );
                            } catch (e) {
                              console.warn(
                                "Failed to parse ticket card numbers",
                                e
                              );
                            }
                            return "—";
                          })()
                        : "—"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
