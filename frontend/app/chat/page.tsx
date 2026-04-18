"use client";

import { useRef, useState, useEffect } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { DrawPath } from "@/components/ui/draw-path";
import { StatusDot } from "@/components/ui/status-dot";
import { ChatMessage, FrequencyPresets, TransmitInput } from "@/components/chat";
import { useChat } from "@/lib/hooks/use-chat";
import { circuitPaths } from "@/lib/constants/circuits";

// ---------------------------------------------------------------------------
// Empty state — shown when there are no messages
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  onSelect: (prompt: string) => void;
}

function EmptyState({ onSelect }: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suzuka = circuitPaths.suzuka;

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;
      gsap.from(".standby-content", {
        opacity: 0,
        y: 12,
        duration: 0.4,
        ease: "pitwall-accel",
        delay: 0.2,
      });
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center h-full min-h-[380px] select-none"
    >
      {/* Suzuka circuit ambient background */}
      {suzuka && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <DrawPath
            d={suzuka.d}
            viewBox={suzuka.viewBox}
            duration={8}
            loop
            className="w-full max-w-xs opacity-[0.08]"
          />
        </div>
      )}

      {/* Content */}
      <div className="standby-content relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-2.5 mb-4">
          <StatusDot variant="live" pulse />
          <span className="font-mono text-[10px] text-f1-muted tracking-[0.2em]">
            CHANNEL OPEN
          </span>
        </div>

        <p className="font-mono text-2xl font-semibold text-f1-text tracking-[0.3em] uppercase">
          STANDBY
        </p>
        <p className="font-mono text-xs text-f1-muted tracking-[0.18em] mt-1.5">
          {'// WAITING FOR TRANSMISSION'}
        </p>

        <FrequencyPresets onSelect={onSelect} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error bar — shown when useChat reports an error
// ---------------------------------------------------------------------------

interface ErrorBarProps {
  message: string;
  onDismiss: () => void;
}

function ErrorBar({ message, onDismiss }: ErrorBarProps) {
  return (
    <div className="mx-4 mb-2 flex items-center gap-3 px-4 py-2 border border-f1-red/40 bg-f1-red/5">
      <StatusDot variant="alert" />
      <span className="font-mono text-[10px] text-f1-red tracking-widest flex-1 min-w-0 truncate">
        SIGNAL LOST // {message.toUpperCase()}
      </span>
      <button
        onClick={onDismiss}
        className="font-mono text-[10px] text-f1-muted hover:text-f1-text transition-colors shrink-0 cursor-pointer tracking-widest"
      >
        DISMISS
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { messages, sendMessage, isLoading, error, clearError, stop } =
    useChat();
  const [input, setInput] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Shake the error bar when a new error appears
  useGSAP(
    () => {
      if (!error || !errorRef.current || respectsReducedMotion()) return;
      gsap.to(errorRef.current, {
        keyframes: [
          { x: -4, duration: 0.05 },
          { x: 4, duration: 0.05 },
          { x: -3, duration: 0.05 },
          { x: 3, duration: 0.05 },
          { x: -2, duration: 0.05 },
          { x: 2, duration: 0.05 },
          { x: 0, duration: 0.05 },
        ],
      });
    },
    { scope: pageRef, dependencies: [error] }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      ref={pageRef}
      className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-2.5rem)] overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-f1-grid bg-f1-dark">
        <div className="flex items-center gap-2">
          <StatusDot variant="live" pulse />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-sm font-semibold tracking-[0.15em] text-f1-text uppercase">
            Pitwall Radio
          </h1>
          <p className="font-mono text-[10px] text-f1-muted tracking-[0.18em] mt-0.5">
            SECURE CHANNEL // STRATEGY COMMS
          </p>
        </div>

        {/* Message count — visible once a conversation is active */}
        {hasMessages && (
          <div className="shrink-0 flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-f1-muted tabular-nums tracking-widest">
              {messages.length} TRANSMISSIONS
            </span>
          </div>
        )}
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {hasMessages ? (
          <div className="py-1">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <EmptyState onSelect={(q) => { sendMessage(q); }} />
        )}
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div ref={errorRef}>
          <ErrorBar message={error} onDismiss={clearError} />
        </div>
      )}

      {/* ── Input ── */}
      <TransmitInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={stop}
        isLoading={isLoading}
      />
    </div>
  );
}
