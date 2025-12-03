import React, { useEffect, useState } from "react";

interface DealScreenProps {
  onBackHome: () => void;
  walletBalance: number | null;
  onRoundFinished: (amount: number) => void | Promise<void>;
  onEntryFee: (amount: number) => Promise<boolean>;
}

// amounts in "chips"
const AMOUNTS = [
  10, 50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500,
  10000, 20000,
];

const DEAL_ENTRY_FEE = 5000; // 5,000 chips = $5

const HALF = Math.ceil(AMOUNTS.length / 2);
const LEFT_AMOUNTS = AMOUNTS.slice(0, HALF);
const RIGHT_AMOUNTS = AMOUNTS.slice(HALF);

interface Briefcase {
  id: number;
  amount: number;
}

type Stage = "pick" | "open" | "offer" | "finished";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function initCases(): Briefcase[] {
  const shuffled = shuffle(AMOUNTS);
  return shuffled.map((amount, idx) => ({
    id: idx + 1,
    amount,
  }));
}

export function DealScreen({
  onBackHome,
  walletBalance,
  onRoundFinished,
  onEntryFee,
}: DealScreenProps) {
  const [resetCounter, setResetCounter] = useState(0);
  const [cases, setCases] = useState<Briefcase[]>(() => initCases());
  const [playerCaseId, setPlayerCaseId] = useState<number | null>(null);
  const [opened, setOpened] = useState<number[]>([]);
  const [stage, setStage] = useState<Stage>("pick");
  const [offer, setOffer] = useState<number | null>(null);
  const [lastOpenedAmount, setLastOpenedAmount] = useState<number | null>(null);
  const [dealTaken, setDealTaken] = useState(false);
  const [settled, setSettled] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  // reset everything when resetCounter changes
  useEffect(() => {
    setCases(initCases());
    setPlayerCaseId(null);
    setOpened([]);
    setStage("pick");
    setOffer(null);
    setLastOpenedAmount(null);
    setDealTaken(false);
    setSettled(false);
  }, [resetCounter]);

  useEffect(() => {
    async function chargeEntry() {
      setEntryError(null);
      const ok = await onEntryFee(DEAL_ENTRY_FEE);
      if (!ok) {
        setEntryError(
          `Not enough chips to play. You need ${DEAL_ENTRY_FEE.toLocaleString()} chips.`
        );
        setStage("finished");
      }
    }
    chargeEntry();
  }, [resetCounter, onEntryFee]);

  const playerCase = playerCaseId
    ? cases.find((c) => c.id === playerCaseId) || null
    : null;

  const remainingCases = cases.filter(
    (c) => c.id !== playerCaseId && !opened.includes(c.id)
  );

  const remainingAmounts = remainingCases.map((c) => c.amount);

  const handlePickCase = (id: number) => {
    if (stage !== "pick") return;
    setPlayerCaseId(id);
    setStage("open");
  };

  const handleOpenCase = (id: number) => {
    if (stage !== "open") return;
    if (id === playerCaseId) return;
    if (opened.includes(id)) return;

    const theCase = cases.find((c) => c.id === id);
    if (!theCase) return;

    const newOpened = [...opened, id];
    setOpened(newOpened);
    setLastOpenedAmount(theCase.amount);

    // after every 3 opened cases (and still more than 1 remaining), bank offers
    const remainingCount = cases.filter(
      (c) => c.id !== playerCaseId && !newOpened.includes(c.id)
    ).length;

    if (
      newOpened.length > 0 &&
      newOpened.length % 3 === 0 &&
      remainingCount > 1
    ) {
      const amountsForOffer = cases
        .filter((c) => c.id === playerCaseId || !newOpened.includes(c.id))
        .map((c) => c.amount);

      const avg =
        amountsForOffer.reduce((sum, v) => sum + v, 0) /
        Math.max(amountsForOffer.length, 1);

      const bankOffer = Math.round(avg * 0.8); // 80% of average
      setOffer(bankOffer);
      setStage("offer");
    } else if (remainingCount === 0) {
      // nothing left to open -> go to finish
      setStage("finished");
    }
  };

  const handleTakeDeal = () => {
    if (stage !== "offer" || offer == null) return;
    setDealTaken(true);
    setStage("finished");
  };

  const handleNoDeal = () => {
    if (stage !== "offer") return;
    setStage("open");
  };

  const handlePlayAgain = () => {
    setResetCounter((x) => x + 1);
  };

  // Once the round is finished, credit the winner (either the bank offer or the player's case) just once
  useEffect(() => {
    if (stage !== "finished" || settled === true) return;

    const playerAmount = playerCase?.amount ?? 0;
    const winAmount = dealTaken && offer != null ? offer : playerAmount;

    if (winAmount > 0) {
      try {
        onRoundFinished(winAmount);
      } catch (err) {
        console.error("Failed to credit round winnings:", err);
      }
    }

    setSettled(true);
  }, [stage, settled, playerCase, dealTaken, offer, onRoundFinished]);

  const formatChips = (amount: number | null) =>
    amount == null ? "-" : `${amount.toLocaleString()} chips`;

  return (
    <div className="app-container">
      <header className="app-header">
        <button className="btn-secondary" onClick={onBackHome}>
          ⬅ Back home
        </button>
        <h1 className="title-glow">🎁 Deal or No Deal</h1>
        {typeof walletBalance === "number" && (
          <div className="text-xs text-slate-200">
            💰 Chips: <strong>{walletBalance.toLocaleString()}</strong>
          </div>
        )}
      </header>

      <main className="deal-layout">
        {/* Left side: cases grid */}
        <section className="glass-card deal-cases-card">
          <h2 className="section-title">
            {stage === "pick"
              ? "Pick your case"
              : "Open cases and watch the amounts disappear"}
          </h2>

          <p className="helper-text">
            {stage === "pick" && "Choose one briefcase to keep as yours."}
            {stage === "open" &&
              "Tap other cases to reveal their amounts. The bank will call after a few openings."}
            {stage === "offer" &&
              "The bank made you an offer based on remaining amounts."}
            {stage === "finished" &&
              "Game over. Compare the deal with what was in your case."}
          </p>

          <div className="briefcase-grid">
            {cases.map((c) => {
              const isPlayerCase = c.id === playerCaseId;
              const isOpened = opened.includes(c.id);
              const showAmount = isOpened && !isPlayerCase;

              const classNames = [
                "briefcase",
                isPlayerCase ? "briefcase--player" : "",
                isOpened ? "briefcase--open" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={c.id}
                  className={classNames}
                  onClick={() =>
                    stage === "pick"
                      ? handlePickCase(c.id)
                      : handleOpenCase(c.id)
                  }
                  disabled={
                    (stage === "pick" && playerCaseId !== null) ||
                    (stage !== "pick" && (isOpened || isPlayerCase)) ||
                    stage === "offer" ||
                    stage === "finished"
                  }
                >
                  <span className="briefcase-label">#{c.id}</span>
                  <span className="briefcase-value">
                    {showAmount ? formatChips(c.amount) : "🎁"}
                  </span>
                  {isPlayerCase && (
                    <span className="briefcase-tag">Your case</span>
                  )}
                </button>
              );
            })}
          </div>

          {lastOpenedAmount != null && (
            <p className="helper-text last-opened">
              Last opened: <strong>{formatChips(lastOpenedAmount)}</strong>
            </p>
          )}
        </section>

        {/* Right side: bank + amounts list */}
        <section className="glass-card deal-side-card">
          <h2 className="section-title">Bank & Result</h2>
          <p className="helper-text">
            Your chips:{" "}
            <strong>
              {walletBalance != null ? walletBalance.toLocaleString() : "—"}
            </strong>
          </p>

          <div className="bank-panel">
            {stage === "offer" && offer != null && (
              <>
                <p className="helper-text">The bank offers you:</p>
                <p className="bank-offer">{formatChips(offer)}</p>
                <div className="buttons-row">
                  <button className="btn-primary" onClick={handleTakeDeal}>
                    🤝 Deal
                  </button>
                  <button className="btn-danger" onClick={handleNoDeal}>
                    ❌ No Deal
                  </button>
                </div>
              </>
            )}

            {stage === "finished" && (
              <div className="result-panel">
                <p className="helper-text">Your case contained:</p>
                <p className="final-amount">
                  {formatChips(playerCase?.amount ?? null)}
                </p>

                {dealTaken && offer != null ? (
                  <p className="helper-text">
                    You took the deal for <strong>{formatChips(offer)}</strong>.
                  </p>
                ) : (
                  <p className="helper-text">
                    You went all the way with no deal.
                  </p>
                )}

                <button className="btn-primary" onClick={handlePlayAgain}>
                  🔁 Play again
                </button>
              </div>
            )}

            {stage !== "offer" && stage !== "finished" && (
              <p className="helper-text">
                Open a few cases… the bank will start offering{" "}
                <strong>chips</strong> to buy your case.
              </p>
            )}
            {entryError && (
              <p className="helper-text" style={{ color: "#f97373" }}>
                {entryError}
              </p>
            )}
          </div>

          <h3 className="section-title amounts-title">Remaining amounts</h3>
          <div className={`amounts-list`}>
            <div className="amounts-column">
              {LEFT_AMOUNTS.map((amt) => {
                const stillInPlay =
                  amt === playerCase?.amount || remainingAmounts.includes(amt);
                return (
                  <div
                    key={amt}
                    className={
                      "amount-pill" + (stillInPlay ? "" : " amount-pill--gone")
                    }
                  >
                    {formatChips(amt)}
                  </div>
                );
              })}
            </div>
            <div className="amounts-column">
              {RIGHT_AMOUNTS.map((amt) => {
                const stillInPlay =
                  amt === playerCase?.amount || remainingAmounts.includes(amt);
                return (
                  <div
                    key={amt}
                    className={
                      "amount-pill" + (stillInPlay ? "" : " amount-pill--gone")
                    }
                  >
                    {formatChips(amt)}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
