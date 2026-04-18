"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api-client";

interface ChatSource {
  source: string;
  content: string;
}

export type KnowledgeLevel = "beginner" | "intermediate" | "expert";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  knowledgeLevel?: KnowledgeLevel;
  isStreaming?: boolean;
  timestamp: number;
}

interface SSEEvent {
  type: "sources" | "token" | "done" | "error";
  data?: unknown;
  knowledge_level?: KnowledgeLevel;
}

const SESSION_KEY = "pitwall_chat_history";

function loadSession(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Drop any message that was still streaming when the tab navigated away
    return parsed.filter((m) => !m.isStreaming);
  } catch {
    return [];
  }
}

function saveSession(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // Only persist completed messages
    const completed = messages.filter((m) => !m.isStreaming);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(completed));
  } catch {
    // sessionStorage can throw if storage is full — fail silently
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadSession);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Persist completed messages to sessionStorage whenever messages change
  useEffect(() => {
    saveSession(messages);
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      const now = Date.now();
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: now,
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: now + 1,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      // Build history from existing messages (last 3 exchanges = 6 messages)
      const history = messages
        .filter((m) => !m.isStreaming)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE}/api/v1/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content.trim(), history }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat error: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let sources: ChatSource[] | undefined;
        let knowledgeLevel: KnowledgeLevel | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const event: SSEEvent = JSON.parse(line.slice(6));

              if (event.type === "sources") {
                sources = event.data as ChatSource[];
                knowledgeLevel = event.knowledge_level;
              } else if (event.type === "token") {
                accumulatedContent += event.data as string;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: accumulatedContent, sources, knowledgeLevel, isStreaming: true }
                      : m,
                  ),
                );
              } else if (event.type === "error") {
                const errMsg = (event.data as string) || "Stream interrupted";
                accumulatedContent += `\n\n${errMsg}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: accumulatedContent, sources, knowledgeLevel, isStreaming: false }
                      : m,
                  ),
                );
              } else if (event.type === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: accumulatedContent, sources, knowledgeLevel, isStreaming: false }
                      : m,
                  ),
                );
              }
            } catch (err) {
              console.error("SSE parse error:", line, err);
            }
          }
        }

        // Ensure streaming flag is cleared even if no "done" event
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: accumulatedContent || m.content, sources, knowledgeLevel, isStreaming: false }
              : m,
          ),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const errorMsg = err instanceof Error ? err.message : "Something went wrong";
        setError(errorMsg);

        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages, isLoading],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, sendMessage, isLoading, error, clearError, stop };
}
