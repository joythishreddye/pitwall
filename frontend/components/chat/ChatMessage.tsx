"use client";

import { useRef, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { gsap, useGSAP, SplitText, respectsReducedMotion } from "@/lib/gsap";
import { WaveformIndicator } from "./WaveformIndicator";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType, KnowledgeLevel } from "@/lib/hooks/use-chat";

// Ensure SplitText is imported for side-effect registration
void SplitText;

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const LEVEL_STYLES: Record<KnowledgeLevel, string> = {
  beginner: "border-f1-green/40 text-f1-green",
  intermediate: "border-f1-cyan/40 text-f1-cyan",
  expert: "border-f1-orange/40 text-f1-orange",
};

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref for the desktop text paragraph — SplitText targets this
  const messageTextRef = useRef<HTMLParagraphElement>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  // Text is visible when the message is not actively streaming.
  // For user messages this is always true; for AI messages it flips when
  // the SSE stream fires the "done" event and isStreaming becomes false.
  const showText = !isAssistant || !message.isStreaming;

  // Entrance: slide-up on mount
  useGSAP(
    () => {
      if (respectsReducedMotion() || !containerRef.current) return;
      gsap.from(containerRef.current, {
        opacity: 0,
        y: 8,
        duration: 0.25,
        ease: "pitwall-accel",
      });
    },
    { scope: containerRef, dependencies: [] }
  );

  // Telex: character-by-character reveal fires when isStreaming flips false.
  // messageTextRef points to the desktop <p> which only mounts when showText=true,
  // so the ref is guaranteed to be set before this effect runs.
  useGSAP(
    () => {
      if (message.isStreaming || !isAssistant || !messageTextRef.current) return;
      if (!message.content || respectsReducedMotion()) return;

      const split = new SplitText(messageTextRef.current, { type: "chars" });
      gsap.from(split.chars, {
        opacity: 0,
        duration: 0.01,
        stagger: 0.018,
        ease: "none",
        onComplete: () => split.revert(),
      });

      return () => split.revert();
    },
    { scope: containerRef, dependencies: [message.isStreaming] }
  );

  const timestamp = formatTimestamp(message.timestamp);

  // Shared text block — used in the desktop layout only
  const TextContent = (
    <>
      {isAssistant && message.isStreaming ? (
        <span className="font-mono text-[11px] text-f1-muted/50 tracking-widest">
          receiving transmission...
        </span>
      ) : showText ? (
        <>
          <p
            ref={isAssistant ? messageTextRef : undefined}
            className={cn(
              "text-sm leading-relaxed break-words whitespace-pre-wrap text-f1-text",
              isAssistant && "font-mono"
            )}
          >
            {message.content}
          </p>

          {/* Metadata row — knowledge level + sources */}
          {isAssistant && !message.isStreaming && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {message.knowledgeLevel && (
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 border font-mono text-[9px] tracking-widest uppercase",
                    LEVEL_STYLES[message.knowledgeLevel]
                  )}
                >
                  {message.knowledgeLevel}
                </span>
              )}
              {message.sources && message.sources.length > 0 && (
                <button
                  onClick={() => setSourcesExpanded((v) => !v)}
                  className="flex items-center gap-1 font-mono text-[10px] text-f1-muted hover:text-f1-text transition-colors cursor-pointer"
                >
                  {sourcesExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {message.sources.length} SOURCE
                  {message.sources.length !== 1 ? "S" : ""}
                </button>
              )}
            </div>
          )}
          {sourcesExpanded && message.sources && message.sources.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {message.sources.map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-f1-dark-3 border border-f1-grid font-mono text-[10px] text-f1-muted"
                  title={s.content}
                >
                  {s.source.replace("knowledge/", "")}
                </span>
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <div ref={containerRef}>
      {/* ── Desktop: terminal table row ── */}
      <div className="hidden md:flex items-start px-4 py-2.5 border-b border-f1-grid/20 last:border-b-0 hover:bg-white/[0.015] transition-colors">
        {/* Timestamp */}
        <span className="w-20 shrink-0 font-mono text-[11px] text-f1-muted tabular-nums mt-0.5 select-none">
          {timestamp}
        </span>

        {/* Separator */}
        <span className="w-4 shrink-0 text-f1-grid/60 text-xs flex justify-center mt-0.5 select-none">
          ┃
        </span>

        {/* Sender badge */}
        <div className="w-[112px] shrink-0 mt-0.5">
          {isAssistant ? (
            <span className="inline-flex px-2 py-0.5 border border-f1-red/50 font-mono text-[10px] text-f1-text tracking-widest shadow-[0_0_6px_rgba(220,0,0,0.2)]">
              RACE ENGINEER
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 border border-f1-grid font-mono text-[10px] text-f1-muted tracking-widest">
              YOU
            </span>
          )}
        </div>

        {/* Separator */}
        <span className="w-4 shrink-0 text-f1-grid/60 text-xs flex justify-center mt-0.5 select-none">
          ┃
        </span>

        {/* Waveform column */}
        <div className="w-10 shrink-0 flex items-start pt-1">
          {isAssistant ? (
            <WaveformIndicator
              isAnimating={!!message.isStreaming}
              barCount={8}
              className={cn(
                "h-3 w-8",
                message.isStreaming ? "text-f1-red/70" : "text-f1-grid/60"
              )}
            />
          ) : (
            // Empty spacer keeps text columns aligned
            <span className="w-8 h-3 inline-block" />
          )}
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">{TextContent}</div>
      </div>

      {/* ── Mobile: simplified card ── */}
      <div className="md:hidden flex flex-col gap-1.5 px-4 py-3 border-b border-f1-grid/20 last:border-b-0 hover:bg-white/[0.015] transition-colors">
        <div className="flex items-center gap-2">
          {isAssistant ? (
            <span className="inline-flex px-2 py-0.5 border border-f1-red/50 font-mono text-[10px] text-f1-text tracking-widest shadow-[0_0_4px_rgba(220,0,0,0.2)]">
              RACE ENGINEER
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 border border-f1-grid font-mono text-[10px] text-f1-muted tracking-widest">
              YOU
            </span>
          )}
          {isAssistant && (
            <WaveformIndicator
              isAnimating={!!message.isStreaming}
              barCount={8}
              className={cn(
                "h-3 w-8 ml-1",
                message.isStreaming ? "text-f1-red/70" : "text-f1-grid/60"
              )}
            />
          )}
          <span className="ml-auto font-mono text-[10px] text-f1-muted tabular-nums">
            {timestamp}
          </span>
        </div>

        {/* Mobile text (no telex — animation is desktop-only) */}
        <div>
          {isAssistant && message.isStreaming ? (
            <span className="font-mono text-[11px] text-f1-muted/50 tracking-widest">
              receiving transmission...
            </span>
          ) : showText ? (
            <p
              className={cn(
                "text-sm leading-relaxed break-words whitespace-pre-wrap text-f1-text",
                isAssistant && "font-mono"
              )}
            >
              {message.content}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
