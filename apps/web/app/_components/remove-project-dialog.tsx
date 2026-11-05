"use client";

import { ExternalLinkIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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
import type { RemovalPlan, RemovalStep } from "@/lib/project-removal";
import {
  type ManualStep,
  previewRemoval,
  removeProject,
} from "./remove-project-actions";

const TOKENS = "https://vercel.com/account/settings/tokens";
const GUIDE =
  "https://github.com/frankievalentine/lopsi-bot-eve/blob/main/docs/removing.md";

const KINDS = { "blob-store": "Chat history store", connector: "Connector" };

type Stage =
  | { readonly kind: "token" }
  | {
      readonly kind: "review";
      readonly manual: readonly ManualStep[];
      readonly plan: RemovalPlan;
    }
  | {
      readonly kind: "done";
      readonly manual: readonly ManualStep[];
      readonly steps: readonly RemovalStep[];
    };

function Heading({ children }: { readonly children: string }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
}

function ManualList({ steps }: { readonly steps: readonly ManualStep[] }) {
  return steps.length === 0 ? null : (
    <section className="space-y-1.5">
      <Heading>Left for You</Heading>
      <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
        {steps.map((step) => (
          <li key={step.label}>
            {step.href ? (
              <a
                className="text-foreground inline-flex items-baseline gap-1 underline-offset-4 hover:underline"
                href={step.href}
                rel="noreferrer"
                target="_blank"
              >
                {step.label}
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 self-center"
                />
              </a>
            ) : (
              step.label
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ErrorLine({ error }: { readonly error: string | null }) {
  return error === null ? null : (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  );
}

function TokenStep({
  onPlan,
}: {
  readonly onPlan: (
    token: string,
    stage: Extract<Stage, { kind: "review" }>
  ) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await previewRemoval(token.trim());
      if (result.ok) {
        onPlan(token.trim(), {
          kind: "review",
          manual: result.manual,
          plan: result.plan,
        });
      } else {
        setError(result.error);
      }
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Vercel Token</span>
        <Input
          autoComplete="off"
          name="vercel-token"
          onChange={(event) => setToken(event.target.value)}
          spellCheck={false}
          type="password"
          value={token}
        />
        <span className="text-muted-foreground block text-xs">
          Used only for this removal, and never stored. Nothing is removed until
          you've reviewed it.{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={TOKENS}
            rel="noreferrer"
            target="_blank"
          >
            Create a token
          </a>{" "}
          for this project's team, and delete it afterward. A token for only
          this project removes the project, but leaves its stores and
          connectors.
        </span>
      </label>
      <ErrorLine error={error} />
      <DialogFooter className="items-center sm:justify-between">
        <a
          className="text-muted-foreground text-xs underline-offset-4 hover:underline"
          href={`${GUIDE}#pause-it`}
          rel="noreferrer"
          target="_blank"
        >
          Only want to stop it for now? Pause it instead.
        </a>
        <Button disabled={busy || token.trim() === ""} type="submit">
          {busy ? "Checking…" : "Review What's Removed"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReviewStep({
  onDone,
  stage,
  token,
}: {
  readonly onDone: (stage: Extract<Stage, { kind: "done" }>) => void;
  readonly stage: Extract<Stage, { kind: "review" }>;
  readonly token: string;
}) {
  const { manual, plan } = stage;
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await removeProject({
        confirmation,
        itemIds: plan.removable
          .filter((item) => !unchecked.has(item.id))
          .map((item) => item.id),
        token,
      });
      if (result.ok) {
        onDone({ kind: "done", manual, steps: result.steps });
      } else {
        setError(result.error);
      }
    } catch {
      setError("That didn't go through. Check Vercel before trying again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <section className="space-y-1.5">
        <Heading>Removed</Heading>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <input
              checked
              className="accent-primary size-4"
              disabled
              readOnly
              type="checkbox"
            />
            <span className="min-w-0 truncate">{plan.projectName}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              Project and its deployments
            </span>
          </li>
          {plan.removable.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-2">
                <input
                  checked={!unchecked.has(item.id)}
                  className="accent-primary size-4"
                  onChange={(event) => {
                    const next = new Set(unchecked);
                    if (event.target.checked) {
                      next.delete(item.id);
                    } else {
                      next.add(item.id);
                    }
                    setUnchecked(next);
                  }}
                  type="checkbox"
                />
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {KINDS[item.kind]}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      {plan.limited ? (
        <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2.5 text-xs">
          This token can only reach the project, so any stores and connectors
          stay. To remove those too, go back and use a token for the team.
        </p>
      ) : null}
      {plan.kept.length > 0 ? (
        <section className="space-y-1.5">
          <Heading>Kept: Other Projects Use These</Heading>
          <p className="text-muted-foreground text-xs">
            {plan.kept.join(", ")}
          </p>
        </section>
      ) : null}
      <ManualList steps={manual} />
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">
          Type <code className="font-mono">{plan.projectName}</code> to Confirm
        </span>
        <Input
          autoComplete="off"
          name="confirm-project-name"
          onChange={(event) => setConfirmation(event.target.value)}
          spellCheck={false}
          value={confirmation}
        />
        <span className="text-muted-foreground block text-xs">
          This can't be undone. This site stops working, and its chats are gone
          if their store is removed.
        </span>
      </label>
      <ErrorLine error={error} />
      <DialogFooter>
        <Button
          disabled={busy || confirmation !== plan.projectName}
          type="submit"
          variant="destructive"
        >
          {busy ? "Removing…" : "Remove Project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DoneStep({
  stage,
}: {
  readonly stage: Extract<Stage, { kind: "done" }>;
}) {
  const failed = stage.steps.find((step) => !step.ok);
  return (
    <div className="space-y-4" role="status">
      <section className="space-y-1.5">
        <Heading>
          {failed ? "Stopped Before Finishing" : "Project Removed"}
        </Heading>
        <ul className="space-y-1 text-sm">
          {stage.steps.map((step) => (
            <li key={step.name}>
              {step.ok ? "Removed" : "Failed"}: {step.name}
              {step.error ? (
                <span className="text-destructive block text-xs">
                  {step.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {failed ? (
          <p className="text-muted-foreground text-xs">
            The project is removed last, so it's still running unless it's the
            one that failed. Close this and try again.
          </p>
        ) : null}
      </section>
      {failed ? null : <ManualList steps={stage.manual} />}
    </div>
  );
}

/**
 * Removes this project and what setup made for it, after a token, a review and
 * typing its name. The token stays in this dialog, and is gone when it closes.
 */
export function RemoveProjectDialog({
  onOpenChange,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "token" });
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!open) {
      setStage({ kind: "token" });
      setToken("");
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85svh] overflow-y-auto overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove This Project</DialogTitle>
          <DialogDescription>
            Removes it from Vercel, with what setup made for it. Anything
            another project uses stays.
          </DialogDescription>
        </DialogHeader>
        {stage.kind === "token" ? (
          <TokenStep
            onPlan={(value, next) => {
              setToken(value);
              setStage(next);
            }}
          />
        ) : null}
        {stage.kind === "review" ? (
          <ReviewStep onDone={setStage} stage={stage} token={token} />
        ) : null}
        {stage.kind === "done" ? <DoneStep stage={stage} /> : null}
      </DialogContent>
    </Dialog>
  );
}
