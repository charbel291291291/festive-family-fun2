import React, { useState } from "react";
import { useWallet } from "@/context/WalletContext";

export const WalletSection: React.FC = () => {
  const { balance, isLoading, error, addChips, refreshBalance } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const options = [2000, 4000, 10000, 20000];

  const handleBuy = async (amount: number) => {
    setBuying(true);
    try {
      await addChips(amount);
      setIsOpen(false);
    } catch (err) {
      alert(`Failed to buy: ${err}`);
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Your Wallet</h2>
        {isLoading ? (
          <div>Loading your wallet…</div>
        ) : error ? (
          <div>
            <div>Error: {error}</div>
            <button className="btn-secondary" onClick={refreshBalance}>
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <div className="text-xl">
              💰 {balance?.toLocaleString() ?? "-"} chips
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-center">
        <button className="btn-primary" onClick={() => setIsOpen(true)}>
          Buy Chips
        </button>
      </div>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title">Buy Chips</h3>
            <p className="helper-text">
              Choose an amount to add to your wallet
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {options.map((o) => (
                <button
                  key={o}
                  className="btn-secondary w-full"
                  onClick={() => handleBuy(o)}
                  disabled={buying}
                >
                  {o.toLocaleString()} chips
                </button>
              ))}
            </div>

            <div className="mt-4 text-center">
              <button
                className="btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletSection;
