"use client";

import { useState } from "react";
import { inputClass } from "./AuthShell";

/** Password field with a show/hide toggle so people can check what they typed. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`${inputClass} pr-16`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 px-3 text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-r-[10px]"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
