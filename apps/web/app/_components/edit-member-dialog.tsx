"use client";

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mascot, type MascotKind } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_LABELS } from "@/lib/approval-labels";
import type { MemberConfig } from "@/lib/config-changes";
import {
  CREW_PRESETS,
  type CrewPreset,
  INSTRUCTION_SECTIONS,
} from "@/lib/crew-presets";
import type { PullRequest } from "@/lib/github";
import {
  type Change,
  type ConnectorChoice,
  changesOf,
  configOf,
  type EditForm,
  filesOf,
  formOf,
  LOOK_NAMES,
  linesOf,
  MAX_PROMPTS,
  reasoningLabel,
  SECTIONS,
  type SectionId,
  servicesLabel,
  type Update,
} from "@/lib/member-edit";
import { useIsPhone } from "@/lib/use-phone";
import { cn } from "@/lib/utils";
import {
  connectorChoices,
  loadMemberConfig,
  modelOptions,
  proposeMemberEdit,
} from "./config-actions";
import { PullRequestOpened, useUnsavedWarning } from "./member-dialog-parts";
import {
  ApprovalChoice,
  ModelChoice,
  RadioCard,
  ReasoningChoice,
  ServicesChoice,
  ToolsChoice,
} from "./member-fields";
import { FallbackPicker, type ModelOption } from "./model-picker";

/**
 * Edit crew member: every setting in one scrolling form beside a section list,
 * with a dot on each section that changed, then a before and after review that
 * opens the pull request. On phones, the sections are a list that opens one at
 * a time. Suggestions come from the crew role whose look the member has
 * (lib/crew-presets.ts).
 */

/** Loads the member's config, the model list and the connectors each time the dialog opens. */
function useEditConfig(open: boolean, memberId: string) {
  const [from, setFrom] = useState<MemberConfig | undefined>();
  const [loaded, setLoaded] = useState<EditForm | undefined>();
  const [form, setForm] = useState<EditForm | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly ModelOption[]>([]);
  const [choices, setChoices] = useState<readonly ConnectorChoice[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    setFrom(undefined);
    setLoaded(undefined);
    setForm(undefined);
    setLoadError(null);
    modelOptions()
      .then((list) => current && setModels(list))
      .catch(() => undefined);
    connectorChoices()
      .then((list) => current && setChoices(list))
      .catch(() => undefined);
    loadMemberConfig(memberId)
      .then((result) => {
        if (!current) {
          return;
        }
        if (result.ok) {
          setFrom(result.config);
          setLoaded(formOf(result.config));
          setForm(formOf(result.config));
        } else {
          setLoadError(result.error);
        }
      })
      .catch(() => current && setLoadError("Couldn't load this crew member."));
    return () => {
      current = false;
    };
  }, [open, memberId]);

  return { choices, form, from, loadError, loaded, models, setForm };
}

/**
 * Edit a crew member. Saving opens a pull request; nothing changes until it's
 * merged and deployed.
 */
/** The form's change list, from what was loaded. */
function useChanges(
  form: EditForm | undefined,
  loaded: EditForm | undefined,
  choices: readonly ConnectorChoice[],
  models: readonly ModelOption[]
): readonly Change[] {
  return useMemo(() => {
    if (!(form && loaded)) {
      return [];
    }
    const names = new Map(models.map((model) => [model.id, model.name]));
    return changesOf(loaded, form, { choices, models: names });
  }, [choices, form, loaded, models]);
}

