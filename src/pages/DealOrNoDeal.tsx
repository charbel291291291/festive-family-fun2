import React from "react";
import { Link } from "react-router-dom";

interface DealOrNoDealProps {
  onBackHome?: () => void;
}

const DealOrNoDeal: React.FC<DealOrNoDealProps> = ({ onBackHome }) => {
  // Demo data: 16 briefcases (typical Deal usually has 22 but smaller for layout)
  const initialCases = React.useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ id: i + 1, open: false })),
    []
  );

  // Typical amounts list — simplified
  const initialAmounts = React.useMemo(
    () =>
      [
        1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000,
      ].map((n) => ({ value: n, gone: false })),
    []
  );

  const [cases, setCases] = React.useState(initialCases);
  const [amounts, setAmounts] = React.useState(initialAmounts);

  // If remaining unopened cases <= 8, use symmetric 2-column briefcase grid
  const remainingCases = cases.filter((c) => !c.open).length;
  const briefcaseTwoCol = remainingCases <= 8;

  // If amounts left <= 10, use symmetric 2-column layout for amounts
  const remainingAmounts = amounts.filter((a) => !a.gone).length;
  const amountsTwoCol = remainingAmounts <= 10;

  const openCase = (id: number) => {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, open: true } : c))
    );
    // Mark one random remaining amount as gone to simulate reveal
    setAmounts((prev) => {
      const remaining = prev.filter((p) => !p.gone);
      if (remaining.length === 0) return prev;
      const choice = Math.floor(Math.random() * remaining.length);
      const valueToMark = remaining[choice].value;
      return prev.map((p) =>
        p.value === valueToMark ? { ...p, gone: true } : p
      );
    });
  };
  return (
    <div className="min-h-screen bg-[#020f0b] flex items-center justify-center px-4">
      <div className="rounded-[32px] border border-[#183325] bg-[#03160f] px-8 py-10 md:px-12 md:py-12 text-slate-50 shadow-[0_24px_80px_rgba(0,0,0,0.75)] w-full max-w-3xl">
        <h1 className="text-center text-3xl md:text-4xl font-semibold text-[#facc15] font-['Playfair_Display',serif] flex items-center justify-center gap-3">
          🎅 Deal or No Deal
        </h1>

        <p className="text-center text-slate-200 mt-6">
          Placeholder game board — boxes coming soon 🎁
        </p>

        <div className="mt-8">
          <div className="deal-layout">
            <div className="deal-cases-card glass-card">
              <h2 className="section-title">Pick a briefcase</h2>
              <div
                className={`briefcase-grid ${briefcaseTwoCol ? "two-col" : ""}`}
              >
                {cases.map((c) => (
                  <button
                    key={c.id}
                    className={`briefcase ${c.open ? "briefcase--open" : ""}`}
                    onClick={() => !c.open && openCase(c.id)}
                    disabled={c.open}
                  >
                    <div className="briefcase-label">Case</div>
                    <div className="briefcase-value">{c.id}</div>
                    {c.open && <div className="briefcase-tag">Opened</div>}
                  </button>
                ))}
              </div>
            </div>

            <div className="deal-side-card glass-card">
              <h3 className="section-title">Bank Offer</h3>
              <div className="bank-panel">
                <div className="bank-offer">
                  ${amounts.find((a) => !a.gone)?.value ?? 0}
                </div>
                <div className="result-panel">
                  <div className="amounts-title">Remaining amounts</div>
                  <div
                    className={`amounts-list ${amountsTwoCol ? "two-col" : ""}`}
                  >
                    {amounts.map((a) => (
                      <div
                        key={a.value}
                        className={`amount-pill ${
                          a.gone ? "amount-pill--gone" : ""
                        }`}
                      >
                        ${a.value}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={() => alert("Start Game — not implemented yet")}
              className="bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
            >
              Start Game
            </button>
            {onBackHome ? (
              <button
                onClick={onBackHome}
                className="bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
              >
                Back Home
              </button>
            ) : (
              <Link
                to="/"
                className="bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
              >
                Back Home
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealOrNoDeal;
