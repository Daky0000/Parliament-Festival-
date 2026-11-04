"use client";

import { useState } from "react";
import { Key, Eye, EyeOff, CheckCircle2, X, RefreshCw, AlertCircle, Save, ShieldCheck } from "lucide-react";

export interface EditKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerKey: string;
  displayName: string;
  currentMaskedHint?: string;
  metadata?: any;
  onKeyUpdated: (providerKey: string, newHint: string, updatedMetadata?: any) => void;
}

export function EditKeyModal({
  isOpen,
  onClose,
  providerKey,
  displayName,
  currentMaskedHint,
  metadata,
  onKeyUpdated,
}: EditKeyModalProps) {
  const [newSecret, setNewSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Extra fields depending on provider
  const [extraAccountId, setExtraAccountId] = useState(
    metadata?.accountId || "e5a51fb1e3d789757e36438c304fea8b"
  );
  const [extraR2AccessKey, setExtraR2AccessKey] = useState(
    metadata?.r2AccessKeyId || "6f0dce6e3113a5ccf5e6fe9d565c64cd"
  );
  const [extraR2SecretKey, setExtraR2SecretKey] = useState("");
  const [extraR2Endpoint, setExtraR2Endpoint] = useState(
    metadata?.r2Endpoint || "https://e5a51fb1e3d789757e36438c304fea8b.r2.cloudflarestorage.com"
  );
  const [extraR2Bucket, setExtraR2Bucket] = useState(
    metadata?.r2Bucket || "dakyxtech-private"
  );
  const [extraSenderId, setExtraSenderId] = useState(
    metadata?.senderId || "PARLIAMENT"
  );
  const [extraFromEmail, setExtraFromEmail] = useState(
    metadata?.senderEmail || "Parliament Protocol <onboarding@resend.dev>"
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecret.trim()) {
      setError("Please enter a valid API key or token.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const extraCredentials: Record<string, string> = {};
      if (providerKey === "cloudflare") {
        if (extraAccountId) extraCredentials.accountId = extraAccountId;
        if (extraR2AccessKey) extraCredentials.r2AccessKeyId = extraR2AccessKey;
        if (extraR2SecretKey) extraCredentials.r2SecretAccessKey = extraR2SecretKey;
        if (extraR2Endpoint) extraCredentials.r2Endpoint = extraR2Endpoint;
        if (extraR2Bucket) extraCredentials.r2Bucket = extraR2Bucket;
      } else if (providerKey === "vynfy") {
        if (extraSenderId) extraCredentials.senderId = extraSenderId;
      } else if (providerKey === "resend") {
        if (extraFromEmail) extraCredentials.fromEmail = extraFromEmail;
      }

      const res = await fetch(`/api/v1/super-admin/integrations/${providerKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rotate_secret",
          newSecretPlain: newSecret.trim(),
          extraCredentials,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update API key.");
      }

      setSuccessMessage("API key securely saved to environment and active credentials!");
      onKeyUpdated(providerKey, data.data.maskedHint, data.data.metadata);

      setTimeout(() => {
        setSuccessMessage(null);
        setNewSecret("");
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0A1830] border-2 border-[#C6A65B] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#C6A65B]/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#102343] rounded-lg border border-[#C6A65B]/30 text-[#C6A65B]">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-editorial text-lg font-bold text-white">
                Configure {displayName}
              </h3>
              <p className="text-[11px] text-[#DFCA95]/80">
                Update or rotate live secret credentials
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#DFCA95]/60 hover:text-white p-1 rounded-lg hover:bg-[#102343] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Key Pill */}
        <div className="bg-[#070D18] border border-[#C6A65B]/20 rounded-lg p-3 flex items-center justify-between text-xs font-mono">
          <span className="text-[#DFCA95]/60">Currently Active:</span>
          <span className="text-[#C6A65B] font-bold">
            {currentMaskedHint || "••••••••••••••••"}
          </span>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-white font-semibold mb-1">
              New {displayName} Secret / Token
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                required
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder={
                  providerKey === "openai"
                    ? "sk-proj-..."
                    : providerKey === "anthropic"
                    ? "sk-ant-..."
                    : providerKey === "resend"
                    ? "re_..."
                    : providerKey === "cloudflare"
                    ? "cfat_... or Bearer Token"
                    : "Paste API key here..."
                }
                className="w-full bg-[#070D18] border border-[#C6A65B]/40 focus:border-[#C6A65B] rounded-lg p-2.5 pr-10 text-white font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-2.5 text-[#DFCA95]/60 hover:text-white"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[#DFCA95]/70 mt-1">
              {providerKey === "openai" &&
                "Paste your OpenAI API key (sk-...). Used as Primary AI Engine for VIP protocol drafting & seating suggestions."}
              {providerKey === "anthropic" &&
                "Paste your Anthropic Claude API key (sk-ant-...). Used for automatic failover when OpenAI is unavailable."}
              {providerKey === "resend" &&
                "Paste your Resend API key (re_...). Dispatches official invitations."}
              {providerKey === "vynfy" &&
                "Paste your Vynfy API key. Operates the Ghana SMS gateway."}
              {providerKey === "cloudflare" &&
                "Paste your Cloudflare API Token for R2 and Edge security."}
            </p>
          </div>

          {/* Cloudflare Extra Fields */}
          {providerKey === "cloudflare" && (
            <div className="p-3 bg-[#070D18] border border-[#C6A65B]/20 rounded-lg space-y-2.5 text-[11px]">
              <div className="font-bold text-[#C6A65B] flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                R2 S3-Compatible Credentials
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[#DFCA95]/80 block mb-0.5">Account ID</label>
                  <input
                    type="text"
                    value={extraAccountId}
                    onChange={(e) => setExtraAccountId(e.target.value)}
                    className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#DFCA95]/80 block mb-0.5">R2 Access Key ID</label>
                  <input
                    type="text"
                    value={extraR2AccessKey}
                    onChange={(e) => setExtraR2AccessKey(e.target.value)}
                    className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#DFCA95]/80 block mb-0.5">R2 Secret Key (Optional update)</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={extraR2SecretKey}
                    onChange={(e) => setExtraR2SecretKey(e.target.value)}
                    className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#DFCA95]/80 block mb-0.5">R2 Bucket Name</label>
                  <input
                    type="text"
                    value={extraR2Bucket}
                    onChange={(e) => setExtraR2Bucket(e.target.value)}
                    className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Vynfy Extra Fields */}
          {providerKey === "vynfy" && (
            <div className="p-3 bg-[#070D18] border border-[#C6A65B]/20 rounded-lg space-y-1.5 text-[11px]">
              <label className="text-[#DFCA95]/80 block font-semibold">Registered Sender ID</label>
              <input
                type="text"
                value={extraSenderId}
                onChange={(e) => setExtraSenderId(e.target.value)}
                placeholder="PARLIAMENT"
                className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
              />
              <span className="text-[10px] text-[#DFCA95]/60 block">
                Up to 11 alphanumeric characters approved with the National Communications Authority (NCA).
              </span>
            </div>
          )}

          {/* Resend Extra Fields */}
          {providerKey === "resend" && (
            <div className="p-3 bg-[#070D18] border border-[#C6A65B]/20 rounded-lg space-y-1.5 text-[11px]">
              <label className="text-[#DFCA95]/80 block font-semibold">Sender Display & Email</label>
              <input
                type="text"
                value={extraFromEmail}
                onChange={(e) => setExtraFromEmail(e.target.value)}
                placeholder="Parliament Protocol <onboarding@resend.dev>"
                className="w-full bg-[#102343] border border-[#C6A65B]/30 rounded p-1.5 text-white font-mono"
              />
              <span className="text-[10px] text-[#DFCA95]/60 block">
                Uses verified sender address (e.g. <code>onboarding@resend.dev</code> or <code>invitations@marketing.dakyworld.com</code>).
              </span>
            </div>
          )}

          {/* Status feedback */}
          {error && (
            <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-lg text-rose-300 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-lg text-emerald-300 flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#C6A65B]/20">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-[#102343] text-[#DFCA95] hover:text-white border border-[#C6A65B]/30 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-md"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save & Apply Key</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

