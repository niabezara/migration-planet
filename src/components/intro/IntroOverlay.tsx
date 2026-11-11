"use client";

import { useEffect, useState } from "react";
import { useIntroStore } from "./introState";

/** How long the title card lingers after the scene becomes interactive. */
const TITLE_LINGER_MS = 1500;
type TitleState = "hidden" | "shown" | "leaving";

/**
 * DOM layer of the intro: the title card and the skip control.
 * Driven by the coarse intro stage only (a handful of renders per intro).
 */
export function IntroOverlay() {
  const stage = useIntroStore((s) => s.stage);
  const skip = useIntroStore((s) => s.skip);
  const [title, setTitle] = useState<TitleState>("hidden");

  useEffect(() => {
    if (stage === "title") {
      const id = setTimeout(() => setTitle("shown"), 0);
      return () => clearTimeout(id);
    }
    if (stage === "playing" || stage === "pending") {
      const id = setTimeout(() => setTitle("hidden"), 0);
      return () => clearTimeout(id);
    }
    // done: let the title breathe, then clear the frame before the interface rises.
    const id = setTimeout(() => setTitle((t) => (t === "shown" ? "leaving" : t)), TITLE_LINGER_MS);
    return () => clearTimeout(id);
  }, [stage]);

  const cinematic = stage === "playing" || stage === "title";

  return (
    <>
      <div className="intro-title" data-state={title} aria-hidden={title !== "shown"}>
        <h2 className="intro-title__main">The Human Journey</h2>
        <div className="intro-title__rule" />
        <p className="intro-title__sub">300,000 years. One species.</p>
      </div>

      {cinematic && (
        <button className="intro-skip" onClick={skip}>
          Skip intro
          <span className="intro-skip__key">Esc</span>
        </button>
      )}
    </>
  );
}
