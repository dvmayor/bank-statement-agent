"use client";
import { useEffect, useState } from "react";

export type Provider = "gemini" | "gemini2" | "groq" | "groq2" | "cerebras";

export type ProviderOption = {
  id: Provider;
  label: string;
  model: string;
};

const FALLBACK: ProviderOption[] = [
  { id: "groq",     label: "Groq (Llama 3.3 70B) — fast (recommended)",       model: "llama-3.3-70b-versatile" },
  { id: "groq2",    label: "Groq (Llama 3.1 8B) — very fast but can be inaccurate",  model: "llama-3.1-8b-instant" },
  { id: "cerebras", label: "Cerebras (Qwen 3 235B) — moderate",                 model: "qwen-3-235b-a22b-instruct-2507" },
  { id: "gemini",   label: "Google (Gemma 4 26B) — slow",                      model: "gemma-4-26b-a4b-it" },
  { id: "gemini2",  label: "Google (Gemma 4 31B) — very slow",                  model: "gemma-4-31b-it" },
];

const DISABLED_OPTIONS = [
  { id: "anthropic", label: "Anthropic (Claude Sonnet) — unavailable" },
  { id: "openai",    label: "OpenAI (GPT-4o) — unavailable" },
];

export default function ProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: Provider;
  onChange: (p: Provider) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<ProviderOption[]>(FALLBACK);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/providers`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.providers) setOptions(data.providers); })
      .catch(() => { /* keep fallback */ });
  }, []);

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
      <label className="text-xxs font-mono uppercase tracking-wider text-slate">model</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Provider)}
        disabled={disabled}
        className="field disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map(opt => (
          <option key={opt.id} value={opt.id} className="bg-navy-light">{opt.label}</option>
        ))}
        {DISABLED_OPTIONS.map(opt => (
          <option key={opt.id} value={opt.id} disabled className="bg-navy-light opacity-40">{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
