import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TaglineScreen() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-black relative overflow-hidden px-6">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/15 via-black to-black pointer-events-none" />

      <div className="relative z-10 w-full max-w-[430px] flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2"
        >
          Google knows places.
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-primary mb-10"
        >
          SIT knows reality.
        </motion.div>

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1, ease: "easeInOut" }}
          className="w-16 h-px bg-white/20 mb-10"
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="text-lg text-white/70 mb-12 font-medium tracking-wide"
        >
          Let's check it in SIT.
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 2 }}
          onClick={() => setLocation("/")}
          data-testid="button-start-over"
          className="flex items-center gap-2 px-8 py-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Start Over
        </motion.button>
      </div>
    </div>
  );
}
