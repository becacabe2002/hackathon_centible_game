// persistence.ts
import type { GameState } from "./gameState";

const KEY = "centible_game_v1";

export function saveGame(game: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // no-op
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
