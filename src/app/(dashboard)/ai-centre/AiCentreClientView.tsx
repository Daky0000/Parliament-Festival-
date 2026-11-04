"use client";

import { useState } from "react";
import { Sparkles, Send, ShieldCheck, CheckCircle, AlertTriangle, RefreshCw, Terminal, ArrowRight } from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  toolExecution?: any;
  approvalRequired?: {
    toolName: string;
    args: any;
    message: string;
  };
}

export function AiCentreClientView({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "ai",
      text: "Greetings. I am the Parliamentary Protocol AI Assistant. I am authorized to query guest precedence, summarize invitation responses, draft official reminders, and propose seating allocations under your operational oversight.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || inputQuery;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customMessage) setInputQuery("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend, eventId }),
      });
      const data = await res.json();

      if (data.data) {
        const execution = data.data.toolExecution;
        let approvalReq = undefined;

        if (execution?.status === "awaiting_approval") {
          approvalReq = {
            toolName: execution.toolName,
            args: execution.inputSummary,
            message: execution.message,
          };
        }

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: data.data.reply || "Request processed against parliamentary database.",
          toolExecution: execution,
          approvalRequired: approvalReq,
        };

        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      console.error("AI error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveTool = async (msgId: string, toolName: string, args: any) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName,
          args: { ...args, _approvedByHuman: true },
          eventId,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  approvalRequired: undefined,
                  toolExecution: data.data,
                  text: `Tool '${toolName}' was formally approved and successfully executed against the database.`,
                }
              : m
          )
        );
      }
    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Chat Interface */}
      <div className="lg:col-span-2 bg-white rounded-lg border border-[#E3E6EB] flex flex-col h-[650px] ">
        {/* Chat Header */}
        <div className="p-4 border-b border-[#E3E6EB] flex items-center justify-between bg-[#091833] text-white rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#091833] flex items-center justify-center text-[#2563EB]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-editorial text-sm font-medium text-[#FFFFFF]">
                Protocol Command Assistant
              </h3>
              <p className="text-[10px] text-[#8FB2FF]">
                Least-Privilege Policy Active &bull; Zero SQL Access
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-[#3F6212] text-white font-semibold px-2 py-0.5 rounded-full">
            Policy Gate: Verified
          </span>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3.5 text-xs ${
                  msg.sender === "user"
                    ? "bg-[#091833] text-[#F6F7F9]"
                    : "bg-[#F6F7F9] text-[#0D1526] border border-[#E3E6EB]"
                }`}
              >
                <div className="font-semibold mb-1 text-[10px] uppercase tracking-wider text-[#2563EB]">
                  {msg.sender === "user" ? "Authorized Officer" : "Parliamentary AI Assistant"}
                </div>
                <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                {/* Tool Execution Results */}
                {msg.toolExecution?.result && (
                  <div className="mt-3 pt-3 border-t border-[#2563EB]/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#091833]">
                      <Terminal className="w-3.5 h-3.5 text-[#2563EB]" />
                      Authoritative Database Record:
                    </div>
                    <pre className="bg-[#091833] text-[#8FB2FF] p-2.5 rounded text-[11px] font-mono overflow-x-auto max-h-48">
                      {JSON.stringify(msg.toolExecution.result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Human-in-the-Loop Approval Card */}
                {msg.approvalRequired && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Human Approval Required
                    </div>
                    <p className="text-[11px]">{msg.approvalRequired.message}</p>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleApproveTool(
                            msg.id,
                            msg.approvalRequired!.toolName,
                            msg.approvalRequired!.args
                          )
                        }
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-1 rounded text-xs transition-colors flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve & Execute Action
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-[#5B6374] italic">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
              Consulting Parliamentary Protocol Rules...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-[#E3E6EB] bg-white rounded-b-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about guests, pending RSVPs, seating, or draft copy..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 text-xs border border-[#E3E6EB] rounded-md px-3 py-2.5 focus:outline-none focus:border-[#2563EB]"
            />
            <button
              type="submit"
              disabled={isLoading || !inputQuery.trim()}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white p-2.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Sidebar: Quick Prompts & Registered Tools */}
      <div className="space-y-4">
        {/* Suggestion Prompts */}
        <div className="bg-white rounded-lg border border-[#E3E6EB] p-4 space-y-3">
          <h4 className="text-xs font-semibold text-[#091833] uppercase tracking-wider">
            Operational Prompts
          </h4>
          <div className="space-y-2">
            {[
              "Summarize pending RSVPs for the Diplomatic Corps",
              "Draft an official invitation reminder notice for MPs",
              "Propose protocol seating allocation for Forecourt layout",
              "Draft executive operational report for Clerk to Parliament",
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                className="w-full text-left text-xs p-2.5 rounded border border-[#E3E6EB] hover:border-[#2563EB] hover:bg-[#F6F7F9] transition-all flex items-center justify-between text-[#0D1526] group"
              >
                <span>{prompt}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#8A91A0] group-hover:text-[#2563EB] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Typed Tool Registry Card */}
        <div className="bg-[#091833] rounded-2xl p-4 text-[#F6F7F9] space-y-3">
          <div className="flex items-center gap-2 text-[#2563EB]">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider">
              Enforced Policy Boundaries
            </h4>
          </div>
          <p className="text-[11px] text-white/70 leading-relaxed">
            All AI suggestions are bounded by typed domain services. Write operations must be approved by an authorized officer and are recorded in the append-only audit trail.
          </p>
          <div className="text-[10px] space-y-1 text-white/55 pt-2 border-t border-[#2563EB]/20">
            <div>&bull; Direct SQL Execution: <strong>BLOCKED</strong></div>
            <div>&bull; Autonomous Mass Dispatch: <strong>BLOCKED</strong></div>
            <div>&bull; Precedence Rank Override: <strong>HUMAN APPROVAL REQUIRED</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

