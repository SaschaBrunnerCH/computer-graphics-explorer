import { difficultyMeta, type Difficulty } from "../data";

export function DifficultyBadge({
  difficulty,
  showLabel = false,
}: {
  difficulty: Difficulty;
  showLabel?: boolean;
}): React.JSX.Element {
  const meta = difficultyMeta[difficulty];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      title={meta.label}
      aria-label={`Difficulty: ${meta.label}`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {showLabel && <span className="text-sm">{meta.label}</span>}
    </span>
  );
}
