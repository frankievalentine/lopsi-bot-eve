"use client";

import type { CallState, SessionView } from "eve/events";
import { callState, signInEnding } from "eve/events";
import type {
  EveInteractionPart,
  EveMessage,
  EveMessagePart,
  EveToolPart,
  Interaction,
} from "eve/react";
import {
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * One eve message drawn with Lopsi's components. The part handling follows eve's
 * generated Web Chat (agent-message.tsx): runs of tool calls fold into one list, a
 * call that asks a question shows as that question, and an approval waits below
 * its list so it stays in view.
 */

interface AgentAnswer {
  readonly interactionId: string;
  readonly optionId?: string;
  readonly text?: string;
}

/** How a message answers what the agent asks. */
export interface Asks {
  readonly canRespond: (interactionId: string) => boolean;
  readonly onAnswers: (answers: readonly AgentAnswer[]) => Promise<void>;
  /** Every question a call asked; its part holds only the latest. */
  readonly questionsFor: (callId: string) => readonly Interaction[];
}

type ToolRun = EveToolPart[];

export function EveMessageView({
  asks,
  message,
  onRetry,
  view,
}: {
  readonly asks: Asks;
  readonly message: EveMessage;
  /** Sends the message this reply answered again; only for the latest reply. */
  readonly onRetry?: () => void;
  readonly view: SessionView;
}) {
  const text = textOf(message);
  return (
    <Message from={message.role}>
      <MessageContent>
        {blocksOf(message.parts, asks).map((block, index) =>
          Array.isArray(block) ? (
            <ToolRunView
              asks={asks}
              key={block[0]?.callId ?? index}
              run={block}
              view={view}
            />
          ) : (
            <PartView asks={asks} key={partKey(block, index)} part={block} />
          )
        )}
      </MessageContent>
      {message.role === "assistant" && text ? (
        <MessageActions className="-ml-1.5">
          <CopyAction text={text} />
          {onRetry ? (
            <MessageAction onClick={onRetry} tooltip="Retry">
              <RefreshCwIcon className="size-4" />
            </MessageAction>
          ) : null}
        </MessageActions>
      ) : null}
    </Message>
  );
}

/** A message's text, without its tool calls or other parts. */
export function textOf(message: EveMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();
}

function CopyAction({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <MessageAction onClick={copy} tooltip={copied ? "Copied" : "Copy"}>
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </MessageAction>
  );
}

/**
 * A message's parts, with each run of tool calls gathered into one list. A call that
 * asks a question shows as that question instead, and the model waiting on or
 * cancelling its own tasks isn't activity to show.
 */
function blocksOf(
  parts: readonly EveMessagePart[],
  asks: Asks
): (EveMessagePart | ToolRun)[] {
  const blocks: (EveMessagePart | ToolRun)[] = [];
  for (const part of parts) {
    if (part.type === "tool" && part.kind === "control") {
      continue;
    }
    const isRunStep =
      part.type === "tool" && asks.questionsFor(part.callId).length === 0;
    const last = blocks.at(-1);
    if (!isRunStep) {
      blocks.push(part);
    } else if (Array.isArray(last)) {
      last.push(part as EveToolPart);
    } else {
      blocks.push([part as EveToolPart]);
    }
  }
  return blocks;
}

function PartView({
  asks,
  part,
}: {
  readonly asks: Asks;
  readonly part: EveMessagePart;
}) {
  switch (part.type) {
    case "text":
      return (
        <MessageResponse isAnimating={part.state === "streaming"}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return part.text.length === 0 ? null : (
        <Reasoning defaultOpen={false} isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "file":
      return <AttachmentView part={part} />;
    case "interaction":
      return <InteractionView asks={asks} part={part} />;
    case "tool":
      return (
        <div className="flex flex-col gap-3">
          {asks.questionsFor(part.callId).map((question) => {
            // The call's part shows an answer this client sent at once; the view, once eve has it.
            const { answer, ...request } =
              part.interaction?.interactionId === question.interactionId
                ? part.interaction
                : question;
            return (
              <AskCard
                answer={answer}
                canRespond={asks.canRespond(request.interactionId)}
                interaction={request}
                key={request.interactionId}
                onAnswers={asks.onAnswers}
              />
            );
          })}
        </div>
      );
    default:
      return null;
  }
}

/** How a call reads in the list in each state. */
const CALL_NOTES: Record<CallState, string | undefined> = {
  approval: "needs approval",
  blocked: "waiting for you",
  cancelled: "stopped",
  completed: undefined,
  failed: "failed",
  rejected: "denied",
  requested: undefined,
  running: undefined,
};

function runTitle({
  failed,
  label,
  steps,
  waiting,
  working,
}: {
  readonly failed: number;
  readonly label: string | undefined;
  readonly steps: number;
  readonly waiting: boolean;
  readonly working: boolean;
}): string {
  if (working) {
    return `Working: ${label ?? "a tool"}`;
  }
  if (waiting) {
    return "Waiting for you";
  }
  const failures = failed > 0 ? `, ${failed} failed` : "";
  return `Used ${plural(steps, "tool")}${failures}`;
}

function iconFor(step: EveToolPart) {
  if (step.name === "bash") {
    return TerminalIcon;
  }
  return step.kind === "agent" ? BotIcon : WrenchIcon;
}

/** A danger option reads as destructive; otherwise the first option is the main action. */
function optionVariant(style: string | undefined, index: number) {
  if (style === "danger") {
    return "destructive";
  }
  return index === 0 ? "default" : "outline";
}

function connectHeading(name: string, part: EveInteractionPart): string {
  if (part.status !== "settled") {
    return `Connect ${name}`;
  }
  return part.outcome === "accepted"
    ? `${name} connected`
    : `${name} authorization ${signInEnding(part.outcome ?? "withdrawn")}`;
}

function connectIcon(settled: boolean, connected: boolean) {
  if (connected) {
    return CheckCircleIcon;
  }
  return settled ? XCircleIcon : KeyRoundIcon;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** A run of tool calls, as Lopsi's "Used N tools" list; open while it works or waits. */
function ToolRunView({
  asks,
  run,
  view,
}: {
  readonly asks: Asks;
  readonly run: ToolRun;
  readonly view: SessionView;
}) {
  const states = run.map((step) => callState(view, step.callId));
  const working = states.some(
    (state) =>
      state === undefined || state === "running" || state === "requested"
  );
  const waiting = states.some(
    (state) => state === "approval" || state === "blocked"
  );
  const failed = states.filter((state) => state === "failed").length;
  const approvals = run.flatMap((step) =>
    step.interaction?.request.kind === "approval" &&
    step.interaction.status !== "settled"
      ? [step.interaction]
      : []
  );
  const title = runTitle({
    failed,
    label: run.at(-1)?.label,
    steps: run.length,
    waiting,
    working,
  });

  return (
    <>
      <Task
        defaultOpen={working || waiting}
        key={working || waiting ? "open" : "closed"}
      >
        <TaskTrigger title={title} />
        <TaskContent>
          {run.map((step, index) => {
            const Icon = iconFor(step);
            const state = states[index];
            const note = state === undefined ? undefined : CALL_NOTES[state];
            return (
              <TaskItem
                className={cn(
                  "flex items-center gap-1.5",
                  state === "failed" && "text-destructive"
                )}
                key={step.callId}
              >
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{step.label}</span>
                {note ? (
                  <span className="shrink-0 text-xs">· {note}</span>
                ) : null}
              </TaskItem>
            );
          })}
        </TaskContent>
      </Task>
      {approvals.map((interaction) => (
        <ChoiceCard
          answer={interaction.answer}
          canRespond={asks.canRespond(interaction.interactionId)}
          interaction={interaction}
          key={interaction.interactionId}
          onAnswers={asks.onAnswers}
        />
      ))}
    </>
  );
}

/** An interaction no call carries: a connection sign-in, or a question or choice of its own. */
function InteractionView({
  asks,
  part,
}: {
  readonly asks: Asks;
  readonly part: EveInteractionPart;
}) {
  if (part.request.signIn !== undefined) {
    return <ConnectCard part={part} />;
  }
  if (part.request.kind === "question") {
    return (
      <AskCard
        answer={part.answer}
        canRespond={asks.canRespond(part.interactionId)}
        interaction={part}
        onAnswers={asks.onAnswers}
      />
    );
  }
  return (
    <ChoiceCard
      answer={part.answer}
      canRespond={asks.canRespond(part.interactionId)}
      interaction={part}
      onAnswers={asks.onAnswers}
    />
  );
}

interface CardProps {
  readonly answer?: AgentAnswer;
  readonly canRespond: boolean;
  readonly interaction: Interaction;
  readonly onAnswers: Asks["onAnswers"];
}

/** Lopsi's ask card frame: an icon, the prompt, then what to do. */
function CardFrame({
  children,
  prompt,
}: {
  readonly children: React.ReactNode;
  readonly prompt: string;
}) {
  return (
    <fieldset
      aria-label={prompt}
      className="m-0 flex min-w-0 flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex items-start gap-2">
        <ShieldAlertIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <MessageResponse className="text-sm font-medium">
          {prompt}
        </MessageResponse>
      </div>
      {children}
    </fieldset>
  );
}

function useSend(onAnswers: Asks["onAnswers"]) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (answer: AgentAnswer) => {
    setSending(true);
    setError(null);
    try {
      await onAnswers([answer]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That answer did not go through."
      );
    } finally {
      setSending(false);
    }
  };
  return { error, send, sending };
}

function AnswerError({ error }: { readonly error: string | null }) {
  return error === null ? null : (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  );
}

function Answered({
  answer,
  interaction,
}: {
  readonly answer: AgentAnswer;
  readonly interaction: Interaction;
}) {
  const option = interaction.request.options?.find(
    ({ id }) => id === answer.optionId
  );
  return (
    <p className="text-muted-foreground text-sm">
      Answered: {option?.label ?? answer.text ?? answer.optionId}
    </p>
  );
}

/** An approval or other choice: one button per option, the first as the main action. */
function ChoiceCard({ answer, canRespond, interaction, onAnswers }: CardProps) {
  const { error, send, sending } = useSend(onAnswers);
  const options = interaction.request.options ?? [];

  return (
    <CardFrame prompt={interaction.request.prompt}>
      {answer ? (
        <Answered answer={answer} interaction={interaction} />
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {options.map((option, index) => (
            <Button
              disabled={!canRespond || sending}
              key={option.id}
              onClick={() =>
                send({
                  interactionId: interaction.interactionId,
                  optionId: option.id,
                })
              }
              size="sm"
              variant={optionVariant(option.style, index)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      <AnswerError error={error} />
    </CardFrame>
  );
}

/** A question: its options as buttons, and typed text when it takes free answers. */
function AskCard({ answer, canRespond, interaction, onAnswers }: CardProps) {
  const { error, send, sending } = useSend(onAnswers);
  const [text, setText] = useState("");
  const options = interaction.request.options ?? [];
  const takesText =
    interaction.request.allowFreeform === true || options.length === 0;
  const disabled = !canRespond || sending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (text.trim()) {
      send({
        interactionId: interaction.interactionId,
        text: text.trim(),
      }).catch(() => undefined);
    }
  };

  return (
    <CardFrame prompt={interaction.request.prompt}>
      {answer ? (
        <Answered answer={answer} interaction={interaction} />
      ) : (
        <>
          {options.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              {options.map((option, index) => (
                <Button
                  disabled={disabled}
                  key={option.id}
                  onClick={() =>
                    send({
                      interactionId: interaction.interactionId,
                      optionId: option.id,
                    })
                  }
                  size="sm"
                  title={option.description}
                  variant={index === 0 && !takesText ? "default" : "outline"}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          {takesText ? (
            <form className="flex gap-2" onSubmit={submit}>
              <Input
                aria-label="Your answer"
                autoComplete="off"
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                placeholder="Your answer"
                value={text}
              />
              <Button
                disabled={disabled || !text.trim()}
                size="sm"
                type="submit"
              >
                Send
              </Button>
            </form>
          ) : null}
        </>
      )}
      <AnswerError error={error} />
    </CardFrame>
  );
}

/** A connection asking the person to sign in to its service (Vercel Connect consent). */
function ConnectCard({ part }: { readonly part: EveInteractionPart }) {
  const { signIn } = part.request;
  const name = signIn?.displayName ?? signIn?.name ?? "the service";
  const settled = part.status === "settled";
  const connected = part.outcome === "accepted";
  const Icon = connectIcon(settled, connected);
  const heading = connectHeading(name, part);

  return (
    <section
      aria-label={heading}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        settled && !connected && "border-destructive/30"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          settled && !connected ? "text-destructive" : "text-muted-foreground"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-medium">{heading}</p>
        {settled ? null : (
          <>
            <p className="text-muted-foreground text-sm">
              {signIn?.instructions ?? part.request.prompt}
            </p>
            {signIn?.userCode ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Code</span>
                <code className="bg-muted/50 rounded-md border px-2 py-0.5 font-mono">
                  {signIn.userCode}
                </code>
              </p>
            ) : null}
            {signIn?.url ? (
              <div>
                <Button
                  render={
                    <a href={signIn.url} rel="noreferrer" target="_blank" />
                  }
                  size="sm"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Sign in to {name}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function AttachmentView({
  part,
}: {
  readonly part: Extract<EveMessagePart, { type: "file" }>;
}) {
  const label = part.filename ?? "Attachment";
  const body = (
    <span className="bg-muted/40 flex max-w-sm items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
      <FileIcon className="text-muted-foreground size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {part.url ? (
        <ExternalLinkIcon className="text-muted-foreground size-3.5 shrink-0" />
      ) : null}
    </span>
  );
  return part.url ? (
    <a href={part.url} rel="noreferrer" target="_blank">
      {body}
    </a>
  ) : (
    body
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "interaction":
      return `interaction:${part.interactionId}`;
    case "tool":
      return part.callId;
    case "reasoning":
    case "text":
      return `${part.type}:${part.id ?? index}`;
    default:
      return `${part.type}:${index}`;
  }
}
