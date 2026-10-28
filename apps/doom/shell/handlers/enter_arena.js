// Pure Jessie handler for lobby configuration and match entry.
(state, _event) => {
  const match = state.rows?.match?.[0] ?? state.items?.[0];
  if (!match) throw new Error("enter_arena: match row is required");
  if (typeof match.id !== "string") {
    throw new TypeError("enter_arena: match id must be string");
  }
  const matchId = match.id;
  return {
    updates: [
      {
        op: "patch",
        id: matchId,
        entity: "match",
        row: {
          frag_limit: 10,
          status: "warmup",
          frags_us: 0,
          frags_them: 0,
          winner: ""
        }
      },
      {
        op: "patch",
        id: "player-local",
        entity: "player",
        row: {
          health: 100,
          armor: 50,
          ammo: 50,
          weapon: "shotgun",
          in_pain: "false",
          is_god: "false",
          health_tier: "healthy"
        }
      }
    ],
    effects: [
      {
        op: "delete",
        entity: "frag",
        filter: "tick=gte.0"
      }
    ]
  };
};
