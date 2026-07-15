/**
 * Extracts a LeetCode username from raw input.
 *
 * Handles these common formats:
 *   - "username"
 *   - "https://leetcode.com/username"
 *   - "https://leetcode.com/username/"
 *   - "https://leetcode.com/u/username"
 *   - "https://leetcode.com/u/username/"
 *   - "leetcode.com/u/username"
 *   - "leetcode.com/username/"
 *
 * @param {string} raw - The raw input from the user.
 * @returns {string} The extracted username (trimmed, no slashes).
 */
export const extractLeetCodeUsername = (raw) => {
  if (!raw || typeof raw !== "string") return "";

  let value = raw.trim();

  // If it looks like a URL, try to pull the username out of the path
  if (value.includes("leetcode.com")) {
    try {
      // Ensure the value has a protocol so the URL constructor can parse it
      const withProtocol = value.startsWith("http")
        ? value
        : `https://${value}`;

      const url = new URL(withProtocol);
      // pathname = "/u/username/" or "/username/" or "/username"
      const segments = url.pathname.split("/").filter(Boolean);

      if (segments.length === 0) return "";

      // /u/<username> → take the segment after "u"
      if (segments[0] === "u" && segments.length >= 2) {
        return segments[1];
      }

      // /<username> → take the first segment
      return segments[0];
    } catch {
      // URL parsing failed — fall through and return the original trimmed value
    }
  }

  return value;
};
