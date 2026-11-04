/**
 * The Lopsi L: the app's logomark. Under 24 px it drops its fine detail (pupils,
 * cheeks, highlight) and keeps two plain eyes, so it stays crisp in a browser tab.
 */

const L_PATH = "M18 14 L52 14 L52 54 L84 54 L84 84 L18 84 Z";
const INK = "#1E2333";

export interface LMarkProps {
  className?: string;
  /** Accessible name. Pass an empty string when text beside the mark already names it. */
  label?: string;
  size?: number;
}

export function LMark({
  size = 28,
  className,
  label = "Lopsi Bot",
}: LMarkProps) {
  const simple = size < 24;
  return (
    <svg
      className={className}
      height={size}
      style={{ flexShrink: 0 }}
      viewBox="0 0 100 100"
      width={size}
      {...(label
        ? { "aria-label": label, role: "img" }
        : { "aria-hidden": true })}
    >
      {!simple && (
        <ellipse cx="51" cy="95" fill="#000" opacity="0.09" rx="34" ry="3.5" />
      )}
      <path
        d={L_PATH}
        fill="#5A40D9"
        stroke="#5A40D9"
        strokeLinejoin="round"
        strokeWidth="12"
      />
      <path
        d={L_PATH}
        fill="#7B61FF"
        stroke="#7B61FF"
        strokeLinejoin="round"
        strokeWidth="12"
        transform="translate(0 -3.5)"
      />
      {simple ? (
        <>
          <circle cx="27" cy="32" fill="#fff" r="6" />
          <circle cx="43" cy="32" fill="#fff" r="6" />
        </>
      ) : (
        <>
          <ellipse
            cx="22"
            cy="18"
            fill="#fff"
            opacity="0.42"
            rx="7"
            ry="3.4"
            transform="rotate(-35 22 18)"
          />
          <ellipse
            cx="21.5"
            cy="42"
            fill="#FF4D8D"
            opacity="0.28"
            rx="4.2"
            ry="2.5"
          />
          <ellipse
            cx="48.5"
            cy="42"
            fill="#FF4D8D"
            opacity="0.28"
            rx="4.2"
            ry="2.5"
          />
          <ellipse cx="28" cy="31" fill="#fff" rx="5.6" ry="6.6" />
          <ellipse cx="42" cy="31" fill="#fff" rx="5.6" ry="6.6" />
          <circle cx="29" cy="32" fill={INK} r="3.4" />
          <circle cx="43" cy="32" fill={INK} r="3.4" />
          <circle cx="27.8" cy="30.6" fill="#fff" r="1.2" />
          <circle cx="41.8" cy="30.6" fill="#fff" r="1.2" />
          <path
            d="M31 44 Q35 48.5 39 44"
            fill="none"
            stroke={INK}
            strokeLinecap="round"
            strokeWidth="2.6"
          />
        </>
      )}
    </svg>
  );
}
