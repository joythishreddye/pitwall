import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="p-8 flex flex-col h-[calc(100vh-0px)]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Race Companion
        </h1>
        <p className="text-f1-muted text-sm mt-1">
          AI-powered F1 chat — ask about rules, strategy, history, and live race context
        </p>
      </div>

      {/* Chat area placeholder */}
      <div className="flex-1 border border-f1-grid bg-f1-dark-2 rounded-sm flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="h-8 w-8 text-f1-grid mx-auto mb-3" />
            <p className="text-f1-muted text-sm">RAG pipeline coming soon</p>
            <p className="text-f1-muted/50 text-xs mt-1">
              3-stage retrieval: intent → vector search → reranking
            </p>
          </div>
        </div>

        {/* Input placeholder */}
        <div className="border-t border-f1-grid p-4">
          <div className="flex gap-3">
            <div className="flex-1 h-10 bg-f1-dark-3 border border-f1-grid rounded-sm px-3 flex items-center text-f1-muted text-sm">
              Ask about F1...
            </div>
            <button disabled className="h-10 px-4 bg-f1-red/20 text-f1-red rounded-sm flex items-center text-sm font-medium cursor-not-allowed opacity-60">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
