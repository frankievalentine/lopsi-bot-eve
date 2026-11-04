"use client";

import { type KeyboardEvent, useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_FALLBACKS, type ReasoningLevel } from "@/lib/agent-model";

export interface ModelOption {
  readonly id: string;
  readonly name: string;
}

const REASONING: readonly ReasoningLevel[] = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];
const NOT_SET = "Not set";

/**
 * Base UI clears a combobox when Escape is pressed with its popup closed. In a
 * form that silently drops a setting, so Escape there is left to the dialog.
 */
function keepOnEscape(
  event: KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler: () => void }
) {
  if (
    event.key === "Escape" &&
    event.currentTarget.getAttribute("aria-expanded") !== "true"
  ) {
    event.preventBaseUIHandler();
  }
}

/** Model ids to offer: AI Gateway's list plus any current value it doesn't have, so a setting never disappears. */
function useModelIds(
  models: readonly ModelOption[],
  current: readonly string[]
): { ids: string[]; names: Map<string, string> } {
  return useMemo(() => {
    const names = new Map(models.map((model) => [model.id, model.name]));
    const missing = current.filter((id) => id && !names.has(id));
    return { ids: [...missing, ...names.keys()], names };
  }, [models, current]);
}

function ModelItem({ id, name }: { id: string; name: string | undefined }) {
  return (
    <ComboboxItem value={id}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{id}</span>
        {name && name !== id ? (
          <span className="text-muted-foreground truncate text-xs">{name}</span>
        ) : null}
      </span>
    </ComboboxItem>
  );
}

/** The crew member's model, searched from AI Gateway's list; a plain input when the list didn't load. */
export function ModelPicker({
  models,
  onChange,
  required,
  value,
}: {
  readonly models: readonly ModelOption[];
  readonly onChange: (value: string) => void;
  readonly required: boolean;
  readonly value: string;
}) {
  const current = useMemo(() => [value], [value]);
  const { ids, names } = useModelIds(models, current);
  if (models.length === 0) {
    return (
      <Input
        onChange={(e) => onChange(e.target.value)}
        placeholder="provider/model, from AI Gateway"
        required={required}
        value={value}
      />
    );
  }
  return (
    <Combobox
      autoHighlight
      items={ids}
      onValueChange={(next) => onChange(next ?? "")}
      value={value || null}
    >
      <ComboboxInput
        className="w-full"
        onKeyDown={keepOnEscape}
        placeholder="Search AI Gateway models"
        required={required}
      />
      <ComboboxContent>
        <ComboboxEmpty>No model matches.</ComboboxEmpty>
        <ComboboxList>
          {(id: string) => <ModelItem id={id} key={id} name={names.get(id)} />}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Fallback models as chips, in the order picked, up to {@link MAX_FALLBACKS}. */
export function FallbackPicker({
  model,
  models,
  onChange,
  value,
}: {
  readonly model: string;
  readonly models: readonly ModelOption[];
  readonly onChange: (value: readonly string[]) => void;
  readonly value: readonly string[];
}) {
  const anchor = useComboboxAnchor();
  const { ids, names } = useModelIds(models, value);
  const choices = useMemo(() => ids.filter((id) => id !== model), [ids, model]);
  const full = value.length >= MAX_FALLBACKS;
  const placeholder = value.length > 0 ? "Add another" : "None";
  return (
    <Combobox
      autoHighlight
      items={choices}
      multiple
      onValueChange={(next: string[]) => onChange(next.slice(0, MAX_FALLBACKS))}
      value={[...value]}
    >
      <ComboboxChips className="w-full" ref={anchor}>
        <ComboboxValue>
          {(picked: string[]) => (
            <>
              {picked.map((id) => (
                <ComboboxChip key={id} removeLabel={`Remove ${id}`}>
                  {id}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                disabled={full}
                onKeyDown={keepOnEscape}
                {...(full ? {} : { placeholder })}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No model matches.</ComboboxEmpty>
        <ComboboxList>
          {(id: string) => <ModelItem id={id} key={id} name={names.get(id)} />}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Reasoning effort; "Not set" leaves `reasoning` out of agent.ts. */
export function ReasoningSelect({
  onChange,
  value,
}: {
  readonly onChange: (value: ReasoningLevel | "") => void;
  readonly value: ReasoningLevel | "";
}) {
  return (
    <Select
      items={[
        { label: NOT_SET, value: null },
        ...REASONING.map((level) => ({ label: level, value: level })),
      ]}
      onValueChange={(next: ReasoningLevel | null) => onChange(next ?? "")}
      value={value || null}
    >
      <SelectTrigger className="w-full sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>{NOT_SET}</SelectItem>
        {REASONING.map((level) => (
          <SelectItem key={level} value={level}>
            {level}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
