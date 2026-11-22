"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Mascot, type MascotKind } from "@/components/mascot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReasoningLevel } from "@/lib/agent-model";
import {
  APPROVAL_CHOICES,
  APPROVAL_LABELS,
  type ApprovalMode,
} from "@/lib/approval-labels";
import { MODEL_NOTES } from "@/lib/crew-presets";
import type { WebFetchMode } from "@/lib/member-access";
import {
  type ConnectorChoice,
  type Connectors,
  REASONING,
  type Tools,
  WEB_FETCH,
} from "@/lib/member-edit";
import { cn } from "@/lib/utils";
import { type ModelOption, ModelPicker } from "./model-picker";

/**
 * The crew member fields the New crew member wizard and the Edit dialog share:
 * model cards, reasoning, approval mode, connectors and built-in tools.
 */

/** Offered under the suggested model; each only when AI Gateway lists it. */
const POPULAR_MODELS = [
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6.1-terra",
  "google/gemini-3.8-flash",
];

/** Shorter than APPROVAL_LABELS' hints: the cards sit side by side. */
const MODE_HINTS: Record<ApprovalMode, string> = {
  always: "Reads just happen. Each comment, post or edit waits for an OK.",
  auto: "A reviewer model checks each change and asks when one looks risky or it can't decide.",
  never: "Changes run without asking.",
  once: "The first change in a chat waits for an OK; later ones in that chat run.",
};

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "green" | "neutral";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 text-[11px] leading-4",
        tone === "green"
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-muted text-foreground/80"
      )}
    >
      {children}
    </span>
  );
}

/** A card or segment that's one choice of a radio group: a real radio input, visually hidden. */
export function RadioCard({
  checked,
  children,
  className,
  name,
  onSelect,
}: {
  readonly checked: boolean;
  readonly children: ReactNode;
  readonly className: string;
  readonly name: string;
  readonly onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "has-focus-visible:ring-ring/50 relative cursor-pointer has-focus-visible:ring-3",
        className
      )}
    >
      <input
        checked={checked}
        className="sr-only"
        name={name}
        onChange={onSelect}
        type="radio"
      />
      {children}
    </label>
  );
}

/** The model cards: the suggestion and popular picks AI Gateway lists, then the one in use and the one chosen. */
function useModelCards(
  models: readonly ModelOption[],
  suggested: string | undefined,
  keep: readonly string[]
): { readonly cards: readonly string[]; readonly suggested?: string } {
  return useMemo(() => {
    const listed = (id: string) =>
      models.length === 0 || models.some((model) => model.id === id);
    const cards = [
      ...new Set([suggested ?? "", ...POPULAR_MODELS].filter(Boolean)),
    ]
      .filter(listed)
      .slice(0, 3);
    for (const id of keep) {
      if (id && !cards.includes(id)) {
        cards.push(id);
      }
    }
    return {
      cards,
      ...(suggested && listed(suggested) ? { suggested } : {}),
    };
  }, [models, suggested, keep]);
}

