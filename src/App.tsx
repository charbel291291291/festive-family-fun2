import React, { useEffect, useState, useRef } from "react";
import {
  ADMIN_PASSWORD,
  ADMIN_PASSWORD_FROZEN,
  ADMIN_NO_PASSWORD,
} from "@/config/admin";
import type { Role, Room, Player, TombolaCard, Wallet } from "@/tombola";
import { chipStore } from "@/lib/chipStore";
import {
  updateWalletAndInsertTransaction,
  buyTicketAtomic,
} from "@/lib/wallet";
import { supabase } from "@/supabase";
import { AdminScreen } from "@/screens/AdminScreen";
import { PlayerScreen } from "@/screens/PlayerScreen";
import { DealScreen } from "./screens/DealScreen";

type Screen = "home" | "role-select" | "admin" | "player" | "deal";

// fees
const TOMBOLA_ENTRY_FEE = 1000; // chips per player per room
const DEAL_ENTRY_FEE = 5000; // 5,000 chips = $5

const DEVICE_ID_KEY = "fff_device_id";
const PLAYER_NAME_KEY = "fff_player_name";

function getOrCreateDeviceId(): string {
  let existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!existing) {
    existing = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, existing);
  }
  return existing;
  // Atomic buy ticket operation: charges wallet and creates a ticket server-side if possible
}

function getStoredPlayerName(): string {
  return window.localStorage.getItem(PLAYER_NAME_KEY) ?? "";
}

// Generate 15 unique numbers between 1 and 90
function generateCardNumbers(): number[] {
  const nums = new Set<number>();
  while (nums.size < 15) {
    const n = Math.floor(Math.random() * 90) + 1; // 1..90
    nums.add(n);
  }
  return Array.from(nums);
}

