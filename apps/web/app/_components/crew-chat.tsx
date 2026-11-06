"use client";

import {
  ClientError,
  type ClientSessionState,
  type SessionStreamEvent,
} from "eve/client";
import type { Activity, SessionView } from "eve/events";
import {
  activeTurn,
  activity,
  failure,
  interaction,
  interactions,
  turns,
} from "eve/events";
import type { EveMessage } from "eve/react";
import { useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  HistoryIcon,
  LockIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SquarePenIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Mascot, type MascotMood } from "@/components/mascot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type MemberHistory,
  recordChat,
  recordReply,
  setCurrentChat,
} from "@/lib/chat-history";
import type { Transcript } from "@/lib/chat-store";
import type { CrewMember } from "@/lib/crew";
import { isDemo } from "@/lib/demo";
import { useDemoAgent } from "@/lib/use-demo-agent";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/when";
import type { Account } from "./account";
import { ComputerButton, ComputerSurface, useComputer } from "./computer-panel";
import { EveMessageView, textOf } from "./eve-message";
import { useSignInRedirect } from "./use-sign-in-redirect";
import { useTranscriptSaving } from "./use-transcript-saving";

const useAgent = isDemo ? useDemoAgent : useEveAgent;

/** Ported from lopsi-bot's chat-view.tsx, on eve's `useEveAgent`. */

export interface CrewChatProps {
  readonly account: Account;
  readonly history: MemberHistory | undefined;
  readonly member: CrewMember;
  /** Phones: back to the crew list. */
  readonly onBack?: () => void;
  /** Opens the crew member's settings; absent where changes aren't possible. */
  readonly onEdit?: () => void;
  readonly onMood: (mood: MascotMood) => void;
  readonly owner: string;
  /** Production mode: save the transcript to the server as it grows. */
  readonly persist?: boolean;
  /** The chat's saved transcript, shown before eve catches up. */
  readonly saved?: Transcript | undefined;
  /** The chat to resume, from the URL; absent for a new chat. */
  readonly sessionId?: string;
}

/** A chat eve can't continue: ended, or its run data deleted. */
const ENDED_CODES = new Set(["session_not_active", "session_expired"]);

/** Where the chat starts: its saved transcript, or the URL's session replayed from the start. */
function restoreFrom(
  saved: Transcript | undefined,
  sessionId: string | undefined
): {
  initialEvents: SessionStreamEvent[];
  initialSession: ClientSessionState | undefined;
} {
  if (saved !== undefined) {
    return {
      initialEvents: saved.events as SessionStreamEvent[],
      initialSession: saved.session as ClientSessionState,
    };
  }
  return {
    initialEvents: [],
    initialSession:
      sessionId === undefined ? undefined : { sessionId, streamIndex: 0 },
  };
}

/** Whether eve can't continue the chat, and the error to show otherwise. */
function noticesFor(
  error: Error | undefined,
  actionError: string | undefined,
  failed: string | undefined
): { errorMessage: string | undefined; sessionEnded: boolean } {
  const sessionEnded =
    error instanceof ClientError && ENDED_CODES.has(error.code);
  return {
    errorMessage:
      actionError ?? (sessionEnded ? undefined : error?.message) ?? failed,
    sessionEnded,
  };
}