/** Model cards with notes, and a search over every AI Gateway model. */
export function ModelChoice({
  inUse,
  legend,
  models,
  onChange,
  suggested,
  value,
}: {
  /** The model before this edit, marked once another is chosen. */
  readonly inUse?: string;
  readonly legend: string;
  readonly models: readonly ModelOption[];
  readonly onChange: (model: string) => void;
  readonly suggested?: string;
  readonly value: string;
}) {
  const keep = useMemo(() => [inUse ?? "", value], [inUse, value]);
  const { cards, suggested: shown } = useModelCards(models, suggested, keep);
  const [searching, setSearching] = useState(false);
  const names = new Map(models.map((model) => [model.id, model.name]));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-muted-foreground mb-2 text-xs font-medium">
        {legend}
      </legend>
      {cards.map((id) => {
        const selected = value === id;
        return (
          <RadioCard
            checked={selected}
            className={cn(
              "hover:bg-muted/50 flex min-h-[60px] flex-wrap items-center gap-3.5 rounded-xl border px-3.5 py-2.5 transition-colors",
              selected && "border-foreground ring-foreground ring-1"
            )}
            key={id}
            name="model"
            onSelect={() => onChange(id)}
          >
            <span
              className={cn(
                "size-[18px] shrink-0 rounded-full border-[1.5px]",
                selected && "border-foreground border-[5px]"
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {names.get(id) ?? id}
                </span>
                {id === shown ? <Pill tone="green">Suggested</Pill> : null}
                {id === inUse && value !== inUse ? (
                  <Pill>In use now</Pill>
                ) : null}
              </span>
              {MODEL_NOTES[id] ? (
                <span className="text-muted-foreground text-[13px]">
                  {MODEL_NOTES[id]}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {id}
            </span>
          </RadioCard>
        );
      })}
      {searching ? (
        <ModelPicker
          models={models}
          onChange={onChange}
          required={false}
          value={cards.includes(value) ? "" : value}
        />
      ) : (
        <button
          className="text-muted-foreground hover:bg-muted/50 min-h-11 rounded-xl border border-dashed px-3.5 text-left text-[13px] transition-colors"
          onClick={() => setSearching(true)}
          type="button"
        >
          Search all models…
        </button>
      )}
    </fieldset>
  );
}

/** Default, Low, Medium or High; a level only agent.ts can set is kept as an extra choice. */
export function ReasoningChoice({
  onChange,
  value,
}: {
  readonly onChange: (value: ReasoningLevel | "") => void;
  readonly value: ReasoningLevel | "";
}) {
  const options = REASONING.some((option) => option.value === value)
    ? REASONING
    : [...REASONING, { label: value, value }];
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium">Reasoning</legend>
      <span className="bg-muted inline-flex flex-wrap gap-0.5 rounded-[10px] p-[3px]">
        {options.map((option) => (
          <RadioCard
            checked={value === option.value}
            className={cn(
              "text-muted-foreground inline-flex h-[34px] items-center rounded-lg px-3.5 text-[13px]",
              value === option.value &&
                "bg-background text-foreground shadow-xs"
            )}
            key={option.label}
            name="reasoning"
            onSelect={() => onChange(option.value)}
          >
            {option.label}
          </RadioCard>
        ))}
      </span>
    </fieldset>
  );
}

/** When the member asks before changing things in connected services (crew.json `approvals`). */
export function ApprovalChoice({
  inUse,
  mascot,
  name,
  onChange,
  value,
}: {
  /** The mode before this edit, marked once another is chosen. */
  readonly inUse?: ApprovalMode;
  readonly mascot: MascotKind;
  readonly name: string;
  readonly onChange: (value: ApprovalMode) => void;
  readonly value: ApprovalMode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">
          Changes in connected services
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {APPROVAL_CHOICES.map((mode) => {
            const selected = value === mode;
            return (
              <RadioCard
                checked={selected}
                className={cn(
                  "hover:bg-muted/50 flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 transition-colors",
                  selected &&
                    (mode === "never"
                      ? "border-orange-600 ring-1 ring-orange-600"
                      : "border-foreground ring-foreground ring-1")
                )}
                key={mode}
                name="approvals"
                onSelect={() => onChange(mode)}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {APPROVAL_LABELS[mode].label}
                  </span>
                  {mode === "always" ? <Pill tone="green">Default</Pill> : null}
                  {mode === inUse && value !== inUse ? (
                    <Pill>In use now</Pill>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-[13px]">
                  {MODE_HINTS[mode]}
                </span>
              </RadioCard>
            );
          })}
        </div>
      </fieldset>
      {value === "never" ? (
        <div
          className="flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950"
          role="note"
        >
          <Mascot kind={mascot} mood="needs" size={36} />
          <span className="text-[13px] text-orange-800 dark:text-orange-200">
            Anyone who can chat with {name} can have it change things through
            its services, and a page {name} reads could try to steer it.
          </span>
        </div>
      ) : null}
      {value === "auto" ? (
        <p className="text-muted-foreground text-xs">
          The reviewer sees the request, never the credential, through AI
          Gateway with no data kept.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Either way, the first visit to a new website asks once, so your
        credentials only go where you've allowed.
      </p>
    </div>
  );
}

/** The connectors left checked: every one is `all`, which includes connectors attached later. */
function toggleConnector(
  value: Connectors,
  choices: readonly ConnectorChoice[],
  id: string,
  on: boolean
): Connectors {
  const current = value === "all" ? choices.map((choice) => choice.id) : value;
  const next = on
    ? [...new Set([...current, id])]
    : current.filter((other) => other !== id);
  return choices.every((choice) => next.includes(choice.id))
    ? "all"
    : next.sort();
}

/** Which connectors the member may use (crew.json `connectors`). */
export function ServicesChoice({
  choices,
  name,
  onChange,
  tip,
  value,
}: {
  readonly choices: readonly ConnectorChoice[];
  readonly name: string;
  readonly onChange: (value: Connectors) => void;
  readonly tip?: string;
  readonly value: Connectors;
}) {
  const checked = (id: string) => value === "all" || value.includes(id);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">Services</h3>
      {choices.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-3.5 py-3 text-[13px]">
          No connectors are attached to this project yet. Once one is, every
          member can use it unless its Edit form limits it.
        </p>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-xl border">
          {choices.map((choice) => (
            <label
              className="flex min-h-11 items-center gap-3 border-b px-3.5 last:border-b-0"
              key={choice.id}
            >
              <input
                checked={checked(choice.id)}
                className="accent-primary size-4"
                onChange={(e) =>
                  onChange(
                    toggleConnector(value, choices, choice.id, e.target.checked)
                  )
                }
                type="checkbox"
              />
              <span className="flex-1">{choice.name}</span>
            </label>
          ))}
        </div>
      )}
      {choices.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {value === "all"
            ? `Every connector, including ones attached later. Uncheck one to limit ${name} to the rest.`
            : `Only the checked connectors. Ones attached later stay off for ${name} until you check them.`}
        </p>
      ) : null}
      {tip ? <p className="text-muted-foreground text-xs">{tip}</p> : null}
    </section>
  );
}

function ToolBox({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2.5 rounded-xl border px-3">
      <input
        checked={checked}
        className="accent-primary size-4"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function ByHand({ file }: { readonly file: string }) {
  return (
    <p className="text-muted-foreground flex min-h-11 items-center rounded-xl border px-3 text-xs">
      {file} was edited by hand; change it there.
    </p>
  );
}

/** Shell, web search and web pages; a tool whose file was edited by hand (absent) is shown, not changed. */
export function ToolsChoice({
  note,
  onChange,
  value,
}: {
  readonly note: string;
  readonly onChange: (value: Tools) => void;
  readonly value: Tools;
}) {
  const fetchModes: readonly WebFetchMode[] =
    value.webFetch === "never"
      ? ["always", "once", "off", "never"]
      : ["always", "once", "off"];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">Built-in tools</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {value.bash === undefined ? (
          <ByHand file="tools/bash.ts" />
        ) : (
          <ToolBox
            checked={value.bash === "on"}
            label="Shell"
            onChange={(on) => onChange({ ...value, bash: on ? "on" : "off" })}
          />
        )}
        {value.webSearch === undefined ? (
          <ByHand file="tools/web_search.ts" />
        ) : (
          <ToolBox
            checked={value.webSearch === "on"}
            label="Web search"
            onChange={(on) =>
              onChange({ ...value, webSearch: on ? "on" : "off" })
            }
          />
        )}
        {value.webFetch === undefined ? (
          <ByHand file="tools/web_fetch.ts" />
        ) : (
          <div className="flex min-h-11 items-center gap-2 rounded-xl border px-3">
            <span>Pages</span>
            <Select
              items={fetchModes.map((mode) => ({
                label: WEB_FETCH[mode],
                value: mode,
              }))}
              onValueChange={(next: WebFetchMode | null) =>
                next && onChange({ ...value, webFetch: next })
              }
              value={value.webFetch}
            >
              <SelectTrigger
                aria-label="Web pages"
                className="min-w-0 flex-1"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fetchModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {WEB_FETCH[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{note}</p>
    </section>
  );
}
