/**
 * Codeforces rank color mapping (official CF rank colors)
 */
export const CF_RANK_COLORS = {
  "newbie": "#808080",
  "pupil": "#008000",
  "specialist": "#03a89e",
  "expert": "#0000ff",
  "candidate master": "#aa00aa",
  "master": "#ff8c00",
  "international master": "#ff8c00",
  "grandmaster": "#ff0000",
  "international grandmaster": "#ff0000",
  "legendary grandmaster": "#ff0000",
};

export const getCfRankColor = (rank) => {
  if (!rank) return "var(--color-outline)";
  return CF_RANK_COLORS[rank.toLowerCase()] || "var(--color-outline)";
};

/**
 * Formats a CF rating change contest entry for the graph tooltip.
 */
export const formatRatingChange = (entry) => {
  const change = entry.newRating - entry.oldRating;
  return {
    date: new Date(entry.ratingUpdateTimeSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    contest: entry.contestName,
    rank: entry.rank,
    oldRating: entry.oldRating,
    newRating: entry.newRating,
    change,
    changeSign: change >= 0 ? "+" : "",
  };
};
