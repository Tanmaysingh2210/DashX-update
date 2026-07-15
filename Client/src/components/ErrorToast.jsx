import { useEffect, useState } from "react";
import "./ErrorToast.css";

/**
 * ErrorToast
 *
 * Shows an error message that:
 *   1. Fades in when `message` appears
 *   2. Auto-dismisses after `duration` ms with a fade-out animation
 *   3. Calls `onDismiss` after the animation completes — parent sets error=null
 *   4. Has an X button to dismiss manually
 *
 * Uses a two-phase approach:
 *   - `visible` state controls whether the DOM element exists
 *   - `fading` state triggers the CSS fade-out class before unmounting
 *
 * This avoids the "empty space" bug — the element is fully removed from
 * the DOM after the animation, so it takes zero height.
 */
const ErrorToast = ({ message, onDismiss, duration = 5000 }) => {
  const [fading, setFading] = useState(false);

  // start fade-out after `duration` ms, then call onDismiss after animation
  useEffect(() => {
    if (!message) return;

    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, duration);

    return () => clearTimeout(fadeTimer);
  }, [message, duration]);

  // once fading starts, wait for the CSS transition (300ms) then unmount
  useEffect(() => {
    if (!fading) return;
    const removeTimer = setTimeout(() => {
      onDismiss();
      setFading(false);
    }, 320);
    return () => clearTimeout(removeTimer);
  }, [fading, onDismiss]);

  if (!message) return null;

  return (
    <div className={`error-toast ${fading ? "error-toast--fading" : ""}`}>
      <span className="error-toast__message">{message}</span>
      <button
        className="error-toast__close"
        onClick={() => setFading(true)}
        type="button"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

export default ErrorToast;