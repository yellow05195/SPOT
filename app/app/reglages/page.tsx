"use client";

import { useEffect, useState } from "react";
import { Reveal } from "@/components/Reveal";

/** Settings: the "typeset names" accessibility option, sounds, and the light. Nothing else. */
export default function SettingsPage() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [son, setSon] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem("spot:theme");
      if (t === "light" || t === "dark") setTheme(t);
      setSon(localStorage.getItem("spot:son") === "1");
    } catch {}
  }, []);

  function apply(next: { theme?: typeof theme; son?: boolean }) {
    try {
      if (next.theme !== undefined) {
        setTheme(next.theme);
        if (next.theme === "system") {
          localStorage.removeItem("spot:theme");
          document.documentElement.dataset.theme = "light";
        } else {
          localStorage.setItem("spot:theme", next.theme);
          document.documentElement.dataset.theme = next.theme;
        }
      }
      if (next.son !== undefined) {
        setSon(next.son);
        localStorage.setItem("spot:son", next.son ? "1" : "0");
      }
    } catch {}
  }

  return (
    <div className="page">
      <Reveal>
        <p className="eyebrow">settings</p>
        <h1 style={{ marginTop: ".4rem" }}>A few things you can change</h1>
        <div style={{ maxWidth: "48ch", marginTop: "1.4rem", display: "grid", gap: "1.4rem" }}>
          <label style={{ display: "flex", gap: ".8rem", alignItems: "flex-start" }}>
            <input type="checkbox" checked={son} onChange={(e) => apply({ son: e.target.checked })} />
            <span>
              <strong>Sounds of the shot</strong>
              <br />
              <span className="legend" style={{ fontSize: ".9rem" }}>
                the shutter click and the thud of the stamp. Off by default.
              </span>
            </span>
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>
              <strong>Light</strong>
            </legend>
            <div style={{ display: "flex", gap: "1rem", marginTop: ".4rem", flexWrap: "wrap" }}>
              {(["system", "light", "dark"] as const).map((t) => (
                <label key={t} style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                  <input type="radio" name="theme" checked={theme === t} onChange={() => apply({ theme: t })} />
                  {t === "system" ? "default (daylight)" : t === "light" ? "daylight" : "dusk"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Reveal>
    </div>
  );
}
