"use client";
import { useEffect, useState } from "react";

export type Provider = "gemini" | "claude" | "groq";

export type ProviderOption = {
  id: Provider;
  label: string;
  model: string;
};

const FALLBACK: ProviderOption[] = [
  { id: "gemini", label: "Google Gemini 2.0 Flash (free tier)", model: "gemini-2.0-flash" },
  { id: "claude", label: "Anthropic Claude Sonnet 4.6 (paid)", model: "claude-sonnet-4-6" },
  { id: "groq", label: "Groq Llama 3.3 70B (free tier)", model: "llama-3.3-70b-versatile" },
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
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} className="bg-navy-light">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
