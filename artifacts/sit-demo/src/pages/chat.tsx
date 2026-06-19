import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Check, Send } from "lucide-react";

type Sender = "sit" | "user";

interface Message {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
}

const QUESTIONS = [
  {
    id: "purpose",
    text: "Why are you coming to Koh Phangan?",
    options: ["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "I'm not sure yet"],
    multi: false,
  },
  {
    id: "duration",
    text: "How long are you staying?",
    options: ["3–5 days", "1 week", "2–4 weeks", "1–3 months", "Long-term"],
    multi: false,
  },
  {
    id: "scooter",
    text: "Do you ride a scooter?",
    options: ["Yes", "No", "I'm learning", "I prefer not to"],
    multi: false,
  },
  {
    id: "sociability",
    text: "How social do you want to be?",
    options: ["Mostly alone", "Balanced", "Very social"],
    multi: false,
  },
  {
    id: "avoidances",
    text: "What do you want to avoid?",
    options: ["Tourist traps", "Feeling lonely", "Wasting money", "Wrong area", "Unsafe wellness experiences", "Bad parties"],
    multi: true,
  }
];

export default function ChatScreen() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(-1);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [multiSelectDraft, setMultiSelectDraft] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessage = (sender: Sender, text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), sender, text, timestamp: new Date() }]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Initial flow
    const startFlow = async () => {
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 1000));
      setIsTyping(false);
      addMessage("sit", "Hey, I'm SIT. Before I recommend anything, I need to understand what kind of Koh Phangan you're looking for.");
      
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 1200));
      setIsTyping(false);
      addMessage("sit", QUESTIONS[0].text);
      setCurrentQuestionIdx(0);
    };
    startFlow();
  }, []);

  const handleOptionSelect = async (option: string) => {
    const question = QUESTIONS[currentQuestionIdx];
    
    if (question.multi) {
      if (multiSelectDraft.includes(option)) {
        setMultiSelectDraft(prev => prev.filter(o => o !== option));
      } else {
        setMultiSelectDraft(prev => [...prev, option]);
      }
      return;
    }

    // Single select flow
    setAnswers(prev => ({ ...prev, [question.id]: option }));
    addMessage("user", option);
    setCurrentQuestionIdx(-1); // Hide options

    await proceedToNext(question.id, option);
  };

  const handleMultiConfirm = async () => {
    if (multiSelectDraft.length === 0) return;
    const question = QUESTIONS[currentQuestionIdx];
    
    const ansText = multiSelectDraft.join(", ");
    setAnswers(prev => ({ ...prev, [question.id]: multiSelectDraft }));
    addMessage("user", ansText);
    setCurrentQuestionIdx(-1);

    await proceedToNext(question.id, multiSelectDraft);
  };

  const proceedToNext = async (lastQuestionId: string, lastAnswer: string | string[]) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, 1200));
    
    const nextIdx = QUESTIONS.findIndex(q => q.id === lastQuestionId) + 1;
    
    if (nextIdx < QUESTIONS.length) {
      setIsTyping(false);
      addMessage("sit", QUESTIONS[nextIdx].text);
      setCurrentQuestionIdx(nextIdx);
    } else {
      // Recommendation phase
      await generateRecommendations({ ...answers, [lastQuestionId]: lastAnswer });
    }
  };

  const generateRecommendations = async (finalAnswers: Record<string, string | string[]>) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, 2000));
    
    const recs: string[] = [];

    // Scooter logic
    const scooterAns = finalAnswers.scooter as string;
    if (scooterAns === "No" || scooterAns === "I prefer not to") {
      recs.push("Since you're not riding a scooter, I'd keep you in Haad Rin, Srithanu, or Thong Sala — all walkable coastal areas. Remote spots can turn transport costs into a real budget drain fast.");
    }

    // Purpose logic
    const purposeAns = finalAnswers.purpose as string;
    if (purposeAns === "Wellness") {
      recs.push("Koh Phangan has hundreds of wellness offerings — but quality varies wildly. Before you book anything, ask what the facilitator's background is. Not every yoga class or ceremony is what it claims to be. I can help you filter the real ones.");
    } else if (purposeAns === "Music & parties") {
      recs.push("Most people come for Full Moon. Most leave wishing they'd planned more. Koh Phangan's music scene runs every night of the month — sunset gatherings, underground venues, and intimate DJ sets in the jungle. Build the trip around the vibe, not the date.");
    } else if (purposeAns === "Romance") {
      recs.push("Hinkong is your spot. At low tide, sunset picnics on the flats. At high tide, SUP out at golden hour, then cocktails watching the sky turn. It's one of those places that actually delivers.");
    } else if (purposeAns === "Remote work") {
      recs.push("Fair warning — your first 2–3 weeks here will wreck your productivity. There's just too much happening. The people who make it work long-term build a routine around it. Give yourself permission to settle in before you expect output.");
    } else if (purposeAns === "Community") {
      recs.push("The easiest way in is through recurring activities — a regular yoga class, a coworking space, a café you keep going back to. Women's circles, beach sports, and sunset gatherings all build fast. Show up consistently and you'll know people by week two.");
    } else if (purposeAns === "Nature") {
      recs.push("Skip the Instagram beaches — they're crowded and overrated. The jungle hike to the viewpoint is underrated. And there are two or three genuinely swimmable beaches that most visitors never find. I'll point you there.");
    } else if (purposeAns === "I'm not sure yet") {
      recs.push("That's actually the best way to arrive. Koh Phangan rewards people who don't have a fixed agenda. Give yourself the first 2–3 days to feel it out before you commit to any plan.");
    }

    // Duration note
    const durationAns = finalAnswers.duration as string;
    if (durationAns === "3–5 days") {
      recs.push("With only 3–5 days, don't try to cover the whole island. Pick one area and go deep.");
    } else if (durationAns === "1–3 months" || durationAns === "Long-term") {
      recs.push("Long stays are a different game. The first month feels like a vacation. The second month is when real life starts.");
    }

    recs.push("Want me to build your plan?");

    for (const rec of recs) {
      setIsTyping(false);
      addMessage("sit", rec);
      
      if (rec !== recs[recs.length - 1]) {
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    
    setCurrentQuestionIdx(999); // show final plans
  };

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-black/95 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      
      <div className="w-full max-w-[430px] h-[100dvh] flex flex-col relative z-10 bg-background/50 backdrop-blur-xl border-x border-white/5 shadow-2xl">
        {/* Header */}
        <header className="flex-none px-6 py-4 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 text-primary font-semibold">
              S
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight tracking-tight">SIT</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-white/50 font-medium tracking-wide uppercase">Online</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-white/40 tracking-wider font-medium">
            Don't Just SIT.
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`max-w-[85%] ${msg.sender === "sit" ? "self-start" : "self-end"}`}
              >
                <div className={`
                  px-4 py-3 rounded-2xl text-[15px] leading-relaxed
                  ${msg.sender === "sit" 
                    ? "bg-primary/20 text-white border border-primary/30 rounded-tl-sm shadow-[0_0_15px_rgba(var(--color-primary)/0.1)]" 
                    : "bg-white/10 text-white border border-white/5 rounded-tr-sm"}
                `}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="self-start max-w-[85%]"
              >
                <div className="px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 rounded-tl-sm flex gap-1 items-center h-[46px]">
                  <motion.div className="w-1.5 h-1.5 bg-primary/60 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
                  <motion.div className="w-1.5 h-1.5 bg-primary/60 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
                  <motion.div className="w-1.5 h-1.5 bg-primary/60 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input/Options Area */}
        <div className="flex-none p-4 bg-background/80 backdrop-blur-md border-t border-white/5 min-h-[100px]">
          {currentQuestionIdx >= 0 && currentQuestionIdx < QUESTIONS.length && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap gap-2">
                {QUESTIONS[currentQuestionIdx].options.map((opt) => {
                  const isSelected = QUESTIONS[currentQuestionIdx].multi && multiSelectDraft.includes(opt);
                  return (
                    <button
                      key={opt}
                      data-testid={`option-${opt}`}
                      onClick={() => handleOptionSelect(opt)}
                      className={`
                        px-4 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95
                        ${isSelected 
                          ? "bg-white text-black" 
                          : "bg-white/5 text-white/90 border border-white/10 hover:bg-white/10"}
                      `}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              
              {QUESTIONS[currentQuestionIdx].multi && (
                <div className="flex justify-end mt-2">
                  <button
                    data-testid="button-confirm-multi"
                    disabled={multiSelectDraft.length === 0}
                    onClick={handleMultiConfirm}
                    className={`
                      px-6 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2
                      ${multiSelectDraft.length > 0
                        ? "bg-primary text-white shadow-[0_0_15px_rgba(var(--color-primary)/0.3)] hover:bg-primary/90" 
                        : "bg-white/5 text-white/30 cursor-not-allowed"}
                    `}
                  >
                    That's it, show me <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {currentQuestionIdx === 999 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              {["3-Day Plan", "7-Day Plan", "1-Month Stay"].map((plan) => (
                <button
                  key={plan}
                  data-testid={`plan-${plan}`}
                  onClick={() => setLocation("/tagline")}
                  className="w-full py-4 rounded-xl bg-primary/10 border border-primary/30 text-white font-medium hover:bg-primary/20 transition-all flex items-center justify-between px-6"
                >
                  {plan}
                  <Check className="w-5 h-5 text-primary" />
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
