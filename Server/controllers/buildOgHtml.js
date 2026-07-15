/**
 * buildOgHtml
 *
 * Generates HTML with OG + Twitter meta tags for social crawlers.
 *
 * WhatsApp specific requirements (from Meta docs):
 *   - og:image must be absolute URL
 *   - og:image must be under 600KB
 *   - og:image width must be >= 300px
 *   - og:image aspect ratio must be <= 4:1 (width/height)
 *   - og:description should be under 80 characters for best display
 *   - All meta tags must appear within first 300KB of HTML
 *
 * The JS redirect is kept simple — it only fires for real browsers,
 * not crawlers (they don't execute JS anyway).
 */

// prevent XSS in HTML attributes
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");



export const buildOgHtml = ({ title, description, image, url, username, leetcode, stats, memberSince }) => {

  // WhatsApp truncates description to ~80 chars — make the first 80 count
  const shortDescription = description.length > 80
    ? description.substring(0, 77) + "..."
    : description;

  const memberYear = memberSince ? new Date(memberSince).getFullYear() : null;

  const personSchema = username ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "name": title,
    "url": url,
    "description": description,
    "dateModified": new Date().toISOString().split("T")[0],
    "mainEntity": {
      "@type": "Person",
      "name": username,
      "url": url,
      "sameAs": [
        `https://github.com/${username}`,
        ...(leetcode ? [`https://leetcode.com/${leetcode}`] : [])
      ],
      "knowsAbout": ["Software Development", "Competitive Programming", "Data Structures and Algorithms"],
      "description": description,
      ...(stats ? {
        "interactionStatistic": [
          {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/WriteAction",
            "name": "GitHub Contributions (12 months)",
            "userInteractionCount": stats.githubTotal || 0
          },
          {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/WriteAction",
            "name": "LeetCode Submissions (12 months)",
            "userInteractionCount": stats.leetcodeTotal || 0
          }
        ]
      } : {})
    }
  }, null, 2) : JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "url": url,
    "description": description
  }, null, 2);

  // ensure image URL is always absolute
  const absoluteImage = image && image.startsWith("http")
    ? image
    : "https://dashx.aalsicoders.in/og-image.png";

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(shortDescription)}" />
  <link rel="canonical" href="${url}" />

  <!-- Open Graph — WhatsApp, LinkedIn, Discord, Telegram, Slack, Facebook -->
  <meta property="og:type"         content="${username ? "profile" : "website"}" />
  <meta property="og:site_name"    content="DashX" />
  <meta property="og:url"          content="${url}" />
  <meta property="og:title"        content="${escapeHtml(title)}" />
  <meta property="og:description"  content="${escapeHtml(shortDescription)}" />
  <meta property="og:image"        content="${absoluteImage}" />
  <meta property="og:image:width"  content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:image:type"   content="image/png" />
  <meta property="og:image:alt"    content="${escapeHtml(username ? `${username}'s coding profile on DashX` : "DashX developer dashboard")}" />
  <meta property="og:locale"       content="en_US" />
  ${username ? `<meta property="profile:username" content="${username}" />` : ""}

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:site"        content="@aalsicoders" />
  <meta name="twitter:title"       content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(shortDescription)}" />
  <meta name="twitter:image"       content="${absoluteImage}" />

  <!-- JSON-LD structured data for Google + AI search engines -->
  <script type="application/ld+json">${personSchema}</script>

  <!-- Redirect real browsers to the SPA — bots don't run JS -->
  <script>window.location.replace("${url}");</script>
</head>
<body>
  <noscript>
    <p>Redirecting to <a href="${url}">${escapeHtml(title)}</a>…</p>
  </noscript>
</body>
</html>`;
};

