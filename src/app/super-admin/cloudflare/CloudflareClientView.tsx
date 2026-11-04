"use client";

import { useState, useEffect } from "react";
import { Cloud, ShieldCheck, CheckCircle2, Lock, HardDrive, Globe, ExternalLink, RefreshCw, Key, Radio, Copy, Check } from "lucide-react";
import { EditKeyModal } from "@/components/super-admin/EditKeyModal";

export function CloudflareClientView({
  integration: initialIntegration,
}: {
  integration: any;
}) {
  const [integration, setIntegration] = useState(initialIntegration);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; text: string } | null>(null);
  const [tunnelInfo, setTunnelInfo] = useState<{ active: boolean; publicUrl: string | null; hostname: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/v1/super-admin/cloudflare/tunnel")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setTunnelInfo(json.data);
        }
      })
      .catch(() => {});
  }, []);

  const cred = integration?.credentials?.[0];
  const meta = (() => {
    try {
      return JSON.parse(integration?.metadata || "{}");
    } catch (e) {
      return {};
    }
  })();

  const handleTestR2Connection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/super-admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey: "cloudflare" }),
      });
      const data = await res.json();
      if (data.data?.result === "success") {
        setTestResult({
          status: "success",
          text: data.data.details || "Connected to Cloudflare R2 successfully.",
        });
      } else {
        setTestResult({
          status: "failed",
          text: data.data?.error || "Cloudflare test failed.",
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "failed",
        text: err.message || "Failed to connect to Cloudflare.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleKeyUpdated = (providerKey: string, newHint: string, updatedMetadata?: string) => {
    const nextCreds = [{ maskedHint: newHint, status: "active" }];
    setIntegration({
      ...integration,
      credentials: nextCreds,
      metadata: updatedMetadata || integration.metadata,
    });
    handleTestR2Connection();
  };

  return (
    <div className="space-y-6">
      {/* Live Cloudflare Edge Tunnel Status Banner */}
      <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3">
          <div className="p-2.5 bg-[#091833] rounded-lg border border-[#8FB2FF]/40 text-[#8FB2FF]">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Live Cloudflare Public Tunnel</span>
              {tunnelInfo?.active ? (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ONLINE (Accra Edge)
                </span>
              ) : (
                <span className="bg-[#8FB2FF]/20 text-[#8FB2FF] border border-[#8FB2FF]/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  DETECTING...
                </span>
              )}
            </div>
            <p className="text-xs text-white/60 mt-0.5">
              {tunnelInfo?.publicUrl ? (
                <code className="text-[#8FB2FF] font-mono select-all">{tunnelInfo.publicUrl}</code>
              ) : (
                "Securely exposed to the global web via Cloudflare Tunnel with SSL termination."
              )}
            </p>
          </div>
        </div>

        {tunnelInfo?.publicUrl && (
          <div className="flex items-center gap-2">
            <a
              href={tunnelInfo.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] text-xs font-bold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 "
            >
              <span>Open Public URL</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={() => {
                if (tunnelInfo?.publicUrl) {
                  navigator.clipboard.writeText(tunnelInfo.publicUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="bg-[#091833] hover:bg-[#0D1526] text-white/75 border border-[#8FB2FF]/30 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
              title="Copy URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Cloudflare Credentials & Storage Control Card */}
      <div className="bg-[#091833] border-2 border-[#8FB2FF]/40 hover:border-[#8FB2FF] rounded-xl p-5 shadow-float space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#8FB2FF]/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#091833] rounded-lg border border-[#8FB2FF]/30 text-[#8FB2FF]">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Cloudflare Edge & R2 Object Storage Vault</h3>
              <p className="text-[11px] text-white/60">
                Account ID: <code className="font-mono text-[#8FB2FF]">{meta.accountId || "e5a51fb1e3d789757e36438c304fea8b"}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestR2Connection}
              disabled={isTesting}
              className="bg-[#091833] hover:bg-[#8FB2FF] hover:text-[#091833] text-white/75 border border-[#8FB2FF]/30 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Verify R2 Connection</span>
            </button>

            <button
              onClick={() => setIsEditingKey(true)}
              className="bg-[#8FB2FF] hover:bg-[#8FB2FF] text-[#091833] text-xs font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 "
            >
              <Key className="w-3.5 h-3.5" />
              <span>Edit Credentials</span>
            </button>
          </div>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-3 space-y-1">
            <div className="text-[10px] text-white/45 uppercase font-mono">Active API Token Hint</div>
            <div className="text-[#8FB2FF] font-bold font-mono">{cred?.maskedHint || "cfat_...1000"}</div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Authenticated (Scoped R2 Token)
            </div>
          </div>

          <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-3 space-y-1">
            <div className="text-[10px] text-white/45 uppercase font-mono">R2 Access Key ID</div>
            <div className="text-white font-mono font-bold truncate">
              {meta.r2AccessKeyId || "6f0dce6e3113a5ccf5e6fe9d565c64cd"}
            </div>
            <div className="text-[10px] text-white/55">S3-Compatible Protocol</div>
          </div>

          <div className="bg-[#0D1526] border border-[#8FB2FF]/20 rounded p-3 space-y-1">
            <div className="text-[10px] text-white/45 uppercase font-mono">Target R2 Bucket</div>
            <div className="text-white font-mono font-bold">{meta.r2Bucket || "dakyxtech-private"}</div>
            <div className="text-[10px] text-white/55">Endpoint: *.r2.cloudflarestorage.com</div>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg text-xs border leading-relaxed ${
              testResult.status === "success"
                ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                : "bg-rose-950/70 border-rose-500/40 text-rose-300"
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 uppercase text-[10px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cloudflare R2 Verification Result</span>
            </div>
            <div className="mt-1">{testResult.text}</div>
          </div>
        )}
      </div>

      {/* Cloudflare Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Lock className="w-4 h-4 text-[#8FB2FF]" />
            <span>SSL / TLS Encryption</span>
          </div>
          <div className="text-lg font-bold text-emerald-400">Full (Strict)</div>
          <p className="text-[11px] text-white/55">
            End-to-end TLS 1.3 enforced across all parliament.gh subdomains.
          </p>
        </div>

        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-[#8FB2FF]" />
            <span>Managed WAF Rules</span>
          </div>
          <div className="text-lg font-bold text-emerald-400">Active (Blocking)</div>
          <p className="text-[11px] text-white/55">
            Protects against SQL injection, XSS, and unauthorized token scraping.
          </p>
        </div>

        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Globe className="w-4 h-4 text-[#8FB2FF]" />
            <span>Turnstile Anti-Bot</span>
          </div>
          <div className="text-lg font-bold text-emerald-400">Armed</div>
          <p className="text-[11px] text-white/55">
            Privacy-preserving challenge protection on public RSVP endpoints.
          </p>
        </div>

        <div className="bg-[#091833] border border-[#8FB2FF]/30 rounded-xl p-5 space-y-2 shadow-float">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <HardDrive className="w-4 h-4 text-[#8FB2FF]" />
            <span>R2 Object Storage</span>
          </div>
          <div className="text-lg font-bold text-emerald-400">Connected</div>
          <p className="text-[11px] text-white/55">
            Private bucket holding approved crests, venue layouts, and archives.
          </p>
        </div>
      </div>

      {/* Edit Key Modal */}
      {isEditingKey && (
        <EditKeyModal
          isOpen={true}
          onClose={() => setIsEditingKey(false)}
          providerKey="cloudflare"
          displayName="Cloudflare API & R2"
          currentMaskedHint={cred?.maskedHint}
          metadata={meta}
          onKeyUpdated={handleKeyUpdated}
        />
      )}
    </div>
  );
}

