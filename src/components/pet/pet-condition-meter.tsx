import {
  CONDITION_LEVELS,
  type PetCondition,
  type PetStat,
} from "@/lib/pet-condition";

/**
 * Per-stat fill colour. Kept here rather than in `lib/pet-condition` so the
 * vocabulary module stays free of styling, and so these stay literal class
 * names Tailwind can find.
 */
const FILL_CLASSES: Record<PetStat, string> = {
  hunger: "bg-stat-hunger",
  happiness: "bg-stat-happiness",
  energy: "bg-stat-energy",
  health: "bg-stat-health",
  coat: "bg-stat-coat",
};

/**
 * A companion's condition as a named state plus a five-segment meter.
 *
 * Segments rather than a continuous bar: a bar that fills to an exact
 * fraction is a number by another name, and the player would be reading a
 * percentage off the pixels. Five segments say exactly what the five words
 * say, and no more.
 *
 * The state name always accompanies the meter, so meaning never rests on
 * colour alone. `role="meter"` keeps the semantics for assistive
 * technology while `aria-valuetext` makes it announce "Well fed" rather
 * than a bare index.
 *
 * The visible text either side of the meter is hidden from assistive
 * technology, because the meter already carries all of it. Announced, the
 * four facts became twelve utterances: "Appetite, Well fed, Appetite meter
 * Well fed Comfortably fed, Comfortably fed." The meter is kept rather
 * than the text because `value` of `max` also conveys a sense of trend
 * that the words alone do not.
 */
export function PetConditionMeter({ condition }: { condition: PetCondition }) {
  const { noun, label, hint, level, stat } = condition;
  return (
    <div>
      <div
        aria-hidden="true"
        className="flex items-baseline justify-between gap-2 text-sm"
      >
        <span className="font-medium text-text">{noun}</span>
        <span className="text-text-muted">{label}</span>
      </div>
      <div
        role="meter"
        aria-label={noun}
        aria-valuemin={0}
        aria-valuemax={CONDITION_LEVELS - 1}
        aria-valuenow={level}
        aria-valuetext={`${label}. ${hint}`}
        className="mt-1 flex gap-1"
      >
        {Array.from({ length: CONDITION_LEVELS }, (_, index) => (
          <span
            key={index}
            className={`h-3 flex-1 rounded-full ${
              index <= level ? FILL_CLASSES[stat] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p aria-hidden="true" className="mt-1 text-xs text-text-muted">
        {hint}
      </p>
    </div>
  );
}
