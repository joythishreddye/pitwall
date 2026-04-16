"use client";

import { Bot, ChevronDown, ChevronRight, MessageSquare, Send, Square, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type ChatMessage, type KnowledgeLevel, useChat } from "@/lib/hooks/use-chat";

const SUGGESTED_QUESTIONS = [
  "What is DRS?",
  "Why is Monaco hard to overtake at?",
  "Explain the undercut strategy",
  "What tires are best for Monza?",
  "Who won the 2023 championship?",
];

function SourceTags({ sources }: { sources: { source: string; content: string }[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!sources.length) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-f1-muted hover:text-f1-text transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {sources.length} source{sources.length !== 1 ? "s" : ""}
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <span
              key={i}
              className="inline-block px-2 py-0.5 bg-f1-dark-3 border border-f1-grid text-xs text-f1-muted rounded-sm font-mono"
              title={s.content}
            >
              {s.source.replace("knowledge/", "")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_CONFIG: Record<KnowledgeLevel, { label: string; color: string }> = {
  beginner: { label: "Beginner", color: "text-green-400 border-green-400/30" },
  intermediate: { label: "Intermediate", color: "text-f1-cyan border-f1-cyan/30" },
  expert: { label: "Expert", color: "text-f1-orange border-f1-orange/30" },
};

function KnowledgeLevelBadge({ level }: { level: KnowledgeLevel }) {
  const config = LEVEL_CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm text-[10px] font-mono ${config.color}`}
    >
      {config.label}
    </span>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center ${
          isUser ? "bg-f1-dark-3" : "bg-f1-red/15"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-f1-muted" />
        ) : (
          <Bot className="h-4 w-4 text-f1-red" />
        )}
      </div>
      <div
        className={`max-w-[75%] px-4 py-3 rounded-sm text-sm leading-relaxed ${
          isUser
            ? "bg-f1-dark-3 text-f1-text"
            : "bg-f1-dark-2 border-l-2 border-f1-red text-f1-text"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.isStreaming && !message.content && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-f1-red animate-pulse" />
            <span className="text-f1-muted text-xs">Thinking...</span>
          </div>
        )}
        {message.isStreaming && message.content && (
          <span className="inline-block w-1.5 h-4 bg-f1-red animate-pulse ml-0.5 align-text-bottom" />
        )}
        {!isUser && !message.isStreaming && (
          <div className="mt-2 pt-2 border-t border-f1-grid/50 flex items-center gap-2">
            {message.knowledgeLevel && (
              <KnowledgeLevelBadge level={message.knowledgeLevel} />
            )}
            {message.sources && message.sources.length > 0 && (
              <SourceTags sources={message.sources} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, isLoading, error, stop } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  const handleSuggestion = (question: string) => {
    sendMessage(question);
    inputRef.current?.focus();
  };

  return (
    <div className="p-8 flex flex-col h-[calc(100vh-0px)]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Race Companion
        </h1>
        <p className="text-f1-muted text-sm mt-1">
          AI-powered F1 chat — ask about rules, strategy, history, and live
          race context
        </p>
      </div>

      <div className="flex-1 border border-f1-grid bg-f1-dark-2 rounded-sm flex flex-col min-h-0">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <MessageSquare className="h-8 w-8 text-f1-grid mb-3" />
              <p className="text-f1-muted text-sm mb-1">
                Ask me anything about Formula 1
              </p>
              <p className="text-f1-muted/50 text-xs mb-6">
                Rules, strategy, circuits, history, driver comparisons
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestion(q)}
                    className="px-3 py-1.5 bg-f1-dark-3 border border-f1-grid rounded-sm text-xs text-f1-muted hover:text-f1-text hover:border-f1-red/40 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 bg-f1-red/10 border border-f1-red/30 rounded-sm text-xs text-f1-red">
            {error}
          </div>
        )}

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-f1-grid p-4"
        >
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about F1..."
              className="flex-1 h-10 bg-f1-dark-3 border border-f1-grid rounded-sm px-3 text-sm text-f1-text placeholder:text-f1-muted transition-colors"
              disabled={isLoading}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="h-10 px-4 bg-f1-dark-3 border border-f1-grid text-f1-muted rounded-sm flex items-center gap-2 text-sm font-medium hover:border-f1-red/40 transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="h-10 px-4 bg-f1-red text-white rounded-sm flex items-center gap-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-f1-red/90 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
