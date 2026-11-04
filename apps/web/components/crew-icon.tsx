import { Mascot, type MascotKind, type MascotMood } from "@/components/mascot";

// Each crew member's favicon sits on a tile of its own tint.
export const TINTS: Record<MascotKind, string> = {
  deckhand: "#FFE7E3",
  lookout: "#E3F1FF",
  navigator: "#FFF3DC",
  purser: "#DDF6EE",
  signal: "#FDE6F3",
  skipper: "#EEEAFF",
};

/** A crew member on its tinted tile: the tab's icon, drawn on a 32 px grid. */
export function CrewIcon({
  kind,
  mood = "idle",
  size = 32,
}: {
  kind: MascotKind;
  mood?: MascotMood;
  size?: number;
}) {
  return (
    <svg height={size} viewBox="0 0 32 32" width={size}>
      <rect fill={TINTS[kind]} height="32" rx="7" width="32" />
      <Mascot kind={kind} label="" mood={mood} size={32} />
    </svg>
  );
}
