import User from "../models/User.js";
import Activity from "../models/Activity.js";
import { calculateStreaks } from "../services/activityService.js";
import { buildOgHtml } from "./buildOgHtml.js";

// ─── GET /public/:username — JSON for frontend ────────────────────────────────

export const getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({
      githubUsername: { $regex: new RegExp(`^${username}$`, "i") },
    }).select("githubUsername leetcodeUsername avatar isPublic longestStreak createdAt");

    if (!user)                   return res.status(404).json({ success: false, message: "Profile not found" });
    if (user.isPublic === false)  return res.status(404).json({ success: false, message: "This profile is private" });
    if (!user.leetcodeUsername)   return res.status(404).json({ success: false, message: "Profile setup not complete" });

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today      = new Date().toISOString().split("T")[0];

    const days = await Activity.find({
      userId:     user._id,
      date:       { $gte: oneYearAgo, $lte: today },
      totalCount: { $gt: 0 },
    })
      .sort({ date: 1 })
      .select("-_id date githubCount leetcodeCount totalCount")
      .lean();

    const { currentStreak, longestStreak } = calculateStreaks(days);

    const githubTotal    = days.reduce((s, d) => s + d.githubCount,   0);
    const leetcodeTotal  = days.reduce((s, d) => s + d.leetcodeCount, 0);

    const activeDateSet = new Set(days.map((d) => d.date));
    let activeIn30 = 0;
    const todayDate = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() - i))
        .toISOString().split("T")[0];
      if (activeDateSet.has(d)) activeIn30++;
    }
    const consistency    = Math.round((activeIn30 / 30) * 100);
    const sevenDaysAgo   = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() - 6)).toISOString().split("T")[0];
    const last7          = days.filter((d) => d.date >= sevenDaysAgo);
    const githubWeekly   = last7.reduce((s, d) => s + d.githubCount,   0);
    const leetcodeWeekly = last7.reduce((s, d) => s + d.leetcodeCount, 0);

    res.status(200).json({
      success: true,
      profile: {
        githubUsername:   user.githubUsername,
        leetcodeUsername: user.leetcodeUsername,
        avatar:           user.avatar,
        memberSince:      user.createdAt,
      },
      stats: {
        currentStreak,
        longestStreak:   Math.max(longestStreak, user.longestStreak || 0),
        githubTotal,
        leetcodeTotal,
        githubWeekly,
        leetcodeWeekly,
        consistency,
        activeIn30,
        totalActiveDays: days.length,
      },
      days,
    });
  } catch (err) {
    console.error("[getPublicProfile] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /public/og/:username — HTML for crawlers ────────────────────────────

export const getProfileOgPage = async (req, res) => {
  try {
    const { username } = req.params;
    const BASE = "https://dashx.aalsicoders.in";
    const FALLBACK_IMAGE = `${BASE}/og-image.png`;

    const user = await User.findOne({
      githubUsername: { $regex: new RegExp(`^${username}$`, "i") },
    }).select("githubUsername leetcodeUsername avatar isPublic longestStreak createdAt");

    if (!user || user.isPublic === false || !user.leetcodeUsername) {
      return res.send(buildOgHtml({
        title:       "DashX — Developer Profile",
        description: "Track your coding consistency across GitHub and LeetCode.",
        image:       FALLBACK_IMAGE,
        url:         `${BASE}/u/${username}`,
      }));
    }

    // fetch stats for rich description
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const days = await Activity.find({
      userId:     user._id,
      date:       { $gte: oneYearAgo },
      totalCount: { $gt: 0 },
    }).select("-_id date totalCount githubCount leetcodeCount").lean();

    const { currentStreak, longestStreak } = calculateStreaks(days);
    const bestStreak     = Math.max(longestStreak, user.longestStreak || 0);
    const githubTotal    = days.reduce((s, d) => s + d.githubCount,   0);
    const leetcodeTotal  = days.reduce((s, d) => s + d.leetcodeCount, 0);

    const activeDates = new Set(days.map((d) => d.date));
    let activeIn30 = 0;
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
        .toISOString().split("T")[0];
      if (activeDates.has(d)) activeIn30++;
    }
    const consistency = Math.round((activeIn30 / 30) * 100);

    const profileUrl = `${BASE}/u/${user.githubUsername}`;

    // rich description — specific numbers make AI engines extract facts accurately
    const description = [
      `${user.githubUsername} is a developer tracked on DashX.`,
      `Current streak: ${currentStreak} days.`,
      `Best streak: ${bestStreak} days.`,
      `GitHub contributions in last 12 months: ${githubTotal}.`,
      `LeetCode submissions in last 12 months: ${leetcodeTotal}.`,
      `Consistency score: ${consistency}% (${activeIn30} active days out of last 30).`,
      `View full activity heatmap at ${profileUrl}.`,
    ].join(" ");

    res.send(buildOgHtml({
      title:       `${user.githubUsername} — Developer Profile on DashX`,
      description,
      image:       user.avatar || FALLBACK_IMAGE,
      url:         profileUrl,
      username:    user.githubUsername,
      leetcode:    user.leetcodeUsername,
      memberSince: user.createdAt,
      stats:       { currentStreak, longestStreak: bestStreak, consistency, githubTotal, leetcodeTotal },
    }));
  } catch (err) {
    console.error("[getProfileOgPage] error:", err.message);
    res.status(500).send("<html><body>Error generating profile page</body></html>");
  }
};

// ─── PATCH /public/privacy ────────────────────────────────────────────────────

export const updatePrivacy = async (req, res) => {
  try {
    const { isPublic } = req.body;
    if (typeof isPublic !== "boolean") {
      return res.status(400).json({ success: false, message: "isPublic must be a boolean" });
    }
    await User.findByIdAndUpdate(req.user._id, { isPublic });
    res.status(200).json({ success: true, message: `Profile is now ${isPublic ? "public" : "private"}`, isPublic });
  } catch (err) {
    console.error("[updatePrivacy] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
