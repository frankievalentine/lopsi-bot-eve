"use client";

import { ExternalLinkIcon, GitPullRequestIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Mascot, type MascotKind } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReasoningLevel } from "@/lib/agent-model";
import type { MemberConfig } from "@/lib/config-changes";
import type { PullRequest } from "@/lib/github";
import { cn } from "@/lib/utils";
import {
  connectorChoices,
  loadMemberConfig,
  modelOptions,
  proposeMemberEdit,
  proposeNewMember,
} from "./config-actions";
import {
  AccessFields,
  type AccessForm,
  accessFormOf,
  accessOf,
  type ConnectorChoice,
  NEW_ACCESS,
} from "./member-access-fields";
import {
  FallbackPicker,
  type ModelOption,
  ModelPicker,
  ReasoningSelect,
} from "./model-picker";

/** Ported from lopsi-bot's edit-agent-dialog.tsx and new-agent-dialog.tsx. */

const KINDS: MascotKind[] = [
  "skipper",
  "lookout",
  "deckhand",
  "purser",
  "navigator",
  "signal",
];

const NEW_INSTRUCTIONS = `# Identity

You are a member of the crew. Describe what you're for here.

# How you work

- Ask before doing anything that can't be undone.
`;

type Mode =
  | { readonly kind: "edit"; readonly memberId: string }
  | { readonly kind: "new" };

interface Form {
  readonly access: AccessForm;
  readonly fallbacks: readonly string[];
  readonly id: string;
  readonly instructions: string;
  readonly mascot: MascotKind;
  readonly model: string;
  readonly name: string;
  readonly order: string;
  readonly reasoning: ReasoningLevel | "";
  readonly role: string;
  readonly suggestions: string;
}

const EMPTY_FORM: Form = {
  access: NEW_ACCESS,
  fallbacks: [],
  id: "",
  instructions: NEW_INSTRUCTIONS,
  mascot: "lookout",
  model: "",
  name: "",
  order: "",
  reasoning: "",
  role: "",
  suggestions: "",
};

function formOf(config: MemberConfig): Form {
  return {
    access: accessFormOf(config),
    fallbacks: config.model?.fallbacks ?? [],
    id: "",
    instructions: config.instructions ?? "",
    mascot: config.crew.mascot,
    model: config.model?.model ?? "",
    name: config.crew.name,
    order: config.crew.order === undefined ? "" : String(config.crew.order),
    reasoning: config.model?.reasoning ?? "",
    role: config.crew.role ?? "",
    suggestions: (config.crew.suggestions ?? []).join("\n"),
  };
}

/** The edited config, keeping what the dialog can't change exactly as it was. */
function configOf(form: Form, from: MemberConfig | undefined): MemberConfig {
  const suggestions = form.suggestions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const order = form.order.trim() === "" ? undefined : Number(form.order);
  const canEditModel = from === undefined || from.model !== undefined;
  const fallbacks = form.fallbacks.filter((id) => id !== form.model.trim());
  const { access, connectors } = accessOf(form.access);
  return {
    // A new member gets the template member's tools and network.
    ...(from === undefined ? {} : { access }),
    crew: {
      ...(connectors === undefined ? {} : { connectors }),
      mascot: form.mascot,
      name: form.name.trim(),
      ...(form.role.trim() ? { role: form.role.trim() } : {}),
      ...(order === undefined ? {} : { order }),
      ...(suggestions.length > 0 ? { suggestions } : {}),
    },
    ...(from === undefined || from.instructions !== undefined
      ? { instructions: form.instructions }
      : {}),
    ...(canEditModel && form.model.trim()
      ? {
          model: {
            ...(fallbacks.length > 0 ? { fallbacks } : {}),
            model: form.model.trim(),
            ...(form.reasoning ? { reasoning: form.reasoning } : {}),
          },
        }
      : {}),
  };
}

