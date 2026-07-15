import User from "../models/User.js";

// ─── GET /sitemap.xml ─────────────────────────────────────────────────────────

/**
 * Generates a dynamic XML sitemap.
 *
 * Includes:
 *   - Static pages (homepage)
 *   - All public user profiles (/u/:username)
 *
 * Called by Googlebot on every crawl — MongoDB query is fast because
 * we only select two fields and filter on indexed isPublic flag.
 */
export const getSitemap = async (req, res) => {
    try {
        const BASE = process.env.CLIENT_URL;
        const today = new Date().toISOString().split("T")[0];

        // fetch all public, setup-complete users
        const users = await User.find({
            isPublic: { $ne: false },
            leetcodeUsername: { $ne: null },
        })
            .select("githubUsername updatedAt")
            .lean();

        const staticUrls = `
  <url>
    <loc>${BASE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

        const profileUrls = users
            .map((u) => {
                const lastmod = u.updatedAt
                    ? new Date(u.updatedAt).toISOString().split("T")[0]
                    : today;
                return `
  <url>
    <loc>${BASE}/u/${u.githubUsername}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
            })
            .join("");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${profileUrls}
</urlset>`;

        res.set("Content-Type", "application/xml");
        res.set("Cache-Control", "public, max-age=3600"); // cache 1hr
        res.status(200).send(xml);
    } catch (err) {
        console.error("[getSitemap] error:", err.message);
        res.status(500).send("<?xml version='1.0'?><error>Sitemap generation failed</error>");
    }
};

// ─── GET /robots.txt ─────────────────────────────────────────────────────────

/**
 * Serves robots.txt dynamically so the Sitemap URL always points
 * to the backend (where the dynamic sitemap lives).
 */
export const getRobots = (req, res) => {
    const BASE = "https://dashx.aalsicoders.in";

    const content = `User-agent: *
Allow: /
Allow: /u/

# App routes require login — no point indexing
Disallow: /dashboard
Disallow: /activity
Disallow: /settings
Disallow: /setup
Disallow: /auth/

# AI crawlers — allow full access for AEO
User-agent: GPTBot
Allow: /
Allow: /u/

User-agent: PerplexityBot
Allow: /
Allow: /u/

User-agent: Google-Extended
Allow: /
Allow: /u/

User-agent: ClaudeBot
Allow: /
Allow: /u/

Sitemap: ${BASE}/sitemap.xml
`;

    res.set("Content-Type", "text/plain");
    res.set("Cache-Control", "public, max-age=86400");
    res.status(200).send(content);
};
