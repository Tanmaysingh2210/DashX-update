import { useEffect } from "react";

/**
 * useMeta
 *
 * Sets document.title and meta tags dynamically for the public profile page.
 * This handles the case where a real user visits /u/:username and then
 * shares the URL — the browser tab title and any meta already in head
 * will reflect the profile.
 *
 * Note: Social crawlers don't execute JS, so they won't see these tags.
 * That's handled by the backend /public/og/:username endpoint + Vercel rewrite.
 *
 * @param {{ title, description, image, url }} meta
 */
const useMeta = ({ title, description, image, url }) => {
  useEffect(() => {
    if (!title) return;

    // title
    document.title = title;

    // helper to set or create a meta tag
    const setMeta = (attr, key, value) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    setMeta("name",     "description",       description);
    setMeta("property", "og:title",          title);
    setMeta("property", "og:description",    description);
    setMeta("property", "og:image",          image);
    setMeta("property", "og:url",            url);
    setMeta("name",     "twitter:title",     title);
    setMeta("name",     "twitter:description", description);
    setMeta("name",     "twitter:image",     image);

    // canonical
    let canonical = document.querySelector("link[rel='canonical']");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    // cleanup — restore defaults when component unmounts
    return () => {
      document.title = "DashX — Track Your Coding Consistency";
    };
  }, [title, description, image, url]);
};

export default useMeta;