/** Loads what the dialog edits each time it opens: the member's config (when editing) and the model list. */
function useMemberConfig(open: boolean, memberId: string | undefined) {
  const [from, setFrom] = useState<MemberConfig | undefined>();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly ModelOption[]>([]);
  const [choices, setChoices] = useState<readonly ConnectorChoice[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    setLoadError(null);
    setFrom(undefined);
    setForm(EMPTY_FORM);
    modelOptions()
      .then((list) => current && setModels(list))
      .catch(() => undefined);
    connectorChoices()
      .then((list) => current && setChoices(list))
      .catch(() => undefined);
    if (memberId === undefined) {
      return;
    }
    setLoading(true);
    loadMemberConfig(memberId)
      .then((result) => {
        if (!current) {
          return;
        }
        if (result.ok) {
          setFrom(result.config);
          setForm(formOf(result.config));
        } else {
          setLoadError(result.error);
        }
      })
      .catch(() => current && setLoadError("Couldn't load this crew member."))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [open, memberId]);

  return { choices, form, from, loadError, loading, models, setForm };
}

/** Opens the pull request for the form: a new member, or an edit from `from`. */
function requestChange(
  memberId: string | undefined,
  from: MemberConfig | undefined,
  form: Form
) {
  if (memberId === undefined) {
    return proposeNewMember({
      config: configOf(form, undefined),
      id: form.id.trim(),
    });
  }
  if (from === undefined) {
    return Promise.resolve({ error: "Still loading.", ok: false as const });
  }
  return proposeMemberEdit(memberId, from, configOf(form, from));
}

type Setter = <K extends keyof Form>(key: K) => (value: Form[K]) => void;

interface FieldsProps {
  readonly choices: readonly ConnectorChoice[];
  readonly editing: boolean;
  readonly form: Form;
  readonly from: MemberConfig | undefined;
  readonly models: readonly ModelOption[];
  readonly set: Setter;
}

/**
 * A crew member's name, role, mascot, suggestions, order, model and
 * instructions, or a new crew member. Saving opens a pull request; nothing
 * changes until it's merged and deployed.
 */
