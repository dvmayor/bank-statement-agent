"use client";
import type { Provider } from "./ProviderSelect";

export type Mode = "react" | "native";

export default function ModeSelect({
  value,
  onChange,
  provider,
  disabled,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  provider: Provider;
  disabled?: boolean;
}) {
  const nativeAvailable = (provider as string) === "claude";
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
      <label className="text-xxs font-mono uppercase tracking-wider text-slate">agent mode</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Mode)}
        disabled={disabled}
        className="field disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="react" className="bg-navy-light">ReAct loop (any provider)</option>
        <option value="native" disabled={!nativeAvailable} className="bg-navy-light">
          Native tool-use{nativeAvailable ? "" : " — Claude only"}
        </option>
      </select>
    </div>
  );
}