export function CrewChat({
  account,
  history,
  member,
  onBack,
  onEdit,
  onMood,
  owner,
  persist = false,
  saved,
  sessionId,
}: CrewChatProps) {
  const [actionError, setActionError] = useState<string>();
  const [hasInputText, setHasInputText] = useState(false);
  const firstMessage = useRef<string | undefined>(undefined);
  // The session this chat is recorded under: the URL's, or a new one once the
  // first message goes out.
  const adopted = useRef<string | undefined>(sessionId);
  const chatPath = (id: string) =>
    `/c/${encodeURIComponent(member.id)}/s/${encodeURIComponent(id)}`;

  /**
   * Records a new chat and puts its id in the URL, once: from the session eve
   * prewarmed while you typed, or the one it creates when the message is sent.
   */
  const adopt = (id: string) => {
    if (adopted.current !== undefined || firstMessage.current === undefined) {
      return;
    }
    adopted.current = id;
    recordChat(owner, member.id, id, firstMessage.current);
    // Navigating through the router would remount this chat and detach its stream.
    History.prototype.replaceState.call(
      window.history,
      window.history.state,
      "",
      chatPath(id)
    );
  };

  const agent = useAgent({
    agent: member.id,
    ...restoreFrom(saved, sessionId),
    onSessionChange(session) {
      if (session !== undefined) {
        adopt(session.sessionId);
      }
    },
    prewarm: hasInputText,
    resume: sessionId !== undefined,
  });
  useSignInRedirect(agent.error);
  const computer = useComputer(agent.view, {
    sessionId: sessionId ?? agent.session?.sessionId,
    snapshots: persist,
  });
  useTranscriptSaving({
    busy: agent.status === "busy",
    enabled: persist,
    events: agent.events,
    loaded: saved?.events.length ?? 0,
    session: agent.session,
  });

  const activeSessionId = sessionId ?? agent.session?.sessionId;
  const isBusy = agent.status === "busy";
  const isResuming = agent.status === "resuming";
  // A turn waiting on a person is open while the store is idle; it still takes steering and Stop.
  const turnOpen = activeTurn(agent.view) !== undefined;
  const { lastMessage, now, showPendingActivity, waitingOnYou } = activityOf(
    agent.view,
    agent.messages,
    isBusy
  );
  const failed =
    isBusy || isResuming
      ? undefined
      : failure(agent.view, turns(agent.view).at(-1)?.turnId);
  const { errorMessage, sessionEnded } = noticesFor(
    agent.error ?? undefined,
    actionError,
    failureMessage(failed)
  );

  const { finished, setFinished } = useReplyTracking({
    activeSessionId,
    isBusy,
    isResuming,
    memberId: member.id,
    messages: agent.messages,
    owner,
  });
  const mood = moodOf({
    failed: failed !== undefined,
    finished,
    isBusy,
    waitingOnYou,
  });
  useEffect(() => onMood(mood), [mood, onMood]);

  // Resuming a chat makes it the one this member opens next time.
  useEffect(() => {
    if (sessionId !== undefined) {
      setCurrentChat(owner, member.id, sessionId);
    }
  }, [owner, member.id, sessionId]);

  const asks = {
    canRespond: (interactionId: string) =>
      !(isResuming || sessionEnded) &&
      interaction(agent.view, interactionId)?.status === "open",
    onAnswers: async (answers: Parameters<typeof agent.respond>[0]) => {
      setActionError(undefined);
      await agent.respond(answers);
    },
    // A tool call can ask several questions at once, and its message part holds only the latest.
    questionsFor: (callId: string) =>
      interactions(agent.view).filter(
        (input) =>
          input.request.kind === "question" && input.call?.callId === callId
      ),
  };

  const send = async (text: string) => {
    if (isResuming) {
      return;
    }
    setActionError(undefined);
    setFinished(false);
    if (adopted.current === undefined) {
      firstMessage.current = text;
      // A session prewarmed while you typed won't announce itself again.
      if (agent.session !== undefined) {
        adopt(agent.session.sessionId);
      }
    }
    await agent.send(text, turnOpen ? { turnPolicy: "steer" } : undefined);
  };

  const { lastReplyId, retry } = retryFor(agent.messages, {
    canSend: !(isBusy || isResuming || sessionEnded),
    send,
  });

  const stop = () => {
    setActionError(undefined);
    agent.cancel().catch((error: unknown) => {
      setActionError(
        error instanceof Error ? error.message : "Could not stop the reply."
      );
    });
  };

  const startNewChat = () => {
    setCurrentChat(owner, member.id, undefined);
    window.location.assign(`/c/${encodeURIComponent(member.id)}`);
  };

  return (
    <main className="flex h-svh min-w-0 flex-[999_1_560px] flex-col" id="main">
      <header
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b pr-4",
          onBack ? "pl-2" : "pl-5"
        )}
      >
        {onBack ? (
          <Button
            aria-label="Back to Crew"
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
        ) : null}
        <Mascot kind={member.mascot} mood={mood} size={28} />
        <h1 className="text-[15px] font-semibold">{member.name}</h1>
        <span className="text-muted-foreground flex-1 truncate text-[13px]">
          {member.role}
        </span>
        <AccessBadge account={account} />
        <ComputerButton
          activity={computer.activity}
          onToggle={computer.toggle}
          open={computer.open}
        />
        <ChatHistoryMenu
          chatPath={chatPath}
          currentId={activeSessionId}
          history={history}
          memberName={member.name}
        />
        {onEdit ? <MemberMenu name={member.name} onEdit={onEdit} /> : null}
        <Button
          aria-label="New Chat"
          disabled={activeSessionId === undefined}
          onClick={startNewChat}
          size="icon-sm"
          title="New Chat"
          variant="ghost"
        >
          <SquarePenIcon className="size-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Conversation className="min-h-0">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-8 px-5 py-8">
              {agent.messages.length === 0 &&
              !isResuming &&
              errorMessage === undefined ? (
                <ConversationEmptyState className="pt-24 [@media(max-height:500px)]:pt-4 [@media(max-height:500px)]:[&_[role=img]]:hidden">
                  <Mascot kind={member.mascot} mood={mood} size={96} />
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">
                      {member.name} Is Ready
                    </h2>
                    <p className="text-muted-foreground max-w-md text-sm">
                      Send a message to get started.
                    </p>
                  </div>
                </ConversationEmptyState>
              ) : (
                agent.messages.map((message) =>
                  showPendingActivity && message === lastMessage ? null : (
                    <EveMessageView
                      asks={asks}
                      key={message.id}
                      message={message}
                      view={agent.view}
                      {...(retry && message.id === lastReplyId
                        ? { onRetry: retry }
                        : {})}
                    />
                  )
                )
              )}
              {isResuming && agent.messages.length === 0 ? (
                <Shimmer>Loading the chat…</Shimmer>
              ) : null}
              {showPendingActivity ? (
                <Shimmer>{activityLabel(now)}</Shimmer>
              ) : null}
              {errorMessage === undefined ? null : (
                <ErrorNotice message={errorMessage} onRetry={retry} />
              )}
              {sessionEnded ? <EndedNotice onNewChat={startNewChat} /> : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <Composer
            account={account}
            busy={isBusy}
            disabled={isResuming || sessionEnded}
            member={member}
            onInput={setHasInputText}
            onSend={send}
            onStop={turnOpen ? stop : undefined}
            showSuggestions={agent.messages.length === 0}
          />
        </div>
        <ComputerSurface
          activity={computer.activity}
          onClose={computer.close}
          open={computer.open}
        />
      </div>
    </main>
  );
}

