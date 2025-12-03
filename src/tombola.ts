// src/types/tombola.ts
export type RoomStatus = "lobby" | "running" | "finished";

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  created_at: string;
  // whether the host is currently shuffling (for sync across clients)
  is_shuffling?: boolean;
  // optional in-flight number used to synchronize drop animations across clients
  in_flight_number?: number | null;
}

export type Role = "admin" | "player";

export interface Player {
  id: string;
  room_id: string;
  name: string;
  role: Role;
  device_id: string;
  created_at: string;
}

export interface TombolaCard {
  id: string;
  room_id: string;
  player_id: string;
  numbers: number[]; // 15 numbers
  created_at: string;
}

export interface TombolaDraw {
  id: string;
  room_id: string;
  number: number;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at?: string | null;
}
