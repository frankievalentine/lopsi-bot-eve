import { useEffect, useState } from "react";

/**
 * The Lopsi Bot crew. Each kind is a shape you can tell apart at 24 px plus
 * one prop that hints at its job. Eyes wander and blink; the mood shows what
 * the agent is doing. Original artwork; no external assets.
 */

export type MascotKind =
  | "skipper"
  | "lookout"
  | "purser"
  | "navigator"
  | "deckhand"
  | "signal";
export type MascotMood = "idle" | "thinking" | "done" | "needs";

interface KindSpec {
  acc: "cap" | "antenna" | "glasses" | "star" | "band" | "arcs";
  body: string;
  color: string;
  eyes: [number, number][];
  hl: [number, number];
  label: string;
  rx: number;
  shade: string;
  stroke?: number;
}

export const KINDS: Record<MascotKind, KindSpec> = {
  deckhand: {
    acc: "band",
    body: "M38 30 L62 30 C79 30 92 43 92 60 C92 77 79 89 62 89 L38 89 C21 89 8 77 8 60 C8 43 21 30 38 30 Z",
    color: "#FF6A55",
    eyes: [
      [38, 61],
      [62, 61],
    ],
    hl: [23, 41],
    label: "Tinker",
    rx: 7,
    shade: "#DD4934",
  },
  lookout: {
    acc: "antenna",
    body: "M24 90 C19 90 17 88 17 83 L17 52 C17 32 31 20 50 20 C69 20 83 32 83 52 L83 83 C83 88 81 90 76 90 Z",
    color: "#2F9BFF",
    eyes: [[50, 52]],
    hl: [31, 38],
    label: "Beacon",
    rx: 11,
    shade: "#1A76D2",
  },
  navigator: {
    acc: "star",
    body: "M50 19 C57 19 90 71 87 81 C85 89 78 90 50 90 C22 90 15 89 13 81 C10 71 43 19 50 19 Z",
    color: "#FFAE1F",
    eyes: [
      [42, 65],
      [58, 65],
    ],
    hl: [43, 40],
    label: "Scout",
    rx: 6,
    shade: "#DB8A00",
  },
  purser: {
    acc: "glasses",
    body: "M50 20 C76 20 91 35 91 57 C91 79 75 90 50 90 C25 90 9 79 9 57 C9 35 24 20 50 20 Z",
    color: "#1FC28F",
    eyes: [
      [38, 56],
      [62, 56],
    ],
    hl: [26, 38],
    label: "Ledger",
    rx: 6.2,
    shade: "#109C71",
  },
  signal: {
    acc: "arcs",
    body: "M50 24 L80 40 L80 72 L50 88 L20 72 L20 40 Z",
    color: "#F25AAE",
    eyes: [
      [40, 57],
      [60, 57],
    ],
    hl: [31, 42],
    label: "Relay",
    rx: 7,
    shade: "#CF3B8D",
    stroke: 9,
  },
  skipper: {
    acc: "cap",
    body: "M50 18 C80 18 88 26 88 55 C88 82 80 90 50 90 C20 90 12 82 12 55 C12 26 20 18 50 18 Z",
    color: "#7B61FF",
    eyes: [
      [40, 55],
      [60, 55],
    ],
    hl: [29, 35],
    label: "Chief",
    rx: 7,
    shade: "#5A40D9",
  },
};

const INK = "#1E2333";
const LOOKS: [number, number][] = [
  [0, 0],
  [-2, 0],
  [2, 0],
  [1.5, -1.2],
  [-1.5, 1],
  [0, 1.6],
  [-1.8, -1.4],
];

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) {
      return;
    }
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

function useEyes(seed: number, animate: boolean) {
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState<[number, number]>([0, 0]);
  const [up, setUp] = useState(false);

  useEffect(() => {
    if (!animate) {
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const blinkLoop = () => {
      timers.push(
        setTimeout(
          () => {
            setBlink(true);
            timers.push(
              setTimeout(() => {
                setBlink(false);
                blinkLoop();
              }, 130)
            );
          },
          2400 + Math.random() * 3200 + seed * 170
        )
      );
    };
    const lookLoop = () => {
      timers.push(
        setTimeout(
          () => {
            setLook(LOOKS[Math.floor(Math.random() * LOOKS.length)]!);
            lookLoop();
          },
          1700 + Math.random() * 1900
        )
      );
    };
    blinkLoop();
    lookLoop();
    const bob = setInterval(() => setUp((u) => !u), 650);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(bob);
    };
  }, [seed, animate]);

  return { blink, look, up };
}

export interface MascotProps {
  className?: string;
  kind: MascotKind;
  /** Accessible name. Defaults to the kind's label plus the mood. */
  label?: string;
  mood?: MascotMood;
  size?: number;
}