/**
 * What the agent is doing: its activity, whether it waits on you, and whether
 * to show that activity in place of a reply that has nothing to show yet.
 */
function activityOf(
  view: SessionView,
  messages: readonly EveMessage[],
  isBusy: boolean
) {
  const now = activity(view);
  const waitingOnYou =
    now.kind === "waiting-on-interaction" ||
    interactions(view).some((input) => input.status === "open");
  const lastMessage = messages.at(-1);
  const showPendingActivity =
    isBusy &&
    now.kind !== "waiting-on-interaction" &&
    (lastMessage?.role !== "assistant" || lastMessage.parts.length === 0);
  return { lastMessage, now, showPendingActivity, waitingOnYou };
}

/** What to say about the last turn's failure, if it failed. */
function failureMessage(
  failed: ReturnType<typeof failure>
): string | undefined {
  return failed?.code === "MODEL_CALL_FAILED"
    ? "The model is temporarily unavailable. Please try again."
    : failed?.message;
}

/**
 * Retry sends the last thing you said again (eve has no "regenerate"), offered on
 * the latest reply and on an error, while nothing else is running.
 */
function retryFor(
  messages: readonly EveMessage[],
  {
    canSend,
    send,
  }: {
    readonly canSend: boolean;
    readonly send: (text: string) => Promise<void>;
  }
) {
  const lastAsked = messages.findLast((message) => message.role === "user");
  const text = lastAsked === undefined ? "" : textOf(lastAsked);
  const lastReplyId = messages.findLast(
    (message) => message.role === "assistant"
  )?.id;
  const retry =
    text && canSend
      ? () => {
          send(text).catch(() => undefined);
        }
      : undefined;
  return { lastReplyId, retry };
}

/** The mascot: needs you, working, just finished, or idle. */
function moodOf({
  failed,
  finished,
  isBusy,
  waitingOnYou,
}: {
  /** The last turn failed: nothing to celebrate. */
  readonly failed: boolean;
  readonly finished: boolean;
  readonly isBusy: boolean;
  readonly waitingOnYou: boolean;
}): MascotMood {
  if (waitingOnYou) {
    return "needs";
  }
  if (isBusy) {
    return "thinking";
  }
  return finished && !failed ? "done" : "idle";
}

/**
 * Notices each reply finishing: records it as the crew list's preview and marks
 * the chat done until the next message.
 */
function useReplyTracking({
  activeSessionId,
  isBusy,
  isResuming,
  memberId,
  messages,
  owner,
}: {
  readonly activeSessionId: string | undefined;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly memberId: string;
  readonly messages: readonly EveMessage[];
  readonly owner: string;
}) {
  const [finished, setFinished] = useState(false);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (
      wasBusy.current &&
      !isBusy &&
      !isResuming &&
      activeSessionId !== undefined
    ) {
      setFinished(true);
      const reply = lastText(messages);
      if (reply !== undefined) {
        recordReply(owner, memberId, activeSessionId, reply);
      }
    }
    wasBusy.current = isBusy;
  }, [isBusy, isResuming, activeSessionId, messages, owner, memberId]);
  return { finished, setFinished };
}

/** The latest text the agent wrote, for the crew list's preview. */
function lastText(messages: readonly EveMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }
    const text = textOf(message);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function activityLabel(now: Activity): string {
  switch (now.kind) {
    case "calling":
      return `Working: ${now.names.join(", ")}`;
    case "waiting-on-tasks":
      return `Waiting on ${now.tasks.map((task) => task.name).join(", ")}`;
    case "compacting":
      return "Tidying up the conversation…";
    default:
      return "Thinking…";
  }
}

