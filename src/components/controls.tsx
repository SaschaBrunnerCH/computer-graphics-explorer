import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-slider";
import "@esri/calcite-components/components/calcite-switch";
import "@esri/calcite-components/components/calcite-segmented-control";
import "@esri/calcite-components/components/calcite-segmented-control-item";

/** Thin wrappers around Calcite inputs so all playground controls look and behave alike. */

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onInput,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onInput: (value: number) => void;
  format?: (value: number) => string;
}): React.JSX.Element {
  return (
    <calcite-label>
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-[var(--calcite-color-text-3)]">{format(value)}</span>
      </span>
      <calcite-slider
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        label-handles={undefined}
        oncalciteSliderInput={(e) => {
          const v = (e.target as HTMLCalciteSliderElement).value;
          onInput(typeof v === "number" ? v : (v?.[0] ?? min));
        }}
      />
    </calcite-label>
  );
}

export function SwitchControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <calcite-label layout="inline-space-between">
      {label}
      <calcite-switch
        checked={checked || undefined}
        oncalciteSwitchChange={(e) => onChange((e.target as HTMLCalciteSwitchElement).checked)}
      />
    </calcite-label>
  );
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <calcite-label>
      {label}
      <calcite-segmented-control
        width="full"
        oncalciteSegmentedControlChange={(e) =>
          onChange((e.target as HTMLCalciteSegmentedControlElement).value as T)
        }
      >
        {options.map((option) => (
          <calcite-segmented-control-item
            key={option.value}
            value={option.value}
            checked={option.value === value || undefined}
          >
            {option.label}
          </calcite-segmented-control-item>
        ))}
      </calcite-segmented-control>
    </calcite-label>
  );
}
