"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, SplitText, respectsReducedMotion } from "@/lib/gsap";
import { WaveformIndicator } from "./WaveformIndicator";
import { stripMarkdown } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType, KnowledgeLevel } from "@/lib/hooks/use-chat";

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
  /** When false, skip all GSAP animations (message existed before this page mount) */
  animate?: boolean;
}

export function ChatMessage({ message, animate = true }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const containerRef = useRef<HTMLDivElement>(null);
  const messageTextRef = useRef<HTMLParagraphElement>(null);
  const [levelExpanded, setLevelExpanded] = useState(false);

  // Strip markdown from content at render time so streaming text is always clean
  const displayContent = isAssistant ? stripMarkdown(message.content) : message.content;

  // Text is visible when not actively streaming
  const showText = !isAssistant || !message.isStreaming;

  // Entrance animation on mount — skip for pre-existing messages
  useGSAP(
    () => {
      if (!animate || respectsReducedMotion() || !containerRef.current) return;
      gsap.from(containerRef.current, {
        opacity: 0,
        y: 8,
        duration: 0.25,
        ease: "pitwall-accel",
      });
    },
    { scope: containerRef, dependencies: [] }
  );

  // Telex reveal — only for new messages in this session, fires once when streaming ends.
  // Setting display:inline on each split char preserves the original text flow so layout
  // during animation is identical to the final rendered state.
  useGSAP(
    () => {
      if (!animate || message.isStreaming || !isAssistant || !messageTextRef.current) return;
      if (!message.content || respectsReducedMotion()) return;

      const split = new SplitText(messageTextRef.current, { type: "chars" });
      // Force inline display so word-wrap is unchanged vs plain text
      split.chars.forEach((c) => ((c as HTMLElement).style.display = "inline"));

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

  // Metadata row — knowledge level only (sources removed)
  const MetaRow =
    isAssistant && !message.isStreaming && message.knowledgeLevel ? (
      <div className="mt-2">
        <button
          onClick={() => setLevelExpanded((v) => !v)}
          className={cn(
            "inline-flex px-2 py-0.5 border font-mono text-[9px] tracking-widest uppercase transition-opacity cursor-pointer",
            LEVEL_STYLES[message.knowledgeLevel],
            !levelExpanded && "opacity-50 hover:opacity-100"
          )}
        >
          {message.knowledgeLevel}
        </button>
      </div>
    ) : null;

  return (
    <div ref={containerRef}>
      {/* ── Desktop ── */}
      <div className="hidden md:flex gap-4 px-5 py-3 border-b border-f1-grid/20 hover:bg-white/[0.015] transition-colors">
        {/* Left column: sender badge + timestamp stacked */}
        <div className="shrink-0 w-28 flex flex-col gap-1 pt-0.5">
          {isAssistant ? (
            <span className="inline-flex w-fit px-2 py-0.5 border border-f1-red/50 font-mono text-[10px] text-f1-text tracking-widest shadow-[0_0_6px_rgba(220,0,0,0.2)]">
              RACE ENGINEER
            </span>
          ) : (
            <span className="inline-flex w-fit px-2 py-0.5 border border-f1-grid font-mono text-[10px] text-f1-muted tracking-widest">
              YOU
            </span>
          )}
          <span className="font-mono text-[10px] text-f1-muted/50 tabular-nums select-none">
            {timestamp}
          </span>
          {isAssistant && (
            <WaveformIndicator
              isAnimating={!!message.isStreaming}
              barCount={8}
              className={cn(
                "h-2.5 w-8 mt-0.5",
                message.isStreaming ? "text-f1-red/70" : "text-f1-grid/50"
              )}
            />
          )}
        </div>

        {/* Right column: text */}
        <div className="flex-1 min-w-0">
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
                {displayContent}
              </p>
              {MetaRow}
            </>
          ) : null}
        </div>
      </div>

      {/* ── Mobile ── */}
      <div className="md:hidden flex flex-col gap-1.5 px-4 py-3 border-b border-f1-grid/20 hover:bg-white/[0.015] transition-colors">
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
                "h-2.5 w-8",
                message.isStreaming ? "text-f1-red/70" : "text-f1-grid/50"
              )}
            />
          )}
          <span className="ml-auto font-mono text-[10px] text-f1-muted/50 tabular-nums">
            {timestamp}
          </span>
        </div>

        <div>
          {isAssistant && message.isStreaming ? (
            <span className="font-mono text-[11px] text-f1-muted/50 tracking-widest">
              receiving transmission...
            </span>
          ) : showText ? (
            <>
              <p
                className={cn(
                  "text-sm leading-relaxed break-words whitespace-pre-wrap text-f1-text",
                  isAssistant && "font-mono"
                )}
              >
                {displayContent}
              </p>
              {MetaRow}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