export function Mascot({
  kind,
  mood = "idle",
  size = 40,
  className,
  label,
}: MascotProps) {
  const k = KINDS[kind] ?? KINDS.skipper;
  const reduce = useReducedMotion();
  const { blink, look, up } = useEyes(
    Object.keys(KINDS).indexOf(kind),
    !reduce
  );

  const happy = mood === "done";
  const thinking = mood === "thinking";
  const eyeLook: [number, number] = thinking
    ? up
      ? [1.8, -2.4]
      : [1.2, -2.2]
    : look;
  const closed = blink && !happy;

  const [e1, e2] = k.eyes;
  const mx = e2 ? (e1![0] + e2[0]) / 2 : e1![0];
  const my = e1![1] + k.rx * 1.18 + 6;
  const mouth = happy
    ? `M${mx - 6} ${my} Q${mx} ${my + 6} ${mx + 6} ${my}`
    : mood === "needs"
      ? `M${mx - 3.5} ${my + 1.5} L${mx + 3.5} ${my + 1.5}`
      : `M${mx - 3.5} ${my} Q${mx} ${my + 3.5} ${mx + 3.5} ${my}`;
  const cheekY = e1![1] + k.rx + 3;
  const single = !e2;

  const name =
    label ??
    `${k.label}${mood === "needs" ? ", needs you" : thinking ? ", working" : ""}`;

  return (
    <svg
      aria-label={name}
      className={className}
      height={size}
      role="img"
      style={{ flexShrink: 0 }}
      viewBox="0 0 100 100"
      width={size}
    >
      <ellipse cx="50" cy="95" fill="#000" opacity="0.09" rx="30" ry="3.5" />
      <g
        style={{
          transform: `translateY(${thinking && up && !reduce ? -3 : 0}px)`,
          transition: "transform 600ms ease-in-out",
        }}
      >
        {k.acc === "star" && (
          <path
            d="M50 4 L52.2 9 L57 11 L52.2 13 L50 18 L47.8 13 L43 11 L47.8 9 Z"
            fill="#FFC53D"
          />
        )}
        {k.acc === "antenna" && (
          <>
            <line
              stroke={k.shade}
              strokeLinecap="round"
              strokeWidth="3.5"
              x1="50"
              x2="50"
              y1="20"
              y2="8"
            />
            <circle cx="50" cy="7" fill="#FFC53D" r="5" />
          </>
        )}
        {k.acc === "arcs" && (
          <>
            <path
              d="M71 13 Q79 16 81 24"
              fill="none"
              stroke={k.shade}
              strokeLinecap="round"
              strokeWidth="3.5"
            />
            <path
              d="M75 5 Q88 10 90 24"
              fill="none"
              stroke={k.shade}
              strokeLinecap="round"
              strokeWidth="3.5"
            />
          </>
        )}
        <path
          d={k.body}
          fill={k.shade}
          stroke={k.shade}
          strokeLinejoin="round"
          strokeWidth={k.stroke ?? 0}
        />
        <path
          d={k.body}
          fill={k.color}
          stroke={k.color}
          strokeLinejoin="round"
          strokeWidth={k.stroke ?? 0}
          transform="translate(0 -3.5)"
        />
        <ellipse
          cx={k.hl[0]}
          cy={k.hl[1]}
          fill="#fff"
          opacity="0.42"
          rx="8.5"
          ry="4.2"
          transform={`rotate(-35 ${k.hl[0]} ${k.hl[1]})`}
        />
        {k.acc === "cap" && (
          <>
            <path d="M26 19 C26 5 74 5 74 19 Z" fill={INK} />
            <rect fill="#fff" height="7.5" rx="3.75" width="54" x="23" y="16" />
            <circle cx="50" cy="11.5" fill="#FFC53D" r="2.6" />
          </>
        )}
        {k.acc === "band" && (
          <>
            <path
              d="M9 47 C30 39 70 39 91 47"
              fill="none"
              stroke={INK}
              strokeLinecap="round"
              strokeWidth="5"
            />
            <path
              d="M89 45 L97 39 M89 47 L98 50"
              fill="none"
              stroke={INK}
              strokeLinecap="round"
              strokeWidth="4"
            />
          </>
        )}
        <ellipse
          cx={e1![0] - 3 - (single ? k.rx + 6 : 0)}
          cy={cheekY}
          fill="#FF4D8D"
          opacity="0.28"
          rx="4.5"
          ry="2.6"
        />
        {e2 && (
          <ellipse
            cx={e2[0] + 3}
            cy={cheekY}
            fill="#FF4D8D"
            opacity="0.28"
            rx="4.5"
            ry="2.6"
          />
        )}
        {k.eyes.map(([x, y], i) => {
          const s = k.rx / 7;
          const pr = k.rx * 0.6;
          const px = x + eyeLook[0] * s;
          const py = y + eyeLook[1] * s;
          return (
            <g key={i}>
              {happy ? (
                <path
                  d={`M${x - k.rx * 0.85} ${y + 1.5} Q${x} ${y - k.rx * 1.1} ${x + k.rx * 0.85} ${y + 1.5}`}
                  fill="none"
                  stroke={INK}
                  strokeLinecap="round"
                  strokeWidth="3.2"
                />
              ) : (
                <>
                  <ellipse
                    cx={x}
                    cy={y}
                    fill="#fff"
                    rx={k.rx}
                    ry={closed ? 1.2 : k.rx * 1.18}
                  />
                  {!closed && (
                    <>
                      <circle cx={px} cy={py} fill={INK} r={pr} />
                      <circle
                        cx={px - pr * 0.38}
                        cy={py - pr * 0.42}
                        fill="#fff"
                        r={Math.max(1, k.rx * 0.2)}
                      />
                    </>
                  )}
                </>
              )}
              {k.acc === "glasses" && (
                <circle
                  cx={x}
                  cy={y}
                  fill="none"
                  r={k.rx + 4.5}
                  stroke={INK}
                  strokeWidth="2.4"
                />
              )}
            </g>
          );
        })}
        {thinking ? (
          <ellipse cx={mx} cy={my + 1.5} fill={INK} rx="2.4" ry="2.8" />
        ) : (
          <path
            d={mouth}
            fill="none"
            stroke={INK}
            strokeLinecap="round"
            strokeWidth="2.6"
          />
        )}
      </g>
      {mood === "needs" && (
        <>
          <circle
            cx="83"
            cy="20"
            fill="#F76B15"
            r="10"
            stroke="#fff"
            strokeWidth="3"
          />
          <path
            d="M83 14.5 L83 21"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="2.8"
          />
          <circle cx="83" cy="25.2" fill="#fff" r="1.6" />
        </>
      )}
    </svg>
  );
}
