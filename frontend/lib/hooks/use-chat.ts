"use client";

import { useCallback, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
}

interface SSEEvent {
  type: "sources" | "token" | "done" | "error";
  data?: unknown;
  knowledge_level?: KnowledgeLevel;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isStreaming: true,
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

          // Parse SSE events from buffer
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
                accumulatedContent += `\n\n_${errMsg}_`;
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
            } catch {
              // Skip malformed SSE lines
            }
          }
        }

        // Ensure streaming flag is cleared even if no "done" event
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: accumulatedContent || m.content, sources, isStreaming: false }
              : m,
          ),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const errorMsg = err instanceof Error ? err.message : "Something went wrong";
        setError(errorMsg);

        // Remove the empty assistant message on error
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

  return { messages, sendMessage, isLoading, error, stop };
}