/** Opens the pull request for the edit, keeping its outcome. */
function useSubmit(memberId: string, onPullRequest?: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pull, setPull] = useState<PullRequest | null>(null);
  const submit = async (from: MemberConfig, form: EditForm) => {
    setSaving(true);
    setError(null);
    try {
      const result = await proposeMemberEdit(memberId, from, configOf(form));
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
  const reset = () => {
    setError(null);
    setPull(null);
  };
  return { error, pull, reset, saving, setError, submit };
}

/** What the header calls the current screen: the review, a phone's open section, or the member. */
function headerTitle(
  view: "form" | "review",
  opened: SectionId | null,
  name: string | undefined
): string {
  if (view === "review") {
    return "Review changes";
  }
  const section = SECTIONS.find((s) => s.id === opened);
  return section ? section.label : `Edit ${name ?? "Crew Member"}`;
}

/**
 * Edit a crew member. Saving opens a pull request; nothing changes until it's
 * merged and deployed.
 */
export function EditMemberDialog({
  memberId,
  onOpenChange,
  onPullRequest,
  open,
}: {
  readonly memberId: string;
  readonly onOpenChange: (open: boolean) => void;
  /** Called once the change's pull request is open. */
  readonly onPullRequest?: () => void;
  readonly open: boolean;
}) {
  const phone = useIsPhone();
  const { choices, form, from, loadError, loaded, models, setForm } =
    useEditConfig(open, memberId);
  const { error, pull, reset, saving, setError, submit } = useSubmit(
    memberId,
    onPullRequest
  );
  const [view, setView] = useState<"form" | "review">("form");
  const [opened, setOpened] = useState<SectionId | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each open only.
  useEffect(() => {
    if (open) {
      setView("form");
      setOpened(null);
      setDiscarding(false);
      reset();
    }
  }, [open]);

  const changes = useChanges(form, loaded, choices, models);
  const unsaved = open && pull === null && changes.length > 0;
  useUnsavedWarning(unsaved);

  const update: Update = (change) => {
    setError(null);
    setForm((current) => current && { ...current, ...change });
  };
  const close = () => (unsaved ? setDiscarding(true) : onOpenChange(false));
  const toForm = () => {
    setOpened(null);
    setView("form");
  };
  const inside = phone && (opened !== null || view === "review");

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          phone
            ? "h-svh max-w-none rounded-none ring-0"
            : "h-[min(765px,90svh)] max-w-[calc(100%-2rem)] sm:max-w-[800px]",
          pull && "h-auto"
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
            <EditHeader
              changes={changes.length}
              form={form}
              memberId={memberId}
              onClose={close}
              title={headerTitle(view, phone ? opened : null, loaded?.name)}
              {...(inside ? { onBack: toForm } : {})}
            />
            <div className="flex min-h-0 flex-1">
              <EditBody
                changes={changes}
                loadError={loadError}
                onOpen={setOpened}
                opened={opened}
                phone={phone}
                props={
                  form && loaded
                    ? { choices, form, loaded, memberId, models, update }
                    : undefined
                }
                view={view}
              />
            </div>
            {error === null ? null : (
              <p
                className="text-destructive border-t px-5 py-2.5 text-sm whitespace-pre-wrap"
                role="alert"
              >
                {error}
              </p>
            )}
            <EditFooter
              changes={changes.length}
              discarding={discarding}
              onBack={toForm}
              onClose={close}
              onDiscard={() => onOpenChange(false)}
              onKeep={() => setDiscarding(false)}
              onReview={() => {
                setOpened(null);
                setView("review");
              }}
              onSubmit={() => from && form && submit(from, form)}
              phone={phone}
              saving={saving}
              view={view}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditBody({
  changes,
  loadError,
  onOpen,
  opened,
  phone,
  props,
  view,
}: {
  readonly changes: readonly Change[];
  readonly loadError: string | null;
  readonly onOpen: (id: SectionId) => void;
  readonly opened: SectionId | null;
  readonly phone: boolean;
  readonly props: SectionProps | undefined;
  readonly view: "form" | "review";
}) {
  if (props === undefined) {
    return (
      <p
        className={cn(
          "p-5 text-sm",
          loadError ? "text-destructive" : "text-muted-foreground"
        )}
        role={loadError ? "alert" : undefined}
      >
        {loadError ?? "Loading from GitHub…"}
      </p>
    );
  }
  if (view === "review") {
    return (
      <Review
        changes={changes}
        files={filesOf(props.memberId, changes)}
        name={props.loaded.name}
        update={props.update}
      />
    );
  }
  return phone ? (
    <PhoneSections
      changes={changes}
      onOpen={onOpen}
      opened={opened}
      props={props}
    />
  ) : (
    <DesktopSections changes={changes} props={props} />
  );
}

function HeaderLead({
  changes,
  form,
  onBack,
}: {
  readonly changes: number;
  readonly form: EditForm | undefined;
  readonly onBack?: () => void;
}) {
  if (onBack) {
    return (
      <Button
        aria-label="Back to sections"
        onClick={onBack}
        size="icon"
        variant="ghost"
      >
        <ChevronLeftIcon />
      </Button>
    );
  }
  return form ? (
    <Mascot
      kind={form.mascot}
      mood={changes > 0 ? "thinking" : "idle"}
      size={44}
    />
  ) : null;
}

function EditHeader({
  changes,
  form,
  memberId,
  onBack,
  onClose,
  title,
}: {
  readonly changes: number;
  readonly form: EditForm | undefined;
  readonly memberId: string;
  readonly onBack?: () => void;
  readonly onClose: () => void;
  readonly title: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
      <HeaderLead
        changes={changes}
        form={form}
        {...(onBack ? { onBack } : {})}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <DialogTitle className="truncate text-base font-semibold">
          {title}
        </DialogTitle>
        <DialogDescription className="truncate text-[13px]">
          {form?.role.trim() ? `${form.role.trim()} · ` : ""}
          <span className="font-mono text-xs">agents/{memberId}</span>
        </DialogDescription>
      </div>
      {changes > 0 ? (
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 max-sm:hidden dark:bg-blue-950 dark:text-blue-300">
          {changes === 1 ? "1 unsaved change" : `${changes} unsaved changes`}
        </span>
      ) : null}
      <Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
        <XIcon />
      </Button>
    </div>
  );
}

function reviewLabel(changes: number): string {
  if (changes === 0) {
    return "No Changes Yet";
  }
  return changes === 1 ? "Review 1 Change" : `Review ${changes} Changes`;
}

function EditFooter({
  changes,
  discarding,
  onBack,
  onClose,
  onDiscard,
  onKeep,
  onReview,
  onSubmit,
  phone,
  saving,
  view,
}: {
  readonly changes: number;
  readonly discarding: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDiscard: () => void;
  readonly onKeep: () => void;
  readonly onReview: () => void;
  readonly onSubmit: () => void;
  readonly phone: boolean;
  readonly saving: boolean;
  readonly view: "form" | "review";
}) {
  if (discarding) {
    return (
      <div className="bg-muted flex flex-wrap items-center gap-3 border-t px-5 py-3">
        <span className="text-sm" role="alert">
          Discard your changes?
        </span>
        <span className="ml-auto flex gap-2">
          <Button onClick={onKeep} size="lg" variant="outline">
            Keep Editing
          </Button>
          <Button onClick={onDiscard} size="lg" variant="destructive">
            Discard Changes
          </Button>
        </span>
      </div>
    );
  }
  const primary =
    view === "review" ? (
      <Button
        className={cn(phone && "h-12 w-full text-[15px]")}
        disabled={saving || changes === 0}
        onClick={onSubmit}
        size="lg"
      >
        {saving ? "Opening Pull Request…" : "Open Pull Request"}
      </Button>
    ) : (
      <Button
        className={cn(phone && "h-12 w-full text-[15px]")}
        disabled={changes === 0}
        onClick={onReview}
        size="lg"
      >
        {reviewLabel(changes)}
      </Button>
    );
  if (phone) {
    return (
      <div className="border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {primary}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border-t px-5 py-3">
      <span className="text-muted-foreground text-[13px]">
        {view === "review"
          ? "Nothing changes until it's merged and deployed."
          : "Saving opens a pull request."}
      </span>
      <span className="ml-auto flex gap-2">
        {view === "review" ? (
          <Button onClick={onBack} size="lg" variant="outline">
            Back to Editing
          </Button>
        ) : (
          <Button onClick={onClose} size="lg" variant="outline">
            {changes === 0 ? "Close" : "Cancel"}
          </Button>
        )}
        {primary}
      </span>
    </div>
  );
}

interface SectionProps {
  readonly choices: readonly ConnectorChoice[];
  readonly form: EditForm;
  readonly loaded: EditForm;
  readonly memberId: string;
  readonly models: readonly ModelOption[];
  readonly update: Update;
}

/** The crew role with this look, whose suggestions the form offers. */
function presetFor(mascot: MascotKind): CrewPreset | undefined {
  return CREW_PRESETS.find((preset) => preset.mascot === mascot);
}

function SectionBody({
  id,
  props,
}: {
  readonly id: SectionId;
  readonly props: SectionProps;
}) {
  switch (id) {
    case "profile":
      return <ProfileSection {...props} />;
    case "model":
      return <ModelSection {...props} />;
    case "instructions":
      return <InstructionsSection {...props} />;
    case "starters":
      return <StartersSection {...props} />;
    case "access":
      return <AccessSection {...props} />;
    case "approvals":
      return (
        <ApprovalChoice
          inUse={props.loaded.approvals}
          mascot={props.form.mascot}
          name={props.form.name.trim() || props.loaded.name}
          onChange={(approvals) => props.update({ approvals })}
          value={props.form.approvals}
        />
      );
    default:
      return <AdvancedSection {...props} />;
  }
}

/** Desktop: the section list beside one scrolling form. */
function DesktopSections({
  changes,
  props,
}: {
  readonly changes: readonly Change[];
  readonly props: SectionProps;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionId>("profile");
  const [advanced, setAdvanced] = useState(false);
  const changed = new Set(changes.map((change) => change.section));

  const go = (id: SectionId) => {
    if (id === "advanced") {
      setAdvanced(true);
    }
    setActive(id);
    requestAnimationFrame(() =>
      scroller.current
        ?.querySelector(`[data-section="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  return (
    <>
      <nav
        aria-label="Sections"
        className="bg-muted/40 flex w-[200px] shrink-0 flex-col gap-0.5 border-r p-2.5"
      >
        {SECTIONS.map((section) => (
          <button
            aria-current={active === section.id ? "true" : undefined}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left transition-colors",
              active === section.id
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-foreground/80 hover:bg-background/60"
            )}
            key={section.id}
            onClick={() => go(section.id)}
            type="button"
          >
            <span className="flex-1">{section.label}</span>
            {changed.has(section.id) ? <ChangedDot /> : null}
          </button>
        ))}
      </nav>
      <div
        className="flex min-w-0 flex-1 flex-col gap-8 overflow-y-auto px-6 pt-5 pb-8"
        onScroll={(event) => setActive(visibleSection(event.currentTarget))}
        ref={scroller}
      >
        {SECTIONS.filter((section) => section.id !== "advanced").map(
          (section) => (
            <section
              className="flex scroll-mt-5 flex-col gap-3"
              data-section={section.id}
              key={section.id}
            >
              <h2 className="text-[15px] font-semibold">{section.label}</h2>
              <SectionBody id={section.id} props={props} />
            </section>
          )
        )}
        <AdvancedBox
          onToggle={() => setAdvanced((open) => !open)}
          open={advanced}
          props={props}
          scroller={scroller}
        />
      </div>
    </>
  );
}

/** The last section whose heading has scrolled to the top of the form. */
function visibleSection(scroller: HTMLElement): SectionId {
  const top = scroller.getBoundingClientRect().top + 32;
  let current: SectionId = "profile";
  for (const element of scroller.querySelectorAll<HTMLElement>(
    "[data-section]"
  )) {
    if (element.getBoundingClientRect().top <= top) {
      current = element.dataset.section as SectionId;
    }
  }
  return current;
}

function ChangedDot() {
  return (
    <span
      aria-label="changed"
      className="size-[7px] shrink-0 rounded-full bg-blue-600"
      role="img"
    />
  );
}

function AdvancedBox({
  onToggle,
  open,
  props,
  scroller,
}: {
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly props: SectionProps;
  readonly scroller: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      className="scroll-mt-5 overflow-hidden rounded-xl border"
      data-section="advanced"
    >
      <button
        aria-expanded={open}
        className="bg-muted/40 hover:bg-muted flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors"
        onClick={() => {
          onToggle();
          if (!open) {
            requestAnimationFrame(() =>
              scroller.current
                ?.querySelector('[data-section="advanced"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            );
          }
        }}
        type="button"
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Advanced</h2>
          <span className="text-muted-foreground text-xs">
            {advancedSummary(props.form)}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-5 px-3.5 pt-2 pb-4">
          <AdvancedSection {...props} />
        </div>
      ) : null}
    </section>
  );
}

function advancedSummary(form: EditForm): string {
  const fallbacks = form.fallbacks.length;
  const domains = linesOf(form.domains ?? "").length;
  return [
    fallbacks === 1 ? "1 fallback model" : `${fallbacks} fallback models`,
    form.order.trim() ? `order ${form.order.trim()}` : "default order",
    form.domains === undefined
      ? "sandbox set by hand"
      : `${domains === 1 ? "1 sandbox domain" : `${domains} sandbox domains`}`,
  ].join(" · ");
}

/** Phones: the sections as a list, each opening on its own. */
function PhoneSections({
  changes,
  onOpen,
  opened,
  props,
}: {
  readonly changes: readonly Change[];
  readonly onOpen: (id: SectionId) => void;
  readonly opened: SectionId | null;
  readonly props: SectionProps;
}) {
  if (opened !== null) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-6">
        <SectionBody id={opened} props={props} />
      </div>
    );
  }
  const changed = new Set(changes.map((change) => change.section));
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
      {SECTIONS.map((section) => (
        <button
          className="hover:bg-muted/50 flex min-h-16 items-center gap-3 border-b px-3 py-2 text-left last:border-b-0"
          key={section.id}
          onClick={() => onOpen(section.id)}
          type="button"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              {section.label}
              {changed.has(section.id) ? <ChangedDot /> : null}
            </span>
            <span className="text-muted-foreground truncate text-[13px]">
              {summaryOf(section.id, props)}
            </span>
          </span>
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
      ))}
    </div>
  );
}

function summaryOf(
  id: SectionId,
  { choices, form, models }: SectionProps
): string {
  switch (id) {
    case "profile":
      return [
        form.name.trim(),
        form.role.trim(),
        `${LOOK_NAMES.get(form.mascot) ?? form.mascot} look`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "model":
      return form.model === undefined
        ? "Set in agent.ts"
        : `${models.find((m) => m.id === form.model)?.name ?? form.model} · ${reasoningLabel(form.reasoning).toLowerCase()} reasoning`;
    case "instructions": {
      if (form.instructions === undefined) {
        return "Not a single instructions.md";
      }
      const missing = missingSections(form.instructions);
      return missing.length > 0
        ? `Missing: ${missing.map((s) => s.label.toLowerCase()).join(", ")}`
        : "agent/instructions.md";
    }
    case "starters":
      return `${form.prompts.length} of ${MAX_PROMPTS}`;
    case "access": {
      const tools = [
        form.tools.bash === "on" ? "shell" : "",
        form.tools.webSearch === "on" ? "web search" : "",
      ].filter(Boolean);
      return `${servicesLabel(form.connectors, choices)} · ${tools.join(", ") || "no tools"}`;
    }
    case "approvals":
      return APPROVAL_LABELS[form.approvals].label;
    default:
      return advancedSummary(form);
  }
}

function Hint({ children }: { readonly children: ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

function ByHandNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="bg-muted/40 text-foreground/80 rounded-xl border px-3 py-2.5 text-[13px]">
      {children}
    </p>
  );
}

function ProfileSection({ form, update }: SectionProps) {
  const preset = presetFor(form.mascot);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input
            className="h-10"
            maxLength={40}
            onChange={(e) => update({ name: e.target.value })}
            required
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
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium">Look</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {CREW_PRESETS.map((look) => (
            <RadioCard
              checked={form.mascot === look.mascot}
              className={cn(
                "hover:bg-muted/50 flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors",
                form.mascot === look.mascot &&
                  "border-foreground bg-muted ring-foreground ring-1"
              )}
              key={look.mascot}
              name="look"
              onSelect={() => update({ mascot: look.mascot })}
            >
              <Mascot kind={look.mascot} mood="idle" size={40} />
              <span className="text-muted-foreground text-[11px]">
                {look.name}
              </span>
            </RadioCard>
          ))}
        </div>
      </fieldset>
      {preset ? (
        <Hint>
          Suggestions below follow the look: {preset.name},{" "}
          {preset.role.toLowerCase()}.
        </Hint>
      ) : null}
    </>
  );
}

function ModelSection({ form, loaded, models, update }: SectionProps) {
  if (form.model === undefined) {
    return (
      <ByHandNote>
        This member's <span className="font-mono text-xs">agent.ts</span> was
        edited by hand, so its model can only be changed there.
      </ByHandNote>
    );
  }
  const preset = presetFor(form.mascot);
  return (
    <>
      <ModelChoice
        legend={
          preset
            ? `Suggested for ${preset.role.toLowerCase()}`
            : "Suggested models"
        }
        models={models}
        onChange={(model) => update({ model })}
        value={form.model}
        {...(loaded.model ? { inUse: loaded.model } : {})}
        {...(preset ? { suggested: preset.model } : {})}
      />
      <ReasoningChoice
        onChange={(reasoning) => update({ reasoning })}
        value={form.reasoning}
      />
    </>
  );
}

function missingSections(instructions: string) {
  return INSTRUCTION_SECTIONS.filter(
    (section) => !instructions.includes(section.text.split("\n")[0])
  );
}

function InstructionsSection({ form, update }: SectionProps) {
  const { instructions } = form;
  if (instructions === undefined) {
    return (
      <ByHandNote>
        This member's instructions aren't a single instructions.md, so edit them
        in the repository.
      </ByHandNote>
    );
  }
  const missing = missingSections(instructions);
  return (
    <>
      <span className="text-muted-foreground -mt-2 font-mono text-xs">
        agent/instructions.md
      </span>
      <Textarea
        aria-label="Instructions"
        className="bg-muted/40 max-h-[50svh] min-h-48 font-mono text-[12.5px] leading-5"
        maxLength={50_000}
        onChange={(e) => update({ instructions: e.target.value })}
        value={instructions}
      />
      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            Missing a section:
          </span>
          {missing.map((section) => (
            <button
              className="hover:bg-muted min-h-8 rounded-full border px-3 text-xs transition-colors"
              key={section.label}
              onClick={() =>
                update({
                  instructions: `${instructions.trimEnd()}\n\n${section.text}`,
                })
              }
              type="button"
            >
              + {section.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function StartersSection({ form, loaded, update }: SectionProps) {
  const [draft, setDraft] = useState("");
  const preset = presetFor(form.mascot);
  const full = form.prompts.length >= MAX_PROMPTS;
  const present = new Set(form.prompts.map((p) => p.trim()));
  const ideas = (preset?.suggestions ?? [])
    .filter((idea) => !present.has(idea))
    .slice(0, 2);
  const original = new Set(loaded.prompts);
  const add = (text: string) => {
    const prompt = text.trim();
    if (prompt && !full && !present.has(prompt)) {
      update({ prompts: [...form.prompts, prompt] });
    }
  };
  return (
    <>
      <Hint>
        {form.prompts.length} of {MAX_PROMPTS}, shown in a new chat.
      </Hint>
      {form.prompts.map((prompt, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a prompt is its position; keying by its text would remount the input while typing.
        <div className="flex gap-1.5" key={index}>
          <Input
            aria-label={`Starter prompt ${index + 1}`}
            className={cn(
              "h-10 text-[13px]",
              !original.has(prompt) &&
                "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
            )}
            maxLength={120}
            onChange={(e) =>
              update({
                prompts: form.prompts.map((p, i) =>
                  i === index ? e.target.value : p
                ),
              })
            }
            value={prompt}
          />
          <Button
            aria-label={`Remove starter prompt ${index + 1}`}
            className="size-10 shrink-0"
            onClick={() =>
              update({ prompts: form.prompts.filter((_, i) => i !== index) })
            }
            size="icon"
            variant="outline"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      {ideas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Suggested:</span>
          {ideas.map((idea) => (
            <button
              className="hover:bg-muted min-h-8 rounded-full border px-3 text-left text-xs transition-colors disabled:opacity-50"
              disabled={full}
              key={idea}
              onClick={() => add(idea)}
              type="button"
            >
              + {idea}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(draft);
          setDraft("");
        }}
      >
        <Input
          aria-label="Another starter prompt"
          className="h-10"
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
    </>
  );
}

function AccessSection({ choices, form, loaded, update }: SectionProps) {
  const preset = presetFor(form.mascot);
  return (
    <>
      <ServicesChoice
        choices={choices}
        name={form.name.trim() || loaded.name}
        onChange={(connectors) => update({ connectors })}
        value={form.connectors}
        {...(preset ? { tip: preset.servicesTip } : {})}
      />
      <ToolsChoice
        note="Fetching a page runs outside the sandbox, so a URL could carry chat data away; asking every page lets you see each one."
        onChange={(tools) => update({ tools })}
        value={form.tools}
      />
    </>
  );
}

function AdvancedSection({ form, models, update }: SectionProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Fallback models</span>
        <Hint>
          Tried in order when the model fails on every provider. Up to three.
        </Hint>
        {form.model === undefined ? (
          <Hint>Set in agent.ts with the model.</Hint>
        ) : (
          <FallbackPicker
            model={form.model}
            models={models}
            onChange={(fallbacks) => update({ fallbacks })}
            value={form.fallbacks}
          />
        )}
      </div>
      <label className="flex w-48 flex-col gap-1.5 text-sm">
        <span className="font-medium">Order in the crew list</span>
        <Input
          className="h-10"
          inputMode="numeric"
          min={0}
          onChange={(e) => update({ order: e.target.value })}
          placeholder="After the others"
          type="number"
          value={form.order}
        />
        <Hint>Lowest first.</Hint>
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Sandbox network</span>
        <Hint>
          Domains the shell may reach on Vercel, one per line (such as
          registry.npmjs.org). Empty means no network. Each domain is a way out
          for data the crew reads.
        </Hint>
        {form.domains === undefined ? (
          <ByHandNote>
            <span className="font-mono text-xs">sandbox.ts</span> was edited by
            hand; change it there.
          </ByHandNote>
        ) : (
          <Textarea
            aria-label="Sandbox network"
            className="min-h-16 font-mono text-[13px]"
            onChange={(e) => update({ domains: e.target.value })}
            placeholder="No network"
            value={form.domains}
          />
        )}
      </div>
    </>
  );
}

function Review({
  changes,
  files,
  name,
  update,
}: {
  readonly changes: readonly Change[];
  readonly files: readonly string[];
  readonly name: string;
  readonly update: Update;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold max-sm:hidden">
          Review changes to {name}
        </h2>
        <p className="text-muted-foreground text-sm">
          This opens a pull request. Nothing changes until it's merged and
          deployed.
        </p>
      </div>
      {changes.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-3.5 py-3 text-sm">
          Everything is back as it was.
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border">
          {changes.map((change) => (
            <li
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3.5 py-2.5 last:border-b-0"
              key={`${change.label}-${change.after}`}
            >
              <span className="text-muted-foreground w-36 text-[13px]">
                {change.label}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {change.before === undefined ? null : (
                  <>
                    <span className="text-muted-foreground line-through decoration-neutral-400">
                      {change.before}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      →
                    </span>
                    <span className="sr-only">to</span>
                  </>
                )}
                <span className="font-medium">{change.after}</span>
              </span>
              <button
                aria-label={`Undo ${change.label.toLowerCase()}`}
                className="text-muted-foreground hover:text-foreground min-h-9 text-[13px] underline underline-offset-2"
                onClick={() => update(change.undo)}
                type="button"
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Files in the pull request
          </span>
          <div className="flex flex-wrap gap-1.5">
            {files.map((file) => (
              <span
                className="bg-muted text-foreground/80 rounded-md px-2 py-1 font-mono text-xs"
                key={file}
              >
                {file}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
