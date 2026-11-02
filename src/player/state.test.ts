import { describe, expect, it } from "vitest";
import { actionForKey, initialPlayerState, type PlayerAction, playerReducer } from "./state";

const run = (total: number, ...actions: PlayerAction[]) =>
  actions.reduce(playerReducer, initialPlayerState(total));

describe("playerReducer", () => {
  it("starts idle at cursor 0", () => {
    expect(initialPlayerState(3)).toEqual({ cursor: 0, total: 3, status: "idle" });
  });

  it("plays tick by tick and ends on the last step", () => {
    expect(run(3, { type: "play" }, { type: "tick" })).toEqual({
      cursor: 1,
      total: 3,
      status: "playing",
    });
    expect(run(3, { type: "play" }, { type: "tick" }, { type: "tick" }, { type: "tick" })).toEqual({
      cursor: 3,
      total: 3,
      status: "ended",
    });
  });

  it("ignores ticks unless playing", () => {
    expect(run(3, { type: "tick" }).cursor).toBe(0);
    expect(run(3, { type: "play" }, { type: "pause" }, { type: "tick" }).cursor).toBe(0);
  });

  it("pauses mid-run and toggles back", () => {
    const paused = run(3, { type: "play" }, { type: "tick" }, { type: "toggle" });
    expect(paused.status).toBe("paused");
    expect(playerReducer(paused, { type: "toggle" }).status).toBe("playing");
  });

  it("steps without playing and clamps at both ends", () => {
    expect(run(2, { type: "stepBack" })).toEqual({ cursor: 0, total: 2, status: "idle" });
    expect(run(2, { type: "stepForward" })).toEqual({ cursor: 1, total: 2, status: "paused" });
    expect(
      run(2, { type: "stepForward" }, { type: "stepForward" }, { type: "stepForward" }),
    ).toEqual({ cursor: 2, total: 2, status: "ended" });
  });

  it("stepping stops playback", () => {
    expect(run(5, { type: "play" }, { type: "stepForward" }).status).toBe("paused");
  });

  it("jumps to start and end", () => {
    expect(run(4, { type: "toEnd" })).toEqual({ cursor: 4, total: 4, status: "ended" });
    expect(run(4, { type: "toEnd" }, { type: "toStart" })).toEqual({
      cursor: 0,
      total: 4,
      status: "idle",
    });
  });

  it("restarts from 0 when playing after the end", () => {
    expect(run(2, { type: "toEnd" }, { type: "play" })).toEqual({
      cursor: 0,
      total: 2,
      status: "playing",
    });
  });

  it("does nothing on an empty trace and resets to a new length", () => {
    expect(run(0, { type: "play" }).status).toBe("idle");
    expect(run(3, { type: "toEnd" }, { type: "reset", total: 5 })).toEqual(initialPlayerState(5));
  });
});

describe("actionForKey", () => {
  it("maps the documented shortcuts", () => {
    expect(actionForKey(" ")).toEqual({ type: "toggle" });
    expect(actionForKey("ArrowRight")).toEqual({ type: "stepForward" });
    expect(actionForKey("ArrowLeft")).toEqual({ type: "stepBack" });
    expect(actionForKey("Home")).toEqual({ type: "toStart" });
    expect(actionForKey("End")).toEqual({ type: "toEnd" });
    expect(actionForKey("a")).toBeNull();
  });
});
