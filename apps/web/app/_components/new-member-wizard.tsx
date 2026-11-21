"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Mascot, type MascotKind } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isModelId, type ReasoningLevel } from "@/lib/agent-model";
import {
  APPROVAL_CHOICES,
  APPROVAL_LABELS,
  type ApprovalMode,
} from "@/lib/approval-labels";
import { CREW } from "@/lib/crew";
import { CREW_ID } from "@/lib/crew-core.mjs";
import {
  BLANK_PRESET,
  CREW_PRESETS,
  type CrewPreset,
  INSTRUCTION_SECTIONS,
  MODEL_NOTES,
} from "@/lib/crew-presets";
import type { PullRequest } from "@/lib/github";
import type { ToolSwitch } from "@/lib/member-access";
import { cn } from "@/lib/utils";
import {
  connectorChoices,
  modelOptions,
  proposeNewMember,
} from "./config-actions";
import type { ConnectorChoice } from "./member-access-fields";
import { PullRequestOpened, useUnsavedWarning } from "./member-dialog-parts";
import { type ModelOption, ModelPicker } from "./model-picker";

/**
 * The New crew member wizard: a crew role fills in suggestions, then name,
 * model, instructions and access, then a review that opens the pull request.
 * Editing an existing member stays in member-config-dialog.tsx.
 */

const STEPS = [
  "Who",
  "Name",
  "Model",
  "Instructions",
  "Access",
  "Review",
] as const;
const LAST = STEPS.length - 1;
const MAX_PROMPTS = 4;

const LOOKS: readonly { readonly kind: MascotKind; readonly name: string }[] =
  CREW_PRESETS.map(({ mascot, name }) => ({ kind: mascot, name }));

/** Offered under the suggested model; each only when AI Gateway lists it. */
const POPULAR_MODELS = [
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6.1-terra",
  "google/gemini-3.8-flash",
];

