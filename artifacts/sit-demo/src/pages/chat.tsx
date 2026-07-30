import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, Database, Download, Send, Upload, X } from "lucide-react";
import type { KeyboardEvent, ChangeEvent } from "react";
import type { ConversationState } from "@workspace/sit-engine";
import {
  type AssistantMessage,
  type DeveloperConsolePayload,
  type SITBrief,
  createOrLoadWebSession,
  getKnowledgeVersion,
  importKnowledgeFile,
  sendConversationTurn,
} from "@/lib/conversation-api";

type Sender = "sit" | "user";

interface TextMessage {
  id: string;
  type: "text";
  sender: Sender;
  text: string;
  timestamp: Date;
}

interface BriefMessage {
  id: string;
  type: "brief";
  sender: "sit";
  brief: SITBrief;
  timestamp: Date;
}

type Message = TextMessage | BriefMessage;

interface DeveloperTurn {
  id: string;
  label: string;
  payload: DeveloperConsolePayload;
}

// ─── Brief Card ───────────────────────────────────────────────────────────────

function BriefCard({ brief }: { brief: SITBrief }) {
  return (
    <div className="bg-gradient-to-b from-primary/12 to-primary/5 border border-primary/20 rounded-2xl rounded-tl-sm overflow-hidden w-full">
      <div className="px-4 py-3 border-b border-primary/15 flex items-center gap-2.5">
        <div className="w-1 h-4 rounded-full bg-primary flex-none" />
        <span className="text-[11px] font-bold tracking-widest uppercase text-primary/80">Your SIT Brief</span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-4 text-[13.5px] leading-relaxed">
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">What I think you're looking for</h3>
          <p className="text-white/80">{brief.lookingFor}</p>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">What I'd avoid</h3>
          <ul className="flex flex-col gap-1.5">
            {brief.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-white/75">
                <span className="text-primary/50 flex-none mt-0.5">—</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">Where I'd suggest staying</h3>
          <p className="text-white/80">{brief.stayArea}</p>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">Experiences I'd prioritize</h3>
          <ul className="flex flex-col gap-1.5">
            {brief.experiences.map((e, i) => (
              <li key={i} className="flex gap-2 text-white/75">
                <span className="text-primary/50 flex-none mt-0.5">—</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">One local insight</h3>
          <p className="text-white/75 italic">{brief.localInsight}</p>
        </section>
      </div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-44 overflow-auto rounded-md border border-white/[0.08] bg-black/30 p-2 text-[10px] leading-relaxed text-white/55">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DeveloperConsole({
  turns,
  selectedId,
  onSelect,
  onExport,
}: {
  turns: DeveloperTurn[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onExport: () => void;
}) {
  const selected = turns.find(turn => turn.id === selectedId) ?? turns.at(-1);
  if (!selected) return null;
  const payload = selected.payload;

  return (
    <section className="flex-none max-h-[42dvh] overflow-y-auto border-t border-amber-400/20 bg-black/45 px-3 py-3 text-white">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bug className="h-3.5 w-3.5 text-amber-300" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-200">Developer Console</span>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-1 rounded-md border border-white/[0.1] px-2 py-1 text-[10px] text-white/60 hover:border-amber-300/40 hover:text-amber-100"
        >
          <Download className="h-3 w-3" />
          JSON
        </button>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {turns.map((turn, index) => (
          <button
            key={turn.id}
            onClick={() => onSelect(turn.id)}
            className={`rounded-md border px-2 py-1 text-[10px] transition ${
              selected.id === turn.id
                ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                : "border-white/[0.08] text-white/45 hover:text-white/70"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div className="grid gap-3 text-[11px]">
        <div className="rounded-md border border-white/[0.08] p-2">
          <div className="mb-1 text-white/35">User Message</div>
          <div className="text-white/75">{payload.userMessage || "(boot)"}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-white/[0.08] p-2">
            <div className="mb-1 text-white/35">Detected Intent</div>
            <div className="text-white/80">{payload.detectedIntent.intent}</div>
            <div className="text-white/35">confidence {payload.detectedIntent.confidence}</div>
          </div>
          <div className="rounded-md border border-white/[0.08] p-2">
            <div className="mb-1 text-white/35">Decision Trace</div>
            <div className="text-white/65">{payload.decisionTrace.join(" -> ")}</div>
          </div>
        </div>

        <details open className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Conversation Memory</summary>
          <JsonBlock value={payload.memory} />
        </details>

        <details open className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Time Intelligence</summary>
          <JsonBlock value={payload.timeTrace} />
        </details>

        <details open className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Services Called</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {payload.services.map(service => (
              <div key={service.service} className="rounded border border-white/[0.06] p-2">
                <div className="text-white/70">{service.service}</div>
                <div className="text-white/35">
                  {service.called ? "called" : "skipped"} · {service.durationMs}ms · {service.status}
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Knowledge Retrieval</summary>
          <div className="mt-2 text-white/35">
            version {payload.knowledgeRetrieval.version ?? "none"} · imported {payload.knowledgeRetrieval.importedAt ?? "none"}
          </div>
          <div className="mt-2 grid gap-2">
            <JsonBlock value={{
              retrievedCards: payload.knowledgeRetrieval.retrievedCards,
              cardsUsed: payload.knowledgeRetrieval.cardsUsed,
              cardsRejected: payload.knowledgeRetrieval.cardsRejected,
            }} />
          </div>
        </details>

        <details className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Prompt Inspector</summary>
          <JsonBlock value={payload.promptInspector} />
        </details>

        <details className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">LLM Response</summary>
          <JsonBlock value={payload.llmResponse} />
        </details>

        <details className="rounded-md border border-white/[0.08] p-2">
          <summary className="cursor-pointer text-white/55">Timeline State</summary>
          <JsonBlock value={payload.timelineTurn} />
        </details>
      </div>
    </section>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [planOptions, setPlanOptions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [locked, setLocked] = useState(true);
  const isDevBuild = import.meta.env.DEV;
  const [developerMode, setDeveloperMode] = useState(() => import.meta.env.DEV && localStorage.getItem("sit.developerMode") === "true");
  const [developerTurns, setDeveloperTurns] = useState<DeveloperTurn[]>([]);
  const [selectedDeveloperTurnId, setSelectedDeveloperTurnId] = useState<string | undefined>();

  // Knowledge base
  const [kbCardCount, setKbCardCount] = useState(0);
  const [kbStatus, setKbStatus] = useState<"server" | "uploaded" | "loading">("server");
  const [kbBannerVisible, setKbBannerVisible] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userKeyRef = useRef<string>(
    localStorage.getItem("sit.webUserKey") ?? `web-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, planOptions]);

  const addMsg = (msg: Omit<TextMessage, "id" | "timestamp"> | Omit<BriefMessage, "id" | "timestamp">) => {
    setMessages(prev => [
      ...prev,
      { ...msg, id: Math.random().toString(36).slice(2), timestamp: new Date() } as Message,
    ]);
  };

  const sitSay = async (text: string, typingMs = 1100) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, typingMs));
    setIsTyping(false);
    addMsg({ type: "text", sender: "sit", text });
  };

  const renderRunnerMessages = async (runnerMessages: AssistantMessage[], brief?: SITBrief) => {
    if (brief && runnerMessages.length >= 2) {
      await sitSay(runnerMessages[0]!.text, 1400);
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 2200));
      setIsTyping(false);
      addMsg({ type: "brief", sender: "sit", brief });
      await sitSay(runnerMessages[1]!.text, 1300);
      for (const message of runnerMessages.slice(2)) {
        await sitSay(message.text, 1100);
      }
      return;
    }

    for (const message of runnerMessages) {
      await sitSay(message.text, 1100);
    }
  };

  const renderSessionTranscript = (state?: ConversationState) => {
    const turns = state?.turns ?? [];
    if (!turns.length) return false;

    setMessages(turns
      .filter(turn => turn.text.trim())
      .map(turn => ({
        id: Math.random().toString(36).slice(2),
        type: "text" as const,
        sender: turn.role === "assistant" ? "sit" : "user",
        text: turn.text,
        timestamp: new Date(turn.timestamp ?? Date.now()),
      })));
    return true;
  };

  const recordDeveloperTurn = (payload?: DeveloperConsolePayload) => {
    if (!payload || !isDevBuild || !developerMode) return;
    const id = Math.random().toString(36).slice(2);
    setDeveloperTurns(prev => [
      ...prev,
      {
        id,
        label: payload.userMessage || "boot",
        payload,
      },
    ]);
    setSelectedDeveloperTurnId(id);
  };

  const toggleDeveloperMode = () => {
    if (!isDevBuild) return;
    setDeveloperMode(prev => {
      const next = !prev;
      localStorage.setItem("sit.developerMode", String(next));
      return next;
    });
  };

  const exportDeveloperConversation = () => {
    const data = JSON.stringify({
      exportedAt: new Date().toISOString(),
      sessionId,
      turns: developerTurns,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sit-developer-console-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Boot sequence
  useEffect(() => {
    const boot = async () => {
      localStorage.setItem("sit.webUserKey", userKeyRef.current);
      const session = await createOrLoadWebSession(userKeyRef.current);
      setSessionId(session.id);
      const version = await getKnowledgeVersion().catch(() => undefined);
      setKbCardCount(version?.metadata?.cardCount ?? 0);
      if (renderSessionTranscript(session.state)) {
        setLocked(false);
        inputRef.current?.focus();
        return;
      }
      const output = await sendConversationTurn({
        sessionId: session.id,
        userKey: userKeyRef.current,
        message: "",
        devTrace: developerMode,
      });
      recordDeveloperTurn(output.developerConsole);
      await renderRunnerMessages(output.messages);
      setSuggestions(output.suggestions ?? []);
      setLocked(false);
      inputRef.current?.focus();
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── File upload handler ────────────────────────────────────────────────────

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setKbStatus("loading");
    try {
      const metadata = await importKnowledgeFile(file);
      setKbCardCount(metadata.cardCount);
      setKbStatus("uploaded");
      setKbBannerVisible(true);
      setTimeout(() => setKbBannerVisible(false), 4000);
    } catch {
      setKbStatus("server");
      setKbBannerVisible(false);
    }
  };

  // ─── Send handler ───────────────────────────────────────────────────────────

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || locked) return;

    setInputValue("");
    setSuggestions([]);
    setPlanOptions([]);
    setLocked(true);

    addMsg({ type: "text", sender: "user", text: trimmed });

    try {
      const output = await sendConversationTurn({
        sessionId,
        userKey: userKeyRef.current,
        message: trimmed,
        devTrace: developerMode,
      });
      setSessionId(output.session.id);
      recordDeveloperTurn(output.developerConsole);
      await renderRunnerMessages(output.messages, output.brief);
      setSuggestions(output.suggestions ?? []);
      setPlanOptions(output.planOptions ?? []);
    } catch (error) {
      console.error("Conversation request failed", error);
      setIsTyping(false);
      addMsg({
        type: "text",
        sender: "sit",
        text: "I couldn't complete that request. Please try again in a moment.",
      });
    } finally {
      setLocked(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-[hsl(240,12%,3%)] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,hsl(250_80%_60%_/_0.07),transparent)]" />

      <div
        className="w-full max-w-[430px] h-[100dvh] flex flex-col relative z-10 border-x border-white/[0.04] shadow-2xl"
        style={{ background: "hsl(240 10% 4% / 0.7)", backdropFilter: "blur(24px)" }}
      >
        {/* Header */}
        <header
          className="flex-none px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]"
          style={{ background: "hsl(240 10% 4% / 0.85)", backdropFilter: "blur(16px)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-none">
              <span className="text-primary font-bold text-sm leading-none">S</span>
            </div>
            <div>
              <h1 className="font-bold text-white text-[15px] leading-tight tracking-tight">SIT</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-none" />
                <span className="text-[10px] text-white/40 font-semibold tracking-widest uppercase">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* KB indicator */}
            <button
              data-testid="button-kb-status"
              onClick={() => fileInputRef.current?.click()}
              title={`Knowledge base: ${kbCardCount} cards${kbStatus === "uploaded" ? " (custom)" : " (server)"} — click to upload`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/[0.08] hover:border-primary/30 hover:bg-primary/10 transition-all group"
            >
              <Database className="w-3 h-3 text-white/30 group-hover:text-primary/60 transition-colors" />
              <span className="text-[10px] text-white/25 group-hover:text-white/50 font-medium transition-colors">
                {kbStatus === "loading" ? "..." : `${kbCardCount}`}
              </span>
              {kbStatus === "uploaded" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-none" />
              )}
            </button>

            <span className="text-[10px] text-white/20 tracking-widest font-semibold uppercase hidden sm:block">Don't Just SIT.</span>

            {/* Upload button */}
            <button
              data-testid="button-upload-kb"
              onClick={() => fileInputRef.current?.click()}
              title="Upload knowledge base (.xlsx)"
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/[0.08] hover:border-primary/30 hover:bg-primary/10 transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-white/30 hover:text-primary/60" />
            </button>

            {isDevBuild && (
              <button
                data-testid="button-developer-mode"
                onClick={toggleDeveloperMode}
                title="Developer Mode"
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                  developerMode
                    ? "border-amber-300/50 bg-amber-300/10"
                    : "border-white/[0.08] hover:border-amber-300/30 hover:bg-amber-300/10"
                }`}
              >
                <Bug className={`w-3.5 h-3.5 ${developerMode ? "text-amber-200" : "text-white/30"}`} />
              </button>
            )}
          </div>
        </header>

        {/* KB upload banner */}
        <AnimatePresence>
          {kbBannerVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 py-2.5 flex items-center justify-between bg-emerald-500/10 border-b border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[12px] text-emerald-300 font-medium">
                    Knowledge base updated — {kbCardCount} cards loaded
                  </span>
                </div>
                <button
                  onClick={() => setKbBannerVisible(false)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          data-testid="input-file-upload"
          onChange={handleFileChange}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3 scroll-smooth">
          <AnimatePresence initial={false}>
            {messages.map(msg => {
              if (msg.type === "brief") {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="self-start w-[92%]"
                  >
                    <BriefCard brief={msg.brief} />
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className={`max-w-[82%] ${msg.sender === "sit" ? "self-start" : "self-end"}`}
                >
                  <div
                    className={`px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed whitespace-pre-line ${
                      msg.sender === "sit"
                        ? "bg-primary/[0.13] text-white border border-primary/[0.18] rounded-tl-sm"
                        : "text-white border border-white/[0.08] rounded-tr-sm"
                    }`}
                    style={msg.sender === "user" ? { background: "hsl(240 10% 12% / 0.9)" } : {}}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              );
            })}

            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="self-start"
              >
                <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-primary/[0.1] border border-primary/[0.15] flex gap-1.5 items-center">
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/50"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.75, delay, ease: "easeInOut" }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Plan buttons */}
          {planOptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="flex flex-col gap-2 self-start w-[92%] mt-1"
            >
              {planOptions.map(plan => (
                <button
                  key={plan}
                  data-testid={`plan-${plan}`}
                  onClick={() => handleSend(plan)}
                  className="w-full py-3.5 px-5 rounded-xl border border-primary/20 text-white/85 font-medium hover:bg-primary/10 hover:border-primary/35 hover:text-white active:scale-[0.98] transition-all flex items-center justify-between text-[14px]"
                  style={{ background: "hsl(250 80% 60% / 0.07)" }}
                >
                  <span>{plan}</span>
                  <span className="text-primary/50 text-base">→</span>
                </button>
              ))}
            </motion.div>
          )}

          <div ref={endRef} />
        </div>

        {isDevBuild && developerMode && developerTurns.length > 0 && (
          <DeveloperConsole
            turns={developerTurns}
            selectedId={selectedDeveloperTurnId}
            onSelect={setSelectedDeveloperTurnId}
            onExport={exportDeveloperConversation}
          />
        )}

        {/* Input area */}
        <div
          className="flex-none border-t border-white/[0.06]"
          style={{ background: "hsl(240 10% 4% / 0.9)", backdropFilter: "blur(16px)" }}
        >
          {/* Suggestion chips */}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-3 pb-0 overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pb-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      data-testid={`suggestion-${s.replace(/\s+/g, "-").toLowerCase()}`}
                      disabled={locked}
                      onClick={() => handleSend(s)}
                      className="px-3.5 py-2 rounded-full text-[13px] font-medium border border-white/[0.1] text-white/70 hover:text-white hover:border-white/20 hover:bg-white/5 active:scale-95 transition-all disabled:opacity-30"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text input row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={onKey}
              disabled={locked}
              placeholder="Type a message..."
              data-testid="input-message"
              className="flex-1 rounded-full px-5 py-3 text-[14.5px] text-white placeholder:text-white/20 outline-none transition-all disabled:opacity-30 border"
              style={{
                background: "hsl(240 10% 9%)",
                borderColor: "hsl(240 10% 16%)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "hsl(250 80% 60% / 0.4)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "hsl(240 10% 16%)"; }}
            />
            <button
              onClick={() => handleSend(inputValue)}
              disabled={!inputValue.trim() || locked}
              data-testid="button-send"
              className="w-11 h-11 rounded-full flex items-center justify-center flex-none transition-all active:scale-90 disabled:opacity-25"
              style={{
                background: "hsl(250 80% 60%)",
                boxShadow: inputValue.trim() && !locked ? "0 0 20px hsl(250 80% 60% / 0.35)" : "none",
              }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
