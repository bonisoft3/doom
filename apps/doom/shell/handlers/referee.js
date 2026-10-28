// Match referee reducer written in pure Jessie (SES Compartment).
(match, action) => {
  if (!match || typeof match !== "object") {
    throw new Error("referee: match row object is required");
  }
  if (!action || typeof action.type !== "string") {
    throw new TypeError("referee: action with string type is required");
  }

  let actionType = action.type;
  if (actionType === "click") {
    if (action.from === "btn-start") actionType = "START";
    else if (action.from === "btn-rematch") actionType = "RESET";
    else throw new TypeError(`referee: unhandled click from ${action.from}`);
  }

  switch (actionType) {
    case "START": {
      if (match.status !== "warmup") {
        throw new Error(`referee: cannot START from status ${match.status}`);
      }
      return {
        ...match,
        status: "active"
      };
    }

    case "FRAG": {
      if (match.status !== "active") {
        throw new Error(`referee: cannot FRAG from status ${match.status}`);
      }
      if (action.killer !== "us" && action.killer !== "them") {
        throw new RangeError(`referee: killer must be 'us' or 'them', got ${action.killer}`);
      }

      const isUs = action.killer === "us";
      const nextUs = isUs ? match.frags_us + 1 : match.frags_us;
      const nextThem = !isUs ? match.frags_them + 1 : match.frags_them;
      const isCampaign = match.mode === "campaign";
      const limit = match.frag_limit;
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new RangeError(`referee: invalid frag_limit ${limit}`);
      }
      const isOver = isCampaign ? !isUs : (nextUs >= limit || nextThem >= limit);

      return {
        ...match,
        frags_us: nextUs,
        frags_them: nextThem,
        status: isOver ? "over" : "active",
        winner: isOver ? (!isCampaign && nextUs >= limit ? "us" : "them") : ""
      };
    }

    case "RESET": {
      const limit = action.frag_limit ?? match.frag_limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new RangeError(`referee: invalid frag_limit ${limit}`);
      }
      return {
        ...match,
        frags_us: 0,
        frags_them: 0,
        frag_limit: limit,
        status: "warmup",
        winner: ""
      };
    }

    default:
      throw new TypeError(`referee: unknown action type ${actionType}`);
  }
};
