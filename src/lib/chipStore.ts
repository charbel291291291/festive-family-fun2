// Simple localStorage-based chip wallet system
// In production, this would connect to Lovable Cloud/Supabase
import type { Wallet } from "@/tombola";

type WalletWithTransactions = Wallet & { transactions: Transaction[] };

interface Transaction {
  id: string;
  type: "buy" | "win" | "lose" | "cashout";
  amount: number;
  timestamp: number;
  description: string;
}

const STORAGE_KEY = "christmas_chip_wallet";

export const chipStore = {
  getWallet(): WalletWithTransactions {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    const newWallet: WalletWithTransactions = {
      id: "local",
      user_id: "local",
      balance: 0,
      created_at: new Date().toISOString(),
      transactions: [],
    } as WalletWithTransactions;
    this.saveWallet(newWallet);
    return newWallet;
  },

  saveWallet(wallet: WalletWithTransactions): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  },

  getBalance(): number {
    return this.getWallet().balance;
  },

  addChips(amount: number, description: string): void {
    const wallet = this.getWallet();
    wallet.balance += amount;
    wallet.transactions.push({
      id: Date.now().toString(),
      type: "buy",
      amount,
      timestamp: Date.now(),
      description,
    });
    this.saveWallet(wallet);
  },

  deductChips(amount: number, description: string): boolean {
    const wallet = this.getWallet();
    if (wallet.balance < amount) return false;

    wallet.balance -= amount;
    wallet.transactions.push({
      id: Date.now().toString(),
      type: "lose",
      amount: -amount,
      timestamp: Date.now(),
      description,
    });
    this.saveWallet(wallet);
    return true;
  },

  awardChips(amount: number, description: string): void {
    const wallet = this.getWallet();
    wallet.balance += amount;
    wallet.transactions.push({
      id: Date.now().toString(),
      type: "win",
      amount,
      timestamp: Date.now(),
      description,
    });
    this.saveWallet(wallet);
  },

  // Admin function to manually adjust balance
  setBalance(amount: number): void {
    const wallet = this.getWallet();
    const diff = amount - wallet.balance;
    wallet.balance = amount;
    wallet.transactions.push({
      id: Date.now().toString(),
      type: diff > 0 ? "buy" : "lose",
      amount: diff,
      timestamp: Date.now(),
      description: "Admin adjustment",
    });
    this.saveWallet(wallet);
  },
};