const REASONING: readonly {
  readonly label: string;
  readonly value: ReasoningLevel | "";
}[] = [
  { label: "Default", value: "" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

/** Shorter than the Edit form's hints: the cards sit side by side. */
const MODE_HINTS: Record<ApprovalMode, string> = {
  always: "Reads just happen. Each comment, post or edit waits for an OK.",
  auto: "A reviewer model checks each change and asks when one looks risky or it can't decide.",
  never: "Changes run without asking.",
  once: "The first change in a chat waits for an OK; later ones in that chat run.",
};

type WebFetchChoice = "always" | "once" | "off";

const WEB_FETCH: Record<WebFetchChoice, string> = {
  always: "Ask every page",
  off: "Off",
  once: "Ask once per chat",
};

interface Prompt {
  readonly on: boolean;
  readonly text: string;
}

interface WizardForm {
  readonly approvals: ApprovalMode;
  readonly bash: ToolSwitch;
  /** Set once the folder is typed, so renaming no longer changes it. */
  readonly customFolder: boolean;
  readonly folder: string;
  readonly instructions: string;
  readonly mascot: MascotKind;
  readonly model: string;
  readonly name: string;
  /** The role picked on the first step; `null` until one is. */
  readonly preset: CrewPreset | null;
  readonly prompts: readonly Prompt[];
  readonly reasoning: ReasoningLevel | "";
  readonly role: string;
  /** Connectors unchecked on the Access step. */
  readonly servicesOff: readonly string[];
  readonly webFetch: WebFetchChoice;
  readonly webSearch: ToolSwitch;
}

const TAKEN = new Set(CREW.map((member) => member.id));

/** A free folder name from a display name: "Ledger" is `ledger`, or `ledger-2` when that's taken. */
function folderFor(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[^a-z]+|-+$/gu, "")
    .slice(0, 36);
  const base = slug || "member";
  let folder = base;
  for (let n = 2; TAKEN.has(folder); n += 1) {
    folder = `${base}-${n}`;
  }
  return folder;
}

/** The form a role fills in; the template member's tools; asks every time. */
function formFor(
  preset: CrewPreset,
  models: readonly ModelOption[]
): WizardForm {
  const listed =
    models.length === 0 || models.some((model) => model.id === preset.model);
  return {
    approvals: "always",
    bash: "on",
    customFolder: false,
    folder: preset.name ? folderFor(preset.name) : "",
    instructions: preset.instructions,
    mascot: preset.mascot,
    model: listed ? preset.model : "",
    name: preset.name,
    preset,
    prompts: preset.suggestions.map((text, index) => ({
      on: index < 3,
      text,
    })),
    reasoning: preset.reasoning,
    role: preset.role,
    servicesOff: [],
    webFetch: "always",
    webSearch: "on",
  };
}

const EMPTY: WizardForm = { ...formFor(BLANK_PRESET, []), preset: null };

/** Whether a step's fields are filled in well enough to move past it. */
function stepDone(step: number, form: WizardForm): boolean {
  switch (step) {
    case 0:
      return form.preset !== null;
    case 1:
      return (
        form.name.trim() !== "" &&
        CREW_ID.test(form.folder) &&
        !TAKEN.has(form.folder)
      );
    case 2:
      return isModelId(form.model.trim());
    case 3:
      return form.instructions.trim() !== "";
    default:
      return true;
  }
}

function reachable(step: number, form: WizardForm): boolean {
  for (let before = 0; before < step; before += 1) {
    if (!stepDone(before, form)) {
      return false;
    }
  }
  return true;
}

/** The connectors left checked, or undefined for all of them (no `connectors` in crew.json). */
function servicesOf(
  form: WizardForm,
  choices: readonly ConnectorChoice[]
): string[] | undefined {
  const off = new Set(form.servicesOff);
  return off.size === 0
    ? undefined
    : choices.map((choice) => choice.id).filter((id) => !off.has(id));
}

function requestOf(form: WizardForm, choices: readonly ConnectorChoice[]) {
  const suggestions = form.prompts
    .filter((prompt) => prompt.on)
    .map((prompt) => prompt.text);
  const connectors = servicesOf(form, choices);
  return {
    config: {
      access: {
        bash: form.bash,
        webFetch: form.webFetch,
        webSearch: form.webSearch,
      },
      crew: {
        // "always" is the default, left out of crew.json.
        ...(form.approvals === "always" ? {} : { approvals: form.approvals }),
        ...(connectors === undefined ? {} : { connectors }),
        mascot: form.mascot,
        name: form.name.trim(),
        ...(form.role.trim() ? { role: form.role.trim() } : {}),
        ...(suggestions.length > 0 ? { suggestions } : {}),
      },
      instructions: form.instructions,
      model: {
        model: form.model.trim(),
        ...(form.reasoning ? { reasoning: form.reasoning } : {}),
      },
    },
    id: form.folder,
  };
}

/** The model list and connectors, loaded each time the wizard opens. */
function useWizardLists(open: boolean) {
  const [models, setModels] = useState<readonly ModelOption[]>([]);
  const [choices, setChoices] = useState<readonly ConnectorChoice[]>([]);
  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    modelOptions()
      .then((list) => current && setModels(list))
      .catch(() => undefined);
    connectorChoices()
      .then((list) => current && setChoices(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [open]);
  return { choices, models };
}

type Update = (change: Partial<WizardForm>) => void;

interface StepProps {
  readonly form: WizardForm;
  readonly update: Update;
}

/**
 * A six-step dialog for a new crew member, full screen on phones. Opening the
 * pull request is the last step; nothing changes until it's merged.
 */
export function NewMemberWizard({
  onOpenChange,
  onPullRequest,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  /** Called once the pull request is open. */
  readonly onPullRequest?: () => void;
  readonly open: boolean;
}) {
  const { choices, models } = useWizardLists(open);
  const [form, setForm] = useState<WizardForm>(EMPTY);
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pull, setPull] = useState<PullRequest | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setStep(0);
      setDiscarding(false);
      setError(null);
      setPull(null);
    }
  }, [open]);

  const update: Update = (change) => {
    setError(null);
    setForm((current) => ({ ...current, ...change }));
  };
  const unsaved = open && pull === null && form.preset !== null;
  useUnsavedWarning(unsaved);

  const close = () => {
    if (unsaved) {
      setDiscarding(true);
    } else {
      onOpenChange(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await proposeNewMember(requestOf(form, choices));
      if (result.ok) {
        setPull(result.pull);
        onPullRequest?.();
      } else {
        setError(result.error);
      }
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const go = (next: number) => {
    if (reachable(next, form)) {
      setDiscarding(false);
      setStep(next);
    }
  };

  const review = step === LAST && pull === null;

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent
        className={cn(
          "flex h-svh max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 ring-0 sm:h-[min(765px,90svh)] sm:max-w-[720px] sm:rounded-xl sm:ring-1",
          review && "sm:max-w-[920px]",
          pull && "h-auto sm:h-auto sm:max-w-md"
        )}
        showCloseButton={false}
      >
        {pull ? (
          <div className="p-4">
            <PullRequestOpened
              onClose={() => onOpenChange(false)}
              pull={pull}
            />
          </div>
        ) : (
          <>
            <WizardHeader form={form} go={go} onClose={close} step={step} />
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-5 p-5">
                <StepBody
                  choices={choices}
                  form={form}
                  go={go}
                  models={models}
                  step={step}
                  update={update}
                />
              </div>
              {review ? <Preview form={form} /> : null}
            </div>
            {error === null ? null : (
              <p
                className="text-destructive border-t px-5 py-2.5 text-sm whitespace-pre-wrap"
                role="alert"
              >
                {error}
              </p>
            )}
            <WizardFooter
              canContinue={stepDone(step, form)}
              discarding={discarding}
              onBack={() => (step === 0 ? close() : setStep(step - 1))}
              onDiscard={() => onOpenChange(false)}
              onKeep={() => setDiscarding(false)}
              onNext={() => (step === LAST ? submit() : go(step + 1))}
              saving={saving}
              step={step}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WizardHeader({
  form,
  go,
  onClose,
  step,
}: {
  readonly form: WizardForm;
  readonly go: (step: number) => void;
  readonly onClose: () => void;
  readonly step: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-b px-5 pt-4 pb-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <DialogTitle className="text-base font-semibold">
            New Crew Member
          </DialogTitle>
          <DialogDescription>
            Saving opens a pull request. Nothing changes until it's merged.
          </DialogDescription>
        </div>
        <Button
          aria-label="Close"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
      <ol aria-label="Steps" className="flex flex-wrap gap-1">
        {STEPS.map((label, index) => {
          const current = index === step;
          const done = index < step;
          return (
            <li key={label}>
              <button
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-[13px] transition-colors disabled:opacity-50",
                  current
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                  done ? "text-foreground" : !current && "text-muted-foreground"
                )}
                disabled={!reachable(index, form)}
                onClick={() => go(index)}
                type="button"
              >
                <span
                  className={cn(
                    "inline-flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold",
                    current && "bg-background text-foreground",
                    done && "bg-green-100 text-green-800",
                    !(current || done) && "bg-muted"
                  )}
                >
                  {done ? <CheckIcon className="size-3" /> : index + 1}
                </span>
                <span className={cn(!current && "max-sm:sr-only")}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WizardFooter({
  canContinue,
  discarding,
  onBack,
  onDiscard,
  onKeep,
  onNext,
  saving,
  step,
}: {
  readonly canContinue: boolean;
  readonly discarding: boolean;
  readonly onBack: () => void;
  readonly onDiscard: () => void;
  readonly onKeep: () => void;
  readonly onNext: () => void;
  readonly saving: boolean;
  readonly step: number;
}) {
  if (discarding) {
    return (
      <div className="bg-muted flex flex-wrap items-center gap-3 border-t px-5 py-3">
        <span className="text-sm" role="alert">
          Discard this crew member?
        </span>
        <span className="ml-auto flex gap-2">
          <Button onClick={onKeep} size="lg" variant="outline">
            Keep Editing
          </Button>
          <Button onClick={onDiscard} size="lg" variant="destructive">
            Discard
          </Button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border-t px-5 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <span className="text-muted-foreground text-[13px]">
        Step {step + 1} of {STEPS.length}
      </span>
      <span className="ml-auto flex gap-2">
        <Button onClick={onBack} size="lg" variant="outline">
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        <Button disabled={!canContinue || saving} onClick={onNext} size="lg">
          {nextLabel(step, saving)}
        </Button>
      </span>
    </div>
  );
}

function nextLabel(step: number, saving: boolean): string {
  if (step < LAST) {
    return "Continue";
  }
  return saving ? "Opening Pull Request…" : "Open Pull Request";
}

function Heading({
  children,
  hint,
}: {
  readonly children: ReactNode;
  readonly hint: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl leading-tight font-semibold">{children}</h2>
      <p className="text-muted-foreground text-sm">{hint}</p>
    </div>
  );
}

function StepBody({
  choices,
  form,
  go,
  models,
  step,
  update,
}: StepProps & {
  readonly choices: readonly ConnectorChoice[];
  readonly go: (step: number) => void;
  readonly models: readonly ModelOption[];
  readonly step: number;
}) {
  switch (step) {
    case 0:
      return <WhoStep form={form} models={models} update={update} />;
    case 1:
      return <NameStep form={form} update={update} />;
    case 2:
      return <ModelStep form={form} models={models} update={update} />;
    case 3:
      return <InstructionsStep form={form} update={update} />;
    case 4:
      return <AccessStep choices={choices} form={form} update={update} />;
    default:
      return (
        <ReviewStep choices={choices} form={form} go={go} models={models} />
      );
  }
}

function WhoStep({
  form,
  models,
  update,
}: StepProps & { readonly models: readonly ModelOption[] }) {
  const presets = [...CREW_PRESETS, BLANK_PRESET];
  return (
    <>
      <Heading hint="Start from a crew role. It fills in the rest with suggestions you can change.">
        Who's joining the crew?
      </Heading>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {presets.map((preset) => {
          const selected = form.preset === preset;
          const blank = preset === BLANK_PRESET;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "hover:bg-muted/50 flex min-h-32 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors",
                selected && "border-foreground ring-foreground ring-1"
              )}
              key={preset.id || "blank"}
              onClick={() => update(formFor(preset, models))}
              type="button"
            >
              {blank ? (
                <span className="text-muted-foreground inline-flex size-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-dashed">
                  <PlusIcon className="size-5" />
                </span>
              ) : (
                <Mascot
                  kind={preset.mascot}
                  mood={selected ? "done" : "idle"}
                  size={52}
                />
              )}
              <span className="text-sm font-semibold">
                {blank ? "Start blank" : preset.name}
              </span>
              <span className="text-muted-foreground text-xs">
                {blank ? "Your own role" : preset.role}
              </span>
            </button>
          );
        })}
      </div>
      {form.preset ? (
        <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
          {form.preset.does}
        </p>
      ) : null}
    </>
  );
}

function NameStep({ form, update }: StepProps) {
  const blank = form.preset === BLANK_PRESET;
  const [editingFolder, setEditingFolder] = useState(form.customFolder);
  const taken = TAKEN.has(form.folder);
  return (
    <>
      <Heading hint="How they show up in the crew list and in chats.">
        {blank ? "Name and look" : "Name"}
      </Heading>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input
            autoFocus
            className="h-10"
            maxLength={40}
            onChange={(e) =>
              update({
                name: e.target.value,
                ...(form.customFolder
                  ? {}
                  : {
                      folder: e.target.value.trim()
                        ? folderFor(e.target.value)
                        : "",
                    }),
              })
            }
            value={form.name}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Role</span>
          <Input
            className="h-10"
            maxLength={80}
            onChange={(e) => update({ role: e.target.value })}
            placeholder="Researcher, on-call helper…"
            value={form.role}
          />
        </label>
      </div>
      {editingFolder ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Folder</span>
          <span className="text-muted-foreground text-xs">
            agents/&lt;folder&gt;, and its address in URLs. Lowercase letters,
            digits and hyphens; it can't change later.
          </span>
          <Input
            aria-invalid={taken || !CREW_ID.test(form.folder)}
            className="h-10 font-mono"
            maxLength={40}
            onChange={(e) =>
              update({
                customFolder: true,
                folder: e.target.value.toLowerCase(),
              })
            }
            value={form.folder}
          />
        </label>
      ) : (
        <p className="text-muted-foreground text-xs">
          Folder{" "}
          <span className="text-foreground font-mono">
            agents/{form.folder || "…"}
          </span>
          , from the name. It can't change later.{" "}
          <button
            className="hover:text-foreground underline underline-offset-2"
            onClick={() => setEditingFolder(true)}
            type="button"
          >
            Change
          </button>
        </p>
      )}
      {taken ? (
        <p className="text-destructive text-xs" role="alert">
          agents/{form.folder} is already in the crew; choose another folder.
        </p>
      ) : null}
      {blank ? (
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1.5 font-medium">Look</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {LOOKS.map((look) => (
              <button
                aria-label={look.name}
                aria-pressed={form.mascot === look.kind}
                className={cn(
                  "hover:bg-muted/50 flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors",
                  form.mascot === look.kind &&
                    "border-foreground bg-muted ring-foreground ring-1"
                )}
                key={look.kind}
                onClick={() => update({ mascot: look.kind })}
                type="button"
              >
                <Mascot kind={look.kind} mood="idle" size={48} />
                <span className="text-muted-foreground text-[11px]">
                  {look.name}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}

/** The model cards: the role's suggestion, popular picks, and the current one, each only when AI Gateway lists it. */
function useModelCards(
  form: WizardForm,
  models: readonly ModelOption[]
): { readonly cards: readonly string[]; readonly suggested?: string } {
  return useMemo(() => {
    const listed = (id: string) =>
      models.length === 0 || models.some((model) => model.id === id);
    const suggested = form.preset?.model;
    const cards = [
      ...new Set([suggested ?? "", ...POPULAR_MODELS].filter(Boolean)),
    ]
      .filter(listed)
      .slice(0, 3);
    if (form.model && !cards.includes(form.model)) {
      cards.push(form.model);
    }
    return {
      cards,
      ...(suggested && listed(suggested) ? { suggested } : {}),
    };
  }, [form.model, form.preset, models]);
}

function ModelStep({
  form,
  models,
  update,
}: StepProps & { readonly models: readonly ModelOption[] }) {
  const { cards, suggested } = useModelCards(form, models);
  const [searching, setSearching] = useState(false);
  const names = new Map(models.map((model) => [model.id, model.name]));
  const role = form.role.trim().toLowerCase() || "this role";
  return (
    <>
      <Heading hint="Runs through AI Gateway. You can change it any time in Edit.">
        Pick a model
      </Heading>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-2 text-xs font-medium">
          Suggested for {role}
        </legend>
        {cards.map((id) => {
          const selected = form.model === id;
          return (
            <RadioCard
              checked={selected}
              className={cn(
                "hover:bg-muted/50 flex min-h-[60px] flex-wrap items-center gap-3.5 rounded-xl border px-3.5 py-2.5 transition-colors",
                selected && "border-foreground ring-foreground ring-1"
              )}
              key={id}
              name="model"
              onSelect={() => update({ model: id })}
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
                  {id === suggested ? (
                    <span className="rounded-full bg-green-100 px-2 text-[11px] leading-4 text-green-800">
                      Suggested
                    </span>
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
            onChange={(model) => update({ model })}
            required={false}
            value={cards.includes(form.model) ? "" : form.model}
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
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Reasoning</legend>
        <span className="bg-muted inline-flex gap-0.5 rounded-[10px] p-[3px]">
          {REASONING.map((option) => (
            <RadioCard
              checked={form.reasoning === option.value}
              className={cn(
                "text-muted-foreground inline-flex h-[34px] items-center rounded-lg px-3.5 text-[13px]",
                form.reasoning === option.value &&
                  "bg-background text-foreground shadow-xs"
              )}
              key={option.label}
              name="reasoning"
              onSelect={() => update({ reasoning: option.value })}
            >
              {option.label}
            </RadioCard>
          ))}
        </span>
      </fieldset>
    </>
  );
}

function InstructionsStep({ form, update }: StepProps) {
  const [draft, setDraft] = useState("");
  const name = form.name.trim() || "this member";
  const on = form.prompts.filter((prompt) => prompt.on).length;
  const full = on >= MAX_PROMPTS;
  const addPrompt = () => {
    const text = draft.trim();
    if (!text || full || form.prompts.some((prompt) => prompt.text === text)) {
      return;
    }
    update({ prompts: [...form.prompts, { on: true, text }] });
    setDraft("");
  };
  return (
    <>
      <Heading
        hint={
          form.preset === BLANK_PRESET
            ? "Describe what it's for. Edit it any time."
            : `A first draft for ${form.role.trim().toLowerCase() || "this role"}. Edit it to fit your team.`
        }
      >
        How should {name} work?
      </Heading>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Instructions</span>
        <Textarea
          className="bg-muted/40 min-h-48 font-mono text-[12.5px] leading-5"
          maxLength={50_000}
          onChange={(e) => update({ instructions: e.target.value })}
          value={form.instructions}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Add a section:</span>
        {INSTRUCTION_SECTIONS.map((section) => (
          <button
            className="hover:bg-muted min-h-8 rounded-full border px-3 text-xs transition-colors disabled:opacity-50"
            disabled={form.instructions.includes(section.text.split("\n")[0])}
            key={section.label}
            onClick={() =>
              update({
                instructions: `${form.instructions.trimEnd()}\n\n${section.text}`,
              })
            }
            type="button"
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">
          Starter prompts{" "}
          <span className="text-muted-foreground font-normal">
            shown in a new chat, up to four
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          {form.prompts.map((prompt, index) => (
            <button
              aria-pressed={prompt.on}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] transition-colors disabled:opacity-50",
                prompt.on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              )}
              disabled={!prompt.on && full}
              key={prompt.text}
              onClick={() =>
                update({
                  prompts: form.prompts.map((p, i) =>
                    i === index ? { ...p, on: !p.on } : p
                  ),
                })
              }
              type="button"
            >
              {prompt.on ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              {prompt.text}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addPrompt();
          }}
        >
          <Input
            aria-label="Another starter prompt"
            className="h-9"
            disabled={full}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={full ? "Four is the most" : "Write your own"}
            value={draft}
          />
          <Button
            disabled={full || !draft.trim()}
            size="lg"
            type="submit"
            variant="outline"
          >
            Add
          </Button>
        </form>
      </div>
    </>
  );
}

function AccessStep({
  choices,
  form,
  update,
}: StepProps & { readonly choices: readonly ConnectorChoice[] }) {
  const name = form.name.trim() || "this member";
  const off = new Set(form.servicesOff);
  return (
    <>
      <Heading hint="Connected services, built-in tools, and when to check with you.">
        What can {name} reach?
      </Heading>

      <section className="flex flex-col gap-2">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">
            Changes in connected services
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {APPROVAL_CHOICES.map((mode) => {
              const selected = form.approvals === mode;
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
                  onSelect={() => update({ approvals: mode })}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {APPROVAL_LABELS[mode].label}
                    </span>
                    {mode === "always" ? (
                      <span className="rounded-full bg-green-100 px-2 text-[11px] leading-4 text-green-800">
                        Default
                      </span>
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
        {form.approvals === "never" ? (
          <div
            className="flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950"
            role="note"
          >
            <Mascot kind={form.mascot} mood="needs" size={36} />
            <span className="text-[13px] text-orange-800 dark:text-orange-200">
              Anyone who can chat with {name} can have it change things through
              its services, and a page {name} reads could try to steer it.
            </span>
          </div>
        ) : null}
        {form.approvals === "auto" ? (
          <p className="text-muted-foreground text-xs">
            The reviewer sees the request, never the credential, through AI
            Gateway with no data kept.
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Either way, the first visit to a new website asks once, so your
          credentials only go where you've allowed.
        </p>
      </section>

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
                  checked={!off.has(choice.id)}
                  className="accent-primary size-4"
                  onChange={(e) =>
                    update({
                      servicesOff: e.target.checked
                        ? form.servicesOff.filter((id) => id !== choice.id)
                        : [...form.servicesOff, choice.id],
                    })
                  }
                  type="checkbox"
                />
                <span className="flex-1">{choice.name}</span>
              </label>
            ))}
          </div>
        )}
        {form.preset ? (
          <p className="text-muted-foreground text-xs">
            {form.preset.servicesTip}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium">Built-in tools</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <ToolBox
            checked={form.bash === "on"}
            label="Shell"
            onChange={(on) => update({ bash: on ? "on" : "off" })}
          />
          <ToolBox
            checked={form.webSearch === "on"}
            label="Web search"
            onChange={(on) => update({ webSearch: on ? "on" : "off" })}
          />
          <div className="flex min-h-11 items-center gap-2 rounded-xl border px-3">
            <span>Pages</span>
            <Select
              items={(["always", "once", "off"] as const).map((mode) => ({
                label: WEB_FETCH[mode],
                value: mode,
              }))}
              onValueChange={(next: WebFetchChoice | null) =>
                next && update({ webFetch: next })
              }
              value={form.webFetch}
            >
              <SelectTrigger
                aria-label="Web pages"
                className="min-w-0 flex-1"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["always", "once", "off"] as const).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {WEB_FETCH[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Fetching a page runs outside the sandbox, so a URL could carry chat
          data away; asking every page lets you see each one. The sandbox's
          network starts as the template member's.
        </p>
      </section>
    </>
  );
}

/** A card or segment that's one choice of a radio group: a real radio input, visually hidden. */
function RadioCard({
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
        "has-focus-visible:ring-ring/50 cursor-pointer has-focus-visible:ring-3",
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

function servicesLabel(
  services: readonly string[] | undefined,
  choices: readonly ConnectorChoice[]
): string {
  if (services === undefined) {
    return choices.length === 0
      ? "Every connector, once one is attached"
      : "All connectors";
  }
  const names = choices
    .filter((choice) => services.includes(choice.id))
    .map((choice) => choice.name);
  return names.join(", ") || "None";
}

function ReviewStep({
  choices,
  form,
  go,
  models,
}: {
  readonly choices: readonly ConnectorChoice[];
  readonly form: WizardForm;
  readonly go: (step: number) => void;
  readonly models: readonly ModelOption[];
}) {
  const name = form.name.trim();
  const prompts = form.prompts.filter((prompt) => prompt.on).length;
  const services = servicesOf(form, choices);
  const serviceNames = servicesLabel(services, choices);
  const tools = [
    form.bash === "on" ? "Shell" : "",
    form.webSearch === "on" ? "Web search" : "",
    form.webFetch === "off"
      ? ""
      : `Pages (${WEB_FETCH[form.webFetch].toLowerCase()})`,
  ]
    .filter(Boolean)
    .join(", ");
  const reasoning = REASONING.find((r) => r.value === form.reasoning)?.label;
  const rows: readonly [string, string, number][] = [
    [
      "Role",
      form.preset === BLANK_PRESET
        ? form.role.trim() || "Your own role"
        : `${form.preset?.name ?? ""} · ${form.role.trim()}`,
      0,
    ],
    ["Name", `${name} (agents/${form.folder})`, 1],
    [
      "Model",
      `${models.find((m) => m.id === form.model)?.name ?? form.model}, ${reasoning?.toLowerCase()} reasoning`,
      2,
    ],
    [
      "Instructions",
      `${form.instructions.trim().split("\n").length} lines, ${prompts} starter prompt${prompts === 1 ? "" : "s"}`,
      3,
    ],
    ["Services", serviceNames, 4],
    ["Tools", tools || "None", 4],
    ["Changes", APPROVAL_LABELS[form.approvals].label, 4],
  ];
  return (
    <>
      <Heading
        hint={`This opens a pull request adding agents/${form.folder}. Merge it and Vercel deploys ${name}.`}
      >
        {name} is ready to join
      </Heading>
      <dl className="flex flex-col overflow-hidden rounded-xl border">
        {rows.map(([label, value, step]) => (
          <div
            className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3.5 py-1.5 last:border-b-0"
            key={label}
          >
            <dt className="text-muted-foreground w-[110px] text-[13px]">
              {label}
            </dt>
            <dd className="min-w-36 flex-1">{value}</dd>
            <button
              aria-label={`Change ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground py-1.5 text-[13px] underline underline-offset-2"
              onClick={() => go(step)}
              type="button"
            >
              Change
            </button>
          </div>
        ))}
      </dl>
    </>
  );
}

/** How the new member will look, beside Review. */
function Preview({ form }: { readonly form: WizardForm }) {
  const prompts = form.prompts.filter((prompt) => prompt.on).slice(0, 3);
  const name = form.name.trim();
  const role = form.role.trim();
  return (
    <aside
      aria-label="Preview"
      className="bg-muted/40 flex flex-col gap-3.5 border-t p-5 sm:w-[300px] sm:shrink-0 sm:self-stretch sm:border-t-0 sm:border-l"
    >
      <span className="text-muted-foreground text-xs font-medium">Preview</span>
      <div className="bg-background flex flex-col items-center gap-2 rounded-2xl border p-4 text-center shadow-xs">
        <Mascot kind={form.mascot} mood="done" size={96} />
        <span className="text-base font-semibold">{name}</span>
        {role ? (
          <span className="text-muted-foreground text-[13px]">{role}</span>
        ) : null}
        <div className="mt-1 flex w-full flex-col gap-1.5">
          {(prompts.length > 0
            ? prompts.map((prompt) => prompt.text)
            : ["No starter prompts yet"]
          ).map((text) => (
            <span
              className="rounded-[10px] border px-3 py-2 text-left text-xs text-neutral-700 dark:text-neutral-300"
              key={text}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
      <span className="text-muted-foreground text-xs font-medium">
        In the crew list
      </span>
      <div className="bg-background flex items-center gap-3 rounded-[10px] border p-2">
        <Mascot kind={form.mascot} mood="idle" size={36} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{name}</span>
          {role ? (
            <span className="text-muted-foreground truncate text-[13px]">
              {role}
            </span>
          ) : null}
        </span>
      </div>
    </aside>
  );
}