/** Who can reach this crew, in place of Lopsi's "Tailnet only". */
const ACCESS_BADGES: Record<Account["kind"], string> = {
  demo: "Demo",
  open: "Local",
  password: "Password",
  vercel: "Your team",
};

/** Who else can open these chats, under the composer. */
const ACCESS_NOTES: Record<Account["kind"], string> = {
  demo: "Scripted demo: replies are prewritten and no model runs.",
  open: "Local development: no sign-in.",
  password: "Everyone with the password shares these chats.",
  vercel: "Anyone on your team with this chat's link can open it.",
};

function AccessBadge({ account }: { readonly account: Account }) {
  const label = ACCESS_BADGES[account.kind];
  const Icon = account.kind === "vercel" ? UsersIcon : LockIcon;
  return (
    <Badge className="gap-1.5 rounded-full font-normal" variant="secondary">
      <Icon className="size-3" />
      <span>{label}</span>
    </Badge>
  );
}

/** The chat header's menu: settings for the crew member. */
function MemberMenu({
  name,
  onEdit,
}: {
  readonly name: string;
  readonly onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={`${name}: menu`} size="icon-sm" variant="ghost" />
        }
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Edit {name}…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatHistoryMenu({
  chatPath,
  currentId,
  history,
  memberName,
}: {
  readonly chatPath: (sessionId: string) => string;
  readonly currentId: string | undefined;
  readonly history: MemberHistory | undefined;
  readonly memberName: string;
}) {
  const chats = history?.chats ?? [];
  if (chats.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Chats with ${memberName}`}
            size="icon-sm"
            title="Chats"
            variant="ghost"
          />
        }
      >
        <HistoryIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          Chats in This Browser
        </p>
        <DropdownMenuSeparator />
        {chats.map((chat) => (
          <DropdownMenuItem
            className={cn(
              "flex items-baseline gap-2",
              chat.sessionId === currentId && "font-medium"
            )}
            key={chat.sessionId}
            render={<Link href={chatPath(chat.sessionId)} />}
          >
            <span className="flex-1 truncate">{chat.title}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatWhen(chat.updatedAt)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A chat eve can't continue: its messages stay readable, and a new chat picks up. */
function EndedNotice({ onNewChat }: { readonly onNewChat: () => void }) {
  return (
    <div className="bg-muted/40 text-muted-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <span>This chat has ended. Start a new one to keep going.</span>
      <Button onClick={onNewChat} size="sm" variant="outline">
        New Chat
      </Button>
    </div>
  );
}

function ErrorNotice({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: (() => void) | undefined;
}) {
  return (
    <div
      className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm"
      role="alert"
    >
      <AlertCircleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">Something Went Wrong</p>
        {/* Messages can carry long URLs; let them wrap anywhere. */}
        <p className="text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
          {message}
        </p>
        {onRetry ? (
          <Button
            className="mt-2"
            onClick={onRetry}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className="size-3.5" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Composer({
  account,
  busy,
  disabled,
  member,
  onInput,
  onSend,
  onStop,
  showSuggestions,
}: {
  readonly account: Account;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly member: CrewMember;
  readonly onInput: (hasText: boolean) => void;
  readonly onSend: (text: string) => Promise<void>;
  /** Present while a turn is open: Stop ends it, and sending adds to it. */
  readonly onStop: (() => void) | undefined;
  readonly showSuggestions: boolean;
}) {
  const footnote = ACCESS_NOTES[account.kind];

  return (
    <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 px-5 pt-2 pb-4">
      {showSuggestions && member.suggestions.length > 0 ? (
        <Suggestions>
          {member.suggestions.map((suggestion) => (
            <Suggestion
              disabled={disabled}
              key={suggestion}
              // Failures show as the chat's error, as they do for a typed message.
              onClick={(value) => {
                onSend(value).catch(() => undefined);
              }}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      ) : null}

      <PromptInput
        onSubmit={({ text }) => {
          const trimmed = text.trim();
          if (trimmed) {
            onInput(false);
            return onSend(trimmed);
          }
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label={`Message ${member.name}`}
            disabled={disabled}
            onChange={(event) =>
              onInput(event.currentTarget.value.trim().length > 0)
            }
            placeholder={
              onStop
                ? `Add to what ${member.name} is doing; it reads this at its next step…`
                : `Message ${member.name}…`
            }
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            disabled={disabled}
            status={busy ? "streaming" : "ready"}
            {...(onStop ? { onStop } : {})}
          />
        </PromptInputFooter>
      </PromptInput>

      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <LockIcon className="size-3" />
        {footnote}
      </p>
    </div>
  );
}
