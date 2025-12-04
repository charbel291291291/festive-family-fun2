import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/supabase";
import type { Wallet } from "@/tombola";
import { chipStore } from "@/lib/chipStore";
import { updateWalletAndInsertTransaction } from "@/lib/wallet";

export interface WalletContextType {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  addChips: (amount: number) => Promise<void>;
  deductChips: (amount: number) => Promise<void>;
  transferFromSystemToWallet: (
    destWalletId: string,
    amount: number,
    systemUserId?: string,
    description?: string
  ) => Promise<boolean>;
  systemWalletUserId: string | null;
  setSystemWalletUserId: (uid: string | null) => void;
  walletId: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [walletRowId, setWalletRowId] = useState<string | null>(null);
  const [systemWalletUserId, setSystemWalletUserId] = useState<string | null>(
    null
  );

  const fetchBalance = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      if (!user) {
        // fallback to local wallet
        const w = chipStore.getWallet();
        setBalance(w.balance);
        setWalletRowId(w.id);
        setError(null);
      } else {
        const { data, error } = await supabase
          .from("chip_wallets")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setBalance(data.balance ?? 0);
          setWalletRowId(data.id);
        } else {
          // create a wallet
          const { data: newWallet, error: insertErr } = await supabase
            .from("chip_wallets")
            .insert({ user_id: user.id, balance: 0 })
            .select("*")
            .single();
          if (insertErr) throw insertErr;
          setBalance(newWallet.balance ?? 0);
          setWalletRowId(newWallet.id);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    // subscribe to wallet changes if user is logged in
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      if (user) {
        channel = supabase
          .channel(`public:chip_wallets_user:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "chip_wallets",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (payload?.new?.balance) setBalance(payload.new.balance);
            }
          )
          .subscribe();
      }
    })();

    // handle merge of local wallet into server wallet on sign-in
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          const user = session?.user ?? null;
          if (!user) return;

          // If there is a local wallet with balance, merge it to the server wallet
          const local = chipStore.getWallet();
          if (!local || !local.balance || local.balance <= 0) return;

          const { data: serverWallet, error } = await supabase
            .from("chip_wallets")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          if (error) {
            console.warn(
              "Failed to fetch server wallet during sign-in merge",
              error
            );
            return;
          }

          if (!serverWallet) {
            const { data: created, error: createErr } = await supabase
              .from("chip_wallets")
              .insert({ user_id: user.id, balance: local.balance })
              .select("*")
              .single();
            if (createErr) {
              console.warn(
                "Failed to create server wallet during sign-in merge",
                createErr
              );
              return;
            }
            setBalance(created.balance ?? 0);
            setWalletRowId(created.id);
            chipStore.setBalance(0);
            return;
          }

          // server wallet exists – credit local amount with atomic RPC
          await updateWalletAndInsertTransaction(
            serverWallet.id,
            local.balance,
            "buy",
            "Local wallet merge"
          );
          const { data: updated } = await supabase
            .from("chip_wallets")
            .select("*")
            .eq("id", serverWallet.id)
            .maybeSingle();
          setBalance((updated as Wallet)?.balance ?? 0);
          setWalletRowId((updated as Wallet)?.id ?? walletRowId);
          chipStore.setBalance(0);
        } catch (err) {
          console.warn("Sign-in wallet merge failed", err);
        }
      }
    );

    return () => {
      if (channel) {
        try {
          channel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      }
      try {
        authListener?.unsubscribe?.();
      } catch (e) {
        /* ignore */
      }
    };
  }, []);

  const refreshBalance = async () => {
    await fetchBalance();
  };

  const addChips = async (amount: number) => {
    if (amount <= 0) throw new Error("Amount must be positive");
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      if (!user) {
        // update local wallet
        const w = chipStore.getWallet();
        chipStore.setWallet({ ...w, balance: w.balance + amount });
        setBalance(w.balance + amount);
        return;
      }

      if (!walletRowId) await fetchBalance();
      if (!walletRowId) throw new Error("Wallet not found");

      await updateWalletAndInsertTransaction(
        walletRowId,
        amount,
        "win",
        "Credit via app"
      );
      // refresh
      await refreshBalance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deductChips = async (amount: number) => {
    if (amount <= 0) throw new Error("Amount must be positive");
    if (balance == null) throw new Error("Wallet not loaded");
    if (amount > balance) throw new Error("Insufficient balance");
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      if (!user) {
        // update local wallet
        const w = chipStore.getWallet();
        const newBalance = Math.max(0, w.balance - amount);
        chipStore.setWallet({ ...w, balance: newBalance });
        setBalance(newBalance);
        return;
      }

      if (!walletRowId) await fetchBalance();
      if (!walletRowId) throw new Error("Wallet not found");

      await updateWalletAndInsertTransaction(
        walletRowId,
        -amount,
        "buy",
        "Debit via app"
      );
      await refreshBalance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const transferFromSystemToWallet = async (
    destWalletId: string,
    amount: number,
    systemUserId?: string,
    description = "Payout"
  ): Promise<boolean> => {
    if (amount <= 0) return true;
    try {
      // No system wallet configured -> simply credit destination wallet
      const sysUser = systemUserId ?? systemWalletUserId;
      if (!sysUser) {
        const updated = await updateWalletAndInsertTransaction(
          destWalletId,
          amount,
          "win",
          description
        );
        // If this is our wallet, refresh balance
        if (walletRowId === destWalletId && updated?.balance != null) {
          setBalance(updated.balance);
        }
        return true;
      }

      // find system wallet entry
      const { data: sysWallet, error: swErr } = await supabase
        .from("chip_wallets")
        .select("*")
        .eq("user_id", sysUser)
        .maybeSingle();
      if (swErr) throw swErr;
      if (!sysWallet) throw new Error("System wallet not found");

      const sysWalletId = (sysWallet as Wallet).id;

      // debit system wallet
      await updateWalletAndInsertTransaction(
        sysWalletId,
        -amount,
        "admin_adjustment",
        description || "System payout"
      );

      // credit destination wallet
      const updated = await updateWalletAndInsertTransaction(
        destWalletId,
        amount,
        "win",
        description || "Payout from system"
      );

      if (walletRowId === destWalletId && updated?.balance != null) {
        setBalance(updated.balance);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("transferFromSystemToWallet failed", err);
      return false;
    }
  };

  const ctx: WalletContextType = {
    balance,
    isLoading,
    error,
    refreshBalance,
    addChips,
    deductChips,
    transferFromSystemToWallet,
    systemWalletUserId,
    setSystemWalletUserId,
    walletId: walletRowId,
  };

  return (
    <WalletContext.Provider value={ctx}>{children}</WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
};

export default WalletProvider;