export function MemberConfigDialog({
  mode,
  onOpenChange,
  onPullRequest,
  open,
}: {
  readonly mode: Mode;
  readonly onOpenChange: (open: boolean) => void;
  /** Called once the change's pull request is open. */
  readonly onPullRequest?: () => void;
  readonly open: boolean;
}) {
  const memberId = mode.kind === "edit" ? mode.memberId : undefined;
  const { choices, form, from, loadError, loading, models, setForm } =
    useMemberConfig(open, memberId);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pull, setPull] = useState<PullRequest | null>(null);

  useEffect(() => {
    if (open) {
      setPull(null);
      setSubmitError(null);
    }
  }, [open]);

  const set: Setter = (key) => (value) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);
    try {
      const result = await requestChange(memberId, from, form);
      if (result.ok) {
        setPull(result.pull);
        onPullRequest?.();
      } else {
        setSubmitError(result.error);
      }
    } catch {
      setSubmitError("That didn't go through. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const editing = mode.kind === "edit";
  const ready = !(editing && from === undefined);
  const error = submitError ?? loadError;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {pull ? (
          <PullRequestOpened onClose={() => onOpenChange(false)} pull={pull} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit crew member" : "New crew member"}
              </DialogTitle>
              <DialogDescription>
                Saving opens a pull request. Nothing changes until it's merged
                and deployed.
              </DialogDescription>
            </DialogHeader>

            {loading ? (
              <p className="text-muted-foreground text-sm">
                Loading from GitHub…
              </p>
            ) : null}
            {ready ? (
              <MemberFields
                choices={choices}
                editing={editing}
                form={form}
                from={from}
                models={models}
                set={set}
              />
            ) : null}

            {error === null ? null : (
              <p
                className="text-destructive text-sm whitespace-pre-wrap"
                role="alert"
              >
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={!ready || saving || !form.name.trim()}
                type="submit"
              >
                {saving ? "Opening pull request…" : "Open pull request"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberFields({
  choices,
  editing,
  form,
  from,
  models,
  set,
}: FieldsProps) {
  return (
    <>
      {editing ? null : (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Folder</span>
          <span className="text-muted-foreground text-xs">
            Its directory, agents/&lt;folder&gt;, and its address in URLs.
            Lowercase letters, digits and hyphens; it can't change later.
          </span>
          <Input
            maxLength={40}
            onChange={(e) => set("id")(e.target.value.toLowerCase())}
            pattern="[a-z][a-z0-9-]*"
            placeholder="scout"
            required
            value={form.id}
          />
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input
            maxLength={40}
            onChange={(e) => set("name")(e.target.value)}
            required
            value={form.name}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Role</span>
          <Input
            maxLength={80}
            onChange={(e) => set("role")(e.target.value)}
            placeholder="Researcher, on-call helper…"
            value={form.role}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium">Mascot</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((kind) => (
            <button
              aria-label={kind}
              aria-pressed={form.mascot === kind}
              className={cn(
                "hover:bg-accent rounded-lg border p-1.5 transition-colors",
                form.mascot === kind && "border-primary bg-accent"
              )}
              key={kind}
              onClick={() => set("mascot")(kind)}
              type="button"
            >
              <Mascot kind={kind} mood="idle" size={32} />
            </button>
          ))}
        </div>
      </fieldset>

      <ModelFields
        editing={editing}
        form={form}
        from={from}
        models={models}
        set={set}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Suggestions</span>
          <span className="text-muted-foreground text-xs">
            Starter prompts, one per line, up to four.
          </span>
          <Textarea
            className="min-h-20 text-[13px]"
            onChange={(e) => set("suggestions")(e.target.value)}
            value={form.suggestions}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Order</span>
          <span className="text-muted-foreground text-xs">Lowest first.</span>
          <Input
            inputMode="numeric"
            min={0}
            onChange={(e) => set("order")(e.target.value)}
            type="number"
            value={form.order}
          />
        </label>
      </div>

      <AccessFields
        choices={choices}
        editing={editing}
        onChange={set("access")}
        value={form.access}
      />

      <InstructionsField editing={editing} form={form} from={from} set={set} />
    </>
  );
}

/** Model and reasoning, unless agent.ts was edited by hand. */
function ModelFields({
  editing,
  form,
  from,
  models,
  set,
}: Omit<FieldsProps, "choices">) {
  if (editing && from?.model === undefined) {
    return (
      <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2.5 text-sm">
        This crew member's agent.ts was edited by hand, so its model can only be
        changed there.
      </p>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <span className="font-medium">Model</span>
          <ModelPicker
            models={models}
            onChange={set("model")}
            required={!editing}
            value={form.model}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Reasoning</span>
          <ReasoningSelect onChange={set("reasoning")} value={form.reasoning} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Fallback models</span>
        <span className="text-muted-foreground text-xs">
          Tried in order when the model fails on every provider. Up to three.
        </span>
        <FallbackPicker
          model={form.model}
          models={models}
          onChange={set("fallbacks")}
          value={form.fallbacks}
        />
      </div>
    </>
  );
}

/** instructions.md, unless the member's instructions are split across other files. */
function InstructionsField({
  editing,
  form,
  from,
  set,
}: Omit<FieldsProps, "choices" | "models">) {
  if (editing && from?.instructions === undefined) {
    return (
      <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2.5 text-sm">
        This crew member's instructions aren't a single instructions.md, so edit
        them in the repository.
      </p>
    );
  }
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">Instructions</span>
      <span className="text-muted-foreground text-xs">
        What it's for and how it should work: agent/instructions.md, read at the
        start of every turn.
      </span>
      <Textarea
        className="max-h-[40svh] min-h-32 font-mono text-[13px]"
        maxLength={50_000}
        onChange={(e) => set("instructions")(e.target.value)}
        value={form.instructions}
      />
    </label>
  );
}

function PullRequestOpened({
  onClose,
  pull,
}: {
  readonly onClose: () => void;
  readonly pull: PullRequest;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Pull request opened</DialogTitle>
        <DialogDescription>
          {pull.draft ? "A draft pull request" : "A pull request"} is waiting
          for review. Merging it deploys the change.
        </DialogDescription>
      </DialogHeader>
      <a
        className="hover:bg-accent flex items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors"
        href={pull.url}
        rel="noreferrer"
        target="_blank"
      >
        <GitPullRequestIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate">
          #{pull.number} {pull.title}
        </span>
        <ExternalLinkIcon className="text-muted-foreground size-3.5 shrink-0" />
      </a>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  );
}
