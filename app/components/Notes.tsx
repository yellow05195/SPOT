"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Notifications are pinned notes: a card, a pin, handwriting, bottom right. They peel off when done. */
interface Note {
  id: number;
  text: string;
  tone?: "ink" | "red" | "green";
}
const Ctx = createContext<{ note: (text: string, tone?: Note["tone"]) => void }>({ note: () => undefined });

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const note = useCallback((text: string, tone: Note["tone"] = "ink") => {
    const id = Date.now() + Math.random();
    setNotes((n) => [...n, { id, text, tone }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 5200);
  }, []);
  const value = useMemo(() => ({ note }), [note]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" style={{ position: "fixed", right: "1rem", bottom: "4.6rem", display: "grid", gap: "0.75rem", zIndex: 40, maxWidth: "min(320px, 80vw)" }}>
        <AnimatePresence>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              className="pinned"
              initial={{ opacity: 0, y: 12, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              exit={{ opacity: 0, x: 40, rotate: 4, transition: { duration: 0.28 } }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="pin" style={{ left: 8, top: 8, background: n.tone === "green" ? "var(--stamp-green)" : "var(--stamp-red)" }} />
              <p className="hand" style={{ fontSize: "1.3rem", color: n.tone === "green" ? "var(--stamp-green)" : n.tone === "red" ? "var(--stamp-red)" : "var(--ink-blue)" }}>
                {n.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useNotes = () => useContext(Ctx);
