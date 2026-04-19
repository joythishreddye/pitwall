"use client";

import { useState } from "react";
import { StatusDot } from "./status-dot";

type Source = "live" | "academy" | "predictions";
type SubmitState = "idle" | "submitting" | "done" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifyFormProps {
  source: Source;
  heading: string;
  description: string;
  className?: string;
}

export function NotifyForm({ source, heading, description, className = "" }: NotifyFormProps) {
  const [email, setEmail] = useState("");
  // Pure session state — no localStorage. Backend upsert handles duplicates silently.
  const [status, setStatus] = useState<SubmitState>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return;
    setStatus("submitting");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className={`flex items-center gap-2.5 border border-f1-green/30 bg-f1-green/5 px-4 py-3 ${className}`}>
        <StatusDot variant="live" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-f1-green">
          Confirmed — we'll ping you when it ships
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-cyan mb-1">
        Notify Me
      </p>
      <h3 className="text-base font-semibold font-[family-name:var(--font-ibm-plex)] text-f1-text mb-0.5">
        {heading}
      </h3>
      <p className="text-[11px] font-mono text-f1-muted mb-3">{description}</p>

      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={status === "submitting"}
          className="flex-1 min-w-[200px] bg-f1-dark border border-f1-grid px-3 py-2 text-[11px] font-mono text-f1-text placeholder:text-f1-grid focus:outline-none focus:border-f1-cyan/50 disabled:opacity-50"
          aria-label="Email address"
        />
        <button
          type="submit"
          disabled={status === "submitting" || !EMAIL_RE.test(email)}
          className="flex-shrink-0 bg-f1-red text-f1-text text-[10px] font-mono uppercase tracking-widest px-4 py-2 cursor-pointer hover:bg-red-600 transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? "Transmitting…" : "Notify Me"}
        </button>
      </form>

      {status === "error" && (
        <p className="text-[10px] font-mono text-f1-red mt-2 uppercase tracking-wider">
          Transmission failed — try again
        </p>
      )}
    </div>
  );
}
