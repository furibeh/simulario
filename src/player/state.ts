/** Pure player state machine. The cursor counts steps shown: 0 = before the first step. */

export type PlayerStatus = "idle" | "playing" | "paused" | "ended";

export interface PlayerState {
  cursor: number;
  total: number;
  status: PlayerStatus;
}

export type PlayerAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "tick" }
  | { type: "stepForward" }
  | { type: "stepBack" }
  | { type: "toStart" }
  | { type: "toEnd" }
  | { type: "reset"; total: number };

export function initialPlayerState(total: number): PlayerState {
  return { cursor: 0, total: Math.max(0, total), status: "idle" };
}

function settle(cursor: number, total: number, moving: boolean): PlayerState {
  const clamped = Math.min(Math.max(cursor, 0), total);
  if (clamped >= total && total > 0) return { cursor: total, total, status: "ended" };
  if (clamped === 0 && !moving) return { cursor: 0, total, status: "idle" };
  return { cursor: clamped, total, status: moving ? "playing" : "paused" };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  const { cursor, total, status } = state;
  switch (action.type) {
    case "play":
      if (total === 0) return state;
      // Playing from the end starts over.
      return { cursor: status === "ended" ? 0 : cursor, total, status: "playing" };
    case "pause":
      return status === "playing" ? settle(cursor, total, false) : state;
    case "toggle":
      return playerReducer(state, { type: status === "playing" ? "pause" : "play" });
    case "tick":
      return status === "playing" ? settle(cursor + 1, total, true) : state;
    case "stepForward":
      return settle(cursor + 1, total, false);
    case "stepBack":
      return settle(cursor - 1, total, false);
    case "toStart":
      return settle(0, total, false);
    case "toEnd":
      return settle(total, total, false);
    case "reset":
      return initialPlayerState(action.total);
  }
}

/** Keyboard shortcuts while focus is inside the player. */
export function actionForKey(key: string): PlayerAction | null {
  switch (key) {
    case " ":
      return { type: "toggle" };
    case "ArrowRight":
      return { type: "stepForward" };
    case "ArrowLeft":
      return { type: "stepBack" };
    case "Home":
      return { type: "toStart" };
    case "End":
      return { type: "toEnd" };
    default:
      return null;
  }
}
