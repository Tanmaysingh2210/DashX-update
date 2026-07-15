const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export function pageView(path) {
  if (!window.gtag) return;

  window.gtag("config", GA_ID, {
    page_path: path,
  });
}

export function trackEvent(eventName, parameters = {}) {
  if (!window.gtag) return;

  window.gtag("event", eventName, parameters);
}

export const trackPageView = () => {
    if (!window.gtag) return;

    window.gtag("event", "page_view", {
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname,
    });
};