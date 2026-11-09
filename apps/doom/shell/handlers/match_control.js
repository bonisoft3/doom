// Pure Jessie handler for the arena's match controls. START starts a match in
// warmup and PLAY AGAIN resets one; the engine follows the match row through
// boot.js's store sync, so the row is all this writes.
(state, event) => {
  const match = state.rows?.match?.[0] ?? state.items?.[0];
  if (!match) throw new Error("match_control: match row is required");
  if (typeof match.id !== "string") {
    throw new TypeError("match_control: match id must be string");
  }
  if (event.type !== "click") return { updates: [] };
  const starts = ["btn-start", "skill-0", "skill-1", "skill-2", "skill-3", "skill-4"];
  if (starts.includes(event.from) && match.status === "warmup") {
    return { updates: [{ op: "patch", entity: "match", id: match.id, row: { status: "active" } }] };
  }
  if (event.from === "btn-rematch" || event.from === "pause-title") {
    return {
      updates: [{
        op: "patch",
        entity: "match",
        id: match.id,
        row: { status: "warmup", frags_us: 0, frags_them: 0, winner: "" },
      }],
    };
  }
  return { updates: [] };
}