const ensurePlayerCard = async (
  roomId: string,
  playerId: string
): Promise<TombolaCard> => {
  // 1) try existing card in tombola_cards
  const { data: existing, error: existingErr } = (await supabase
    .from("tombola_cards")
    .select("*")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .maybeSingle()) as { data: TombolaCard | null; error: unknown };

  if (existingErr) {
    throw existingErr;
  }

  if (existing) {
    const numbers =
      Array.isArray(existing.numbers) &&
      existing.numbers.every((n) => typeof n === "number")
        ? existing.numbers
        : existing.numbers.map((n: unknown) => Number(n));

    return { ...(existing as TombolaCard), numbers };
  }

  // 2) create a new card
  const numbers = generateCardNumbers();

  const { data: newCard, error: insertErr } = (await supabase
    .from("tombola_cards")
    .insert({
      room_id: roomId,
      player_id: playerId,
      numbers,
    })
    .select("*")
    .single()) as { data: TombolaCard | null; error: unknown };

  if (insertErr || !newCard) {
    throw insertErr || new Error("Failed to create tombola card");
  }

  const parsedNumbers =
    Array.isArray(newCard!.numbers) &&
    newCard!.numbers.every((n) => typeof n === "number")
      ? (newCard!.numbers as number[])
      : (newCard!.numbers as unknown[]).map((n) => Number(n));

  return { ...(newCard as TombolaCard), numbers: parsedNumbers };
};

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [role, setRole] = useState<Role | null>(null);

  // --- ADMIN STATE ---
  const [adminRoom, setAdminRoom] = useState<Room | null>(null);
  const [adminPlayer, setAdminPlayer] = useState<Player | null>(null); // not used by AdminScreen, but kept for future
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // --- PLAYER STATE ---
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [playerRoom, setPlayerRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerCard, setPlayerCard] = useState<TombolaCard | null>(null);
  const [joining, setJoining] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  // WALLET
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyAmount, setBuyAmount] = useState<number>(1000);
  const [buying, setBuying] = useState(false);
  const [buyCode, setBuyCode] = useState<string | null>(null); // 4-digit admin code
  const [showBuyCodeModal, setShowBuyCodeModal] = useState(false);
  const [buyModalAmount, setBuyModalAmount] = useState<number | null>(null);
  const [buyCodeInput, setBuyCodeInput] = useState<string>("");
  const [showWhatsAppConfirmModal, setShowWhatsAppConfirmModal] =
    useState(false);
  const [buyPhoneInput, setBuyPhoneInput] = useState<string>(
    window.localStorage.getItem("fff_buy_phone") ?? ""
  );
  const [pendingBuyRequestId, setPendingBuyRequestId] = useState<string | null>(
    null
  );
  // System wallet (auth user id) – when set, payouts are debited from this wallet
  const [systemWalletUserId, setSystemWalletUserId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const storedName = getStoredPlayerName();
    if (storedName) setPlayerNameInput(storedName);
  }, []);

  // Listen for custom event 'set-buy-code' from AdminScreen; update buyCode
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce?.detail?.code) {
        setBuyCode(String(ce.detail.code));
        alert(`Buy code set: ${ce.detail.code}`);
      }
    };
    window.addEventListener("set-buy-code", handler as EventListener);
    return () =>
      window.removeEventListener("set-buy-code", handler as EventListener);
  }, []);

  // Load or create wallet on mount: prefer server wallet for logged-in users (chip_wallets),
  // otherwise fallback to local stored wallet via chipStore
  useEffect(() => {
    async function loadWallet() {
      setWalletLoading(true);
      try {
        const deviceId = getOrCreateDeviceId();
        // If user is logged-in, prefer server wallet by user_id
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;

        if (user) {
          const { data, error } = await supabase
            .from("chip_wallets")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          if (error) throw error;

          if (data) {
            setWallet(data as Wallet);
          } else {
            // create new wallet for this user
            const { data: newWallet, error: insertErr } = await supabase
              .from("chip_wallets")
              .insert({ user_id: user.id, balance: 5000 })
              .select("*")
              .single();

            if (insertErr || !newWallet) {
              throw insertErr || new Error("Failed to create wallet");
            }

            setWallet(newWallet as Wallet);
          }
        } else {
          // not logged in: use local wallet
          const w = chipStore.getWallet();
          setWallet({
            id: w.id,
            user_id: w.user_id ?? "local",
            balance: w.balance,
            created_at: w.created_at,
          } as Wallet);
        }

        setWalletError(null);
      } catch (err: unknown) {
        console.error("Wallet load error:", err);
        setWalletError(
          err instanceof Error
            ? err.message
            : String(err) ||
                "Could not load chip wallet. Games still work offline."
        );
      } finally {
        setWalletLoading(false);
      }
    }

    loadWallet();

    // handle merge of local wallet into server wallet on sign-in
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      if (!user) return;

      // If there is a local wallet with balance, merge it to the server wallet
      const local = chipStore.getWallet();
      if (!local || !local.balance || local.balance <= 0) return;

      try {
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
          setWallet(created as Wallet);
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
        setWallet(updated as Wallet);
        chipStore.setBalance(0);
      } catch (err) {
        console.warn("Sign-in wallet merge failed", err);
      }
    });

    const subscription = data?.subscription;
    return () => subscription?.unsubscribe?.();
  }, []);

  // credit chips helper used by games (server wallet if available; local fallback)
  const creditChips = async (amount: number) => {
    if (!wallet || amount <= 0) return;

    // local wallet -> update local store
    if (wallet.user_id === "local" || wallet.id === "local") {
      try {
        chipStore.addChips(amount, `Game credit +${amount}`);
        const newW = chipStore.getWallet();
        setWallet({
          id: newW.id,
          user_id: newW.user_id ?? "local",
          balance: newW.balance,
          created_at: newW.created_at,
        } as Wallet);
      } catch (err) {
        console.error("Failed to credit local wallet:", err);
      }
      return;
    }

    // server wallet – update balance on chip_wallets via RPC (atomic + transaction)
    try {
      const updated = await updateWalletAndInsertTransaction(
        wallet.id,
        amount,
        "buy",
        `Credit ${amount} chips`
      );
      setWallet(updated as Wallet);
    } catch (err) {
      console.error("Failed to credit chips:", err);
      // silently fail for now – family game
    }
  };

  // Transfer amount from a configured system wallet (by user id) to a destination wallet id.
  // If no system wallet is configured, falls back to a direct credit on the destination wallet.
  const transferFromSystemToWallet = async (
    destWalletId: string,
    amount: number,
    description = ""
  ): Promise<boolean> => {
    if (amount <= 0) return true;
    // If no system wallet configured, just credit the destination wallet.
    if (!systemWalletUserId) {
      try {
        const updated = await updateWalletAndInsertTransaction(
          destWalletId,
          amount,
          "win",
          description || "Payout"
        );
        // update local state if this is the user's wallet
        if (wallet?.id === destWalletId) setWallet(updated as Wallet);
        return true;
      } catch (err) {
        console.error("Failed to credit destination wallet:", err);
        return false;
      }
    }

    try {
      // find system wallet entry
      const { data: sysWallet, error: swErr } = await supabase
        .from("chip_wallets")
        .select("*")
        .eq("user_id", systemWalletUserId)
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

      if (wallet?.id === destWalletId) setWallet(updated as Wallet);
      return true;
    } catch (err) {
      console.error("Failed to transfer from system wallet:", err);
      return false;
    }
  };

  // debit chips: nft the evil twin of creditChips (local server fallback)
  const debitChips = async (amount: number): Promise<boolean> => {
    if (!wallet) {
      alert("Wallet not loaded yet. Please wait a second and try again.");
      return false;
    }
    if (amount <= 0) return true;

    // local wallet – deduct via chipStore
    if (wallet.user_id === "local" || wallet.id === "local") {
      const success = chipStore.deductChips(amount, "Debit for game");
      if (success) {
        const newW = chipStore.getWallet();
        setWallet({
          id: newW.id,
          user_id: newW.user_id ?? "local",
          balance: newW.balance,
          created_at: newW.created_at,
        } as Wallet);
      }
      return success;
    }

    // server wallet – deduct via RPC (atomic + transaction)
    try {
      const updated = await updateWalletAndInsertTransaction(
        wallet.id,
        -amount,
        "lose",
        `Debit ${amount} chips`
      );
      setWallet(updated as Wallet);
      return true;
    } catch (err) {
      console.error("Failed to debit chips:", err);
      return false;
    }
  };

  // charge chips helper used by games (buy ticket, entry, etc.)
  const chargeChips = async (
    amount: number,
    description = ""
  ): Promise<boolean> => {
    if (!wallet || amount <= 0) return false;
    if (wallet.user_id === "local" || wallet.id === "local") {
      // local wallet – deduct via chipStore
      const success = chipStore.deductChips(
        amount,
        description || "Game purchase"
      );
      if (success) {
        const newW = chipStore.getWallet();
        setWallet({
          id: newW.id,
          user_id: newW.user_id ?? "local",
          balance: newW.balance,
          created_at: newW.created_at,
        } as Wallet);
      }
      return success;
    }

    try {
      const updated = await updateWalletAndInsertTransaction(
        wallet.id,
        -amount,
        "lose",
        description || "Game purchase"
      );
      setWallet(updated as Wallet);
      return true;
    } catch (err) {
      console.error("Failed to charge chips", err);
      return false;
    }
  };

  // Handler for buying chips from Home — frontend only, credits wallet visually.
  const handleBuyChips = async (amount: number) => {
    if (!wallet) {
      alert("Wallet not ready yet. Wait a second and try again.");
      return;
    }

    // Ask user for phone number (to allow admin to send code back) before opening WhatsApp
    setBuyModalAmount(amount);
    setBuyCodeInput("");
    setShowWhatsAppConfirmModal(true);
  };

  const goHome = () => {
    setScreen("home");
    setRole(null);

    // reset admin
    setAdminRoom(null);
    setAdminPlayer(null);
    setCreatingRoom(false);
    setAdminError(null);

    // reset player
    setPlayerRoom(null);
    setPlayer(null);
    setPlayerCard(null);
    setPlayerError(null);
    setRoomCodeInput("");
  };

  const startTombolaFlow = () => {
    setScreen("role-select");
  };

  const authModalPromiseRef = useRef<{
    resolve: (val: boolean) => void;
  } | null>(null);

  const openAuthModal = (reason: "selectRole" | "createRoom") => {
    setAuthModalOpen(true);
    setAuthModalError(null);
    authModalReasonRef.current = reason;
    if (authPasswordRef.current) authPasswordRef.current.value = "";
    return new Promise<boolean>((resolve) => {
      authModalPromiseRef.current = { resolve };
    });
  };

  const closeAuthModal = (ok: boolean) => {
    setAuthModalOpen(false);
    authModalPromiseRef.current?.resolve(ok);
    authModalPromiseRef.current = null;
    authModalReasonRef.current = null;
  };

  const authModalReasonRef = useRef<"selectRole" | "createRoom" | null>(null);

  const handleSelectRole = async (selectedRole: Role) => {
    if (selectedRole === "admin") {
      // Bypass admin auth entirely if configured for dev/testing
      if (ADMIN_NO_PASSWORD) {
        setRole("admin");
        setScreen("admin");
        return;
      }
      // check if user is already signed in and admin
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user ?? null;
        if (user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          if (roles != null) {
            setRole("admin");
            setScreen("admin");
            return;
          }
        }
      } catch (err) {
        console.warn("Could not verify current user admin role", err);
      }

      // fallback to sign-in modal
      const ok = await openAuthModal("selectRole");
      if (ok) {
        setRole("admin");
        setScreen("admin");
      } else {
        alert("Admin access denied");
      }
    } else {
      setRole(selectedRole);
      setScreen("player");
    }
  };

  // Auth modal state & handlers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const authPasswordRef = useRef<HTMLInputElement | null>(null);

  const handleAuthModalSubmit = () => {
    const password = authPasswordRef.current?.value ?? "";
    // If password is frozen (dev mode), use the pinned password; otherwise, fall back to previous flow
    if (ADMIN_PASSWORD_FROZEN) {
      if (password === ADMIN_PASSWORD) {
        closeAuthModal(true);
        setAuthModalError(null);
      } else {
        setAuthModalError("Invalid admin password");
      }
      return;
    }

    // Fallback / future behavior could be added here; for now just use the pinned check
    if (password === ADMIN_PASSWORD) {
      closeAuthModal(true);
      setAuthModalError(null);
    } else {
      setAuthModalError("Invalid admin password");
    }
  };

  // Autofocus auth modal input when modal opens
  useEffect(() => {
    if (authModalOpen && authPasswordRef.current) {
      authPasswordRef.current.focus();
    }
  }, [authModalOpen]);

  // ---- ADMIN: create room ----
  const handleCreateRoom = async () => {
    // Ensure only admins can create a room
    // If ADMIN_NO_PASSWORD is enabled, allow create room without auth checks
    if (!ADMIN_NO_PASSWORD) {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user ?? null;
        let isAdmin = false;
        if (user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          isAdmin = roles != null;
        }
        if (!isAdmin) {
          const ok = await openAuthModal("createRoom");
          if (!ok) {
            setAdminError("Admin access required to create room");
            return;
          }
        }
      } catch (err) {
        // If anything goes wrong when checking admin, ask via modal
        const ok = await openAuthModal("createRoom");
        if (!ok) {
          setAdminError("Admin access required to create room");
          return;
        }
      }
    }
    setAdminError(null);
    setCreatingRoom(true);
    try {
      const deviceId = getOrCreateDeviceId();
      const code = Math.floor(1000 + Math.random() * 9000).toString();

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .insert({ code, status: "lobby" })
        .select("*")
        .single();

      if (roomError || !roomData) {
        throw roomError || new Error("Failed to create room");
      }

      const { data: playerData, error: playerErr } = await supabase
        .from("players")
        .insert({
          room_id: roomData.id,
          name: "Admin",
          role: "admin",
          device_id: deviceId,
        })
        .select("*")
        .single();

      if (playerErr || !playerData) {
        throw playerErr || new Error("Failed to create admin player");
      }

      setAdminRoom(roomData as Room);
      setAdminPlayer(playerData as Player);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setAdminError(err.message ?? "Unexpected error while creating room");
      } else {
        setAdminError("Unexpected error while creating room");
      }
    } finally {
      setCreatingRoom(false);
    }
  };

  // ---- PLAYER: join room (single name per device) ----
  const handleJoinRoom = async () => {
    setPlayerError(null);

    const code = roomCodeInput.trim();
    let name = playerNameInput.trim();
    const deviceId = getOrCreateDeviceId();
    const storedName = getStoredPlayerName();

    if (!code) {
      setPlayerError("Enter room code.");
      return;
    }
    if (storedName) {
      name = storedName;
      setPlayerNameInput(storedName);
    }

    if (!name) {
      setPlayerError("Enter your name once. It will be saved on this device.");
      return;
    }

    setJoining(true);
    try {
      // 1) find room
      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (roomErr) throw roomErr;
      if (!roomData) {
        setPlayerError("Room not found. Check the code with the host.");
        setJoining(false);
        return;
      }

      // 2) reuse or create player
      const { data: existingPlayer, error: existingErr } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomData.id)
        .eq("device_id", deviceId)
        .maybeSingle();

      let finalPlayer: Player;

      if (existingErr) throw existingErr;

      if (existingPlayer) {
        finalPlayer = existingPlayer as Player;
      } else {
        // first time this device joins this room -> charge entry fee
        const ok = await debitChips(TOMBOLA_ENTRY_FEE);
        if (!ok) {
          setPlayerError(
            `Not enough chips to join. You need at least ${TOMBOLA_ENTRY_FEE.toLocaleString()} chips.`
          );
          setJoining(false);
          return;
        }

        const { data: playerData, error: playerErr } = await supabase
          .from("players")
          .insert({
            room_id: roomData.id,
            name,
            role: "player",
            device_id: deviceId,
          })
          .select("*")
          .single();

        if (playerErr || !playerData) {
          throw playerErr || new Error("Failed to join room");
        }

        finalPlayer = playerData as Player;
        window.localStorage.setItem(PLAYER_NAME_KEY, name);
      }

      // 3) ensure tombola card exists for this (room, player)
      const finalCard = await ensurePlayerCard(roomData.id, finalPlayer.id);

      // 4) store room, player, card in state
      setPlayerRoom(roomData as Room);
      setPlayer(finalPlayer);
      setPlayerCard(finalCard);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setPlayerError(err.message ?? "Unexpected error while joining room");
      } else {
        setPlayerError("Unexpected error while joining room");
      }
    } finally {
      setJoining(false);
    }
  };

  // ---- VISUALS ----

  const renderSnow = () => (
    <div className="snow-layer">
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className={`snowflake snowflake-${i + 1}`}>
          ✻
        </span>
      ))}
    </div>
  );

  const renderHome = () => (
    <div className="space-y-8 text-center">
      <h1 className="text-3xl md:text-4xl font-semibold text-[#facc15] mb-2 flex items-center justify-center gap-3">
        🎄 Festive Family Fun
      </h1>
      <p className="text-slate-200 max-w-xl mx-auto text-sm md:text-base">
        One wallet of chips per device. Use chips to buy Tombola cards or join
        Deal or No Deal rounds. Cash is handled directly with the host in
        dollars.
      </p>
      <div className="grid gap-4 w-full max-w-md mx-auto">
        <button onClick={startTombolaFlow} className="primary-btn">
          🎁 Christmas Tombola (Multiplayer)
        </button>
        <button
          onClick={() => setScreen("deal")}
          className="primary-btn deal-btn"
        >
          🧑‍🎄 Deal or No Deal (5,000 chips)
        </button>
      </div>
      <div className="mt-6 max-w-md mx-auto space-y-2">
        <p className="text-xs text-slate-300">
          💵 Chips pricing (offline): 5,000 chips ≈ $5
        </p>
        <div className="buy-pack-row">
          <button
            className="buy-pack-btn"
            onClick={() => handleBuyChips(5000)}
            title="Buy 5,000 chips"
          >
            +5,000
          </button>
          <button
            className="buy-pack-btn"
            onClick={() => handleBuyChips(10000)}
            title="Buy 10,000 chips"
          >
            +10,000
          </button>
          <button
            className="buy-pack-btn"
            onClick={() => handleBuyChips(20000)}
            title="Buy 20,000 chips"
          >
            +20,000
          </button>
        </div>
      </div>
    </div>
  );

  const renderRoleSelect = () => (
    <div className="space-y-6 text-center">
      <h2 className="text-2xl md:text-3xl font-semibold text-[#facc15] mb-2">
        Choose your role
      </h2>
      <p className="text-slate-200 mb-4 text-sm md:text-base">
        Are you the host running the big screen, or a player on your own phone?
      </p>
      <div className="grid gap-4 w-full max-w-md mx-auto">
        <button
          onClick={() => handleSelectRole("admin")}
          className="primary-btn"
        >
          👑 I am the host (Admin)
        </button>
        <button onClick={() => handleSelectRole("player")} className="dark-btn">
          🎟️ I am a player
        </button>
      </div>
      <button onClick={goHome} className="nav-btn">
        ⬅️ Back to Home
      </button>
    </div>
  );

  // Admin “lobby” before a room exists
  const renderAdminLobby = () => (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl md:text-3xl font-semibold text-[#facc15] mb-2">
        👑 Host Lobby
      </h2>
      <p className="text-slate-200 text-sm md:text-base max-w-md mx-auto mb-4">
        Create a room and show the code on the big screen. Everyone else will
        join from their phones.
      </p>
      <button
        onClick={handleCreateRoom}
        disabled={creatingRoom}
        className="primary-btn"
      >
        {creatingRoom ? "Creating room..." : "Create Room"}
      </button>
      {adminError && <p className="text-sm text-red-400 mt-2">{adminError}</p>}
      <div className="pt-4 flex justify-center">
        <button onClick={() => setScreen("role-select")} className="nav-btn">
          ⬅️ Back
        </button>
      </div>
    </div>
  );

  // Player join screen / lobby
  const renderPlayerLobby = () => (
    <div className="space-y-4">
      <h2 className="text-2xl md:text-3xl font-semibold text-[#facc15] mb-2 text-center">
        🎟️ Player Lobby
      </h2>

      {!playerRoom && (
        <>
          <p className="text-slate-200 text-sm md:text-base text-center mb-4">
            Your name is stored on this device. You can join any room with the
            same name.
          </p>
          <div className="space-y-3 max-w-sm mx-auto">
            <input
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              maxLength={4}
              className="input-room"
              placeholder="ROOM"
            />
            {!getStoredPlayerName() && (
              <input
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                className="input-name"
                placeholder="Your name (only once)"
              />
            )}
            {getStoredPlayerName() && (
              <p className="text-xs text-emerald-300 text-center">
                Name locked on this device:{" "}
                <span className="font-semibold">{getStoredPlayerName()}</span>
              </p>
            )}
            <button
              onClick={handleJoinRoom}
              disabled={joining}
              className="primary-btn"
            >
              {joining ? "Joining..." : "Join Room"}
            </button>
            {playerError && (
              <p className="text-sm text-red-400 text-center">{playerError}</p>
            )}
          </div>
        </>
      )}

      {playerRoom && player && !playerCard && (
        <div className="mt-4 rounded-2xl border border-emerald-700 bg-emerald-900/20 px-4 py-3 text-center">
          <p className="text-sm text-emerald-100 mb-1">
            Joined room <span className="font-semibold">{playerRoom.code}</span>
          </p>
          <p className="text-lg font-semibold text-emerald-200">
            {player.name}
          </p>
          <p className="text-xs text-emerald-300">
            Loading your private tombola card…
          </p>
        </div>
      )}

      <div className="pt-4 text-center flex justify-between items-center">
        <button onClick={() => setScreen("role-select")} className="nav-btn">
          ⬅️ Back
        </button>
        <button onClick={goHome} className="nav-btn">
          🏠 Home
        </button>
      </div>
    </div>
  );

  // Buy ticket handler for PlayerScreen
  // PlayerScreen expects a function with signature (cost, cardNumbers) => Promise<{ok, ticket}>
  // We adapt that to call the existing buyTicketAtomic with the current room/player and return the expected shape.
  const buyTicket = async (
    cost: number,
    cardNumbers: unknown
  ): Promise<{ ok: boolean; ticket: unknown; message?: string }> => {
    if (!wallet || !playerRoom || !player) {
      return { ok: false, ticket: null };
    }

    try {
      // find the current game for this room
      const { data: game, error: gameErr } = await supabase
        .from("tombola_games")
        .select("*")
        .eq("room_id", playerRoom.id)
        .in("status", ["active", "waiting"]) // waiting games accept tickets too
        .limit(1)
        .maybeSingle();

      if (gameErr || !game) {
        // no active game for this room – charge locally/fallback
        const ok = await chargeChips(cost, "Buy tombola ticket (no game)");
        return { ok, ticket: null };
      }

      // Generate new random numbers for the purchased card
      const newCardNumbers = generateCardNumbers();

      // If wallet is local or not associated with a user, fall back to local charge and create a local ticket
      const userId = wallet.user_id;
      if (!userId || userId === "local") {
        const ok = await chargeChips(cost, `Buy tombola ticket`);
        if (!ok)
          return { ok: false, ticket: null, message: "Not enough chips" };
        const localTicket = {
          id: `local-${Date.now()}`,
          game_id: game.id,
          user_id: "local",
          card_numbers: newCardNumbers,
          marked_numbers: [],
          has_corner: false,
          has_line: false,
          has_full: false,
        } as const;
        return { ok: true, ticket: localTicket };
      }

      // Server-side: enforce max cards per player per game (4 total including initial card)
      const MAX_CARDS = 4;
      const { data: serverTickets, error: tErr } = await supabase
        .from("tombola_tickets")
        .select("id")
        .eq("game_id", game.id)
        .eq("user_id", userId as string);

      if (tErr) {
        return {
          ok: false,
          ticket: null,
          message: "Failed to validate card limit",
        };
      }

      const ticketCount = Array.isArray(serverTickets)
        ? serverTickets.length
        : 0;

      const { data: playerCards, error: cardErr } = await supabase
        .from("tombola_cards")
        .select("id")
        .eq("room_id", playerRoom.id)
        .eq("player_id", player.id);

      if (cardErr) {
        return {
          ok: false,
          ticket: null,
          message: "Failed to validate card limit",
        };
      }

      const playerCardCount = Array.isArray(playerCards)
        ? playerCards.length
        : 0;

      if (ticketCount + playerCardCount >= MAX_CARDS) {
        return {
          ok: false,
          ticket: null,
          message: `Card limit reached: you may only have up to ${MAX_CARDS} cards per round.`,
        };
      }

      // Use atomic buy ticket operation from wallet lib with user id
      const result = await buyTicketAtomic(
        userId as string,
        game.id,
        newCardNumbers,
        cost
      );
      // buyTicketAtomic returns an object with { ticket, wallet }, so check for ticket
      if (result && result.ticket) {
        setWallet(result.wallet as Wallet);
        return { ok: true, ticket: result.ticket };
      }
      return { ok: false, ticket: null };
    } catch (err: unknown) {
      console.error("Failed to buy ticket:", err);
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, ticket: null, message };
    }
  };

  return (
    <div className="app-root">
      {renderSnow()}
      <div className="app-card app-card-glow">
        <div className="wallet-pill">
          {walletLoading && <span>💰 Loading chips…</span>}
          {!walletLoading && wallet && (
            <span>
              💰 Chips: <strong>{wallet.balance.toLocaleString()}</strong>
            </span>
          )}
          {!walletLoading && !wallet && walletError && (
            <span>⚠️ {walletError}</span>
          )}
          <button
            className="btn-primary ml-3"
            onClick={() => setShowBuyModal(true)}
            title="Buy chips"
          >
            💳 Buy chips
          </button>
        </div>
        {screen === "home" && renderHome()}
        {screen === "role-select" && renderRoleSelect()}

        {screen === "admin" && role === "admin" && adminRoom && (
          <AdminScreen
            room={adminRoom}
            onBackHome={goHome}
            buyCode={buyCode}
            onSetBuyCode={(c) => setBuyCode(c)}
            systemWalletUserId={systemWalletUserId}
            onSetSystemWallet={(uid) => setSystemWalletUserId(uid)}
          />
        )}

        {/* If we're on admin role but haven't created a room yet, show the lobby */}
        {screen === "admin" &&
          role === "admin" &&
          !adminRoom &&
          renderAdminLobby()}

        {screen === "player" &&
          (!playerRoom || !player || !playerCard) &&
          renderPlayerLobby()}

        {screen === "player" && playerRoom && player && playerCard && (
          <PlayerScreen
            room={playerRoom}
            player={player}
            card={playerCard}
            onBackHome={goHome}
            walletBalance={wallet?.balance ?? null}
            creditChips={creditChips}
            chargeChips={chargeChips}
            onBuyTicket={buyTicket}
            onOpenBuyModal={() => setShowBuyModal(true)}
          />
        )}

        {screen === "deal" && (
          <DealScreen
            onBackHome={goHome}
            walletBalance={wallet?.balance ?? null}
            onRoundFinished={async (amount: number) => {
              // credit winner: prefer to debit system wallet if configured
              try {
                if (
                  systemWalletUserId &&
                  wallet &&
                  wallet.id &&
                  wallet.user_id !== "local"
                ) {
                  // transfer from system to current player's wallet id
                  await transferFromSystemToWallet(
                    wallet.id,
                    amount,
                    "Deal or No Deal payout"
                  );
                } else {
                  await creditChips(amount);
                }
              } catch (err) {
                console.error("Failed to credit deal winner:", err);
                // fallback to credit locally
                await creditChips(amount);
              }
            }}
            onEntryFee={debitChips}
          />
        )}

        {authModalOpen && (
          <div className="modal-overlay" onClick={() => closeAuthModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2 className="section-title">Admin Sign-in</h2>
              <p className="helper-text">Enter the admin password</p>
              <input
                ref={authPasswordRef}
                type="password"
                className="input-name mt-2"
                placeholder="Password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAuthModalSubmit();
                }}
              />
              {authModalError && (
                <p className="helper-text text-danger">{authModalError}</p>
              )}
              <div className="pt-4 text-right">
                <button
                  className="btn-secondary mr-2"
                  onClick={() => closeAuthModal(false)}
                >
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleAuthModalSubmit}>
                  Verify
                </button>
              </div>
            </div>
          </div>
        )}

        {showBuyModal && (
          <div className="modal-overlay" onClick={() => setShowBuyModal(false)}>
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 520 }}
            >
              <h2 className="section-title">Buy chips</h2>
              <p className="helper-text mb-2">
                Chips are credited immediately by the app — collect cash from
                the host. Choose a pack to buy or enter a custom amount.
              </p>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    className={`btn-secondary ${
                      buyAmount === amt ? "ring-2 ring-emerald-400" : ""
                    }`}
                    onClick={() => setBuyAmount(amt)}
                  >
                    {amt.toLocaleString()} chips
                    <br />
                    <span className="text-xs text-slate-400">
                      {(amt / 1000).toLocaleString()}00,000 LBP
                    </span>
                  </button>
                ))}
              </div>

              <div className="mb-3">
                <label className="block text-slate-200 mb-2">
                  Custom chips
                </label>
                <input
                  type="number"
                  className="input-name"
                  min={100}
                  step={100}
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(Number(e.target.value))}
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-400">
                  1,000 chips = 100,000 LBP • Minimum cashout 10,000 chips
                </div>
                <div>
                  <button
                    className="btn-secondary mr-2"
                    onClick={() => setShowBuyModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      setBuying(true);
                      try {
                        await creditChips(buyAmount);
                        setShowBuyModal(false);
                      } catch (err) {
                        console.error("Buy chips failed", err);
                        alert("Failed to add chips. Please try again.");
                      } finally {
                        setBuying(false);
                      }
                    }}
                    disabled={buying}
                  >
                    {buying
                      ? "Adding…"
                      : `Buy ${buyAmount.toLocaleString()} chips`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showWhatsAppConfirmModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowWhatsAppConfirmModal(false)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 420 }}
            >
              <h2 className="section-title">WhatsApp confirmation</h2>
              <p className="helper-text mb-2">
                A WhatsApp chat with the host was opened — send them the message
                and ask for the 4-digit code. If the chat did not open, press
                "Open WhatsApp".
              </p>
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-slate-400">Admin phone:</div>
                  <div className="font-semibold">+961 70 126 177</div>
                </div>
                <div>
                  <label className="block text-slate-200 mb-1">
                    Your phone (for admin to send code)
                  </label>
                  <input
                    type="tel"
                    className="input-name w-full"
                    value={buyPhoneInput}
                    onChange={(e) => {
                      setBuyPhoneInput(e.target.value);
                      try {
                        window.localStorage.setItem(
                          "fff_buy_phone",
                          e.target.value
                        );
                      } catch (err) {
                        console.warn("Could not persist buy phone", err);
                      }
                    }}
                    placeholder="e.g. +96170123456"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-4">
                <button
                  className="btn-secondary"
                  onClick={() => setShowWhatsAppConfirmModal(false)}
                >
                  Cancel
                </button>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      // Insert buy request and open WhatsApp to message admin
                      const phone = "96170126177";
                      const message = `Hi, I want to buy ${buyModalAmount?.toLocaleString()} chips. My phone: ${
                        buyPhoneInput || ""
                      }`;

                      try {
                        const deviceId = getOrCreateDeviceId();
                        const res = await supabase
                          .from("buy_requests")
                          .insert({
                            room_id: playerRoom?.id ?? null,
                            device_id: deviceId,
                            name: getStoredPlayerName() || player?.name || "",
                            phone: buyPhoneInput ?? "",
                            amount: buyModalAmount ?? 0,
                          })
                          .select("*")
                          .single();
                        if (res.error) {
                          console.warn(
                            "Failed to create buy request",
                            res.error
                          );
                        } else {
                          setPendingBuyRequestId(res.data.id);
                        }
                      } catch (err) {
                        console.warn("Failed to create buy request", err);
                      }
                      const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(
                        phone
                      )}&text=${encodeURIComponent(message)}`;
                      window.open(url, "_blank");
                    }}
                  >
                    Open WhatsApp
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setShowWhatsAppConfirmModal(false);
                      setShowBuyCodeModal(true);
                    }}
                  >
                    I messaged the admin
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBuyCodeModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowBuyCodeModal(false)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 420 }}
            >
              <h2 className="section-title">Enter purchase code</h2>
              <p className="helper-text mb-2">
                Enter the 4-digit code sent by the admin after WhatsApp message.
              </p>
              <input
                type="text"
                maxLength={4}
                value={buyCodeInput}
                onChange={(e) =>
                  setBuyCodeInput(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="input-name mt-2"
                placeholder="0000"
              />
              <div className="flex justify-between items-center pt-4">
                <button
                  className="btn-secondary"
                  onClick={() => setShowBuyCodeModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    if (!buyModalAmount) return;
                    // If we have a pending buy request id, validate it server-side
                    if (pendingBuyRequestId) {
                      try {
                        const { data: br, error } = await supabase
                          .from("buy_requests")
                          .select("*")
                          .eq("id", pendingBuyRequestId)
                          .maybeSingle();
                        if (error) throw error;
                        if (!br || !br.code || br.status !== "issued") {
                          alert(
                            "This purchase has not been confirmed by the host yet. Wait for the host to confirm and send the code."
                          );
                          return;
                        }
                        if (String(br.code) !== buyCodeInput) {
                          alert("Invalid code. Ask host for the 4-digit code.");
                          return;
                        }
                        // mark as completed and credit
                        await supabase
                          .from("buy_requests")
                          .update({ status: "completed" })
                          .eq("id", pendingBuyRequestId);
                        setPendingBuyRequestId(null);
                        await creditChips(buyModalAmount);
                        setShowBuyCodeModal(false);
                        setBuyModalAmount(null);
                        return;
                      } catch (err) {
                        console.error("Failed to validate buy code", err);
                        alert(
                          "Failed to validate code. Please try again later."
                        );
                        return;
                      }
                    }

                    if (!buyCode || buyCode !== buyCodeInput) {
                      alert("Invalid code. Ask host for the 4-digit code.");
                      return;
                    }
                    await creditChips(buyModalAmount);
                    setShowBuyCodeModal(false);
                    setBuyModalAmount(null);
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
