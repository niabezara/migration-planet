"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import type { CameraFocus } from "@/types/migration";
import { INTRO } from "@/config/intro";
import { OVERVIEW_CAMERA } from "@/config/camera";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { applyCameraFocus, readCameraFocus, unwrapTarget } from "@/components/globe/cameraRig";
import { introState, prefersReducedMotion, useIntroStore } from "./introState";

/**
 * The opening sequence, played in real time inside the existing scene.
 *
 * One GSAP master timeline animates the camera (in lat/lng/distance), the
 * planet exposure, the sun angle and the East-African origin light. Route
 * awakening is not animated here at all: each route bursts out of its origin
 * when the shared story clock passes its INTRO.routeAwakenAt time, which the
 * particle shader evaluates directly.
 *
 * Mounted inside <Suspense>, so it starts only once the Earth textures are ready.
 */
export function IntroSequence() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { update: () => void } | null;
  const clock = useThree((s) => s.clock);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const setStage = useIntroStore.getState().setStage;
    const apply = (f: CameraFocus) => applyCameraFocus(camera, controls, f);

    const settleInteractive = () => {
      introState.sunAngle = null;
      introState.originGlow = 0;
      setStage("done");
    };

    const play = (initial: boolean) => {
      timeline.current?.kill();
      if (initial && !useIntroStore.getState().autoplay) {
        // Deep link: no cinematic and no reset of the linked year/route.
        introState.storyStart = clock.elapsedTime - INTRO.duration;
        introState.exposure = 0;
        apply(OVERVIEW_CAMERA);
        gsap.to(introState, { exposure: 1, duration: 1.2, ease: "none" });
        settleInteractive();
        return;
      }
      const history = useHistoryStore.getState();
      history.pause();
      history.enterOverview();
      history.selectRoute(null);

      if (prefersReducedMotion()) {
        // No choreography: final composition, everything already awake.
        introState.storyStart = clock.elapsedTime - INTRO.duration;
        introState.exposure = 0;
        apply(OVERVIEW_CAMERA);
        gsap.to(introState, { exposure: 1, duration: 1.2, ease: "none" });
        settleInteractive();
        return;
      }

      introState.storyStart = clock.elapsedTime;
      introState.exposure = 0;
      introState.sunAngle = INTRO.sun.start;
      introState.originGlow = 0;
      introState.hero = 0;
      const C = INTRO.camera;
      const cam: CameraFocus = { ...C.start };
      apply(cam);
      setStage("playing");

      const onUpdate = () => apply(cam);
      const keep = (f: CameraFocus) => ({ lat: f.lat, lng: f.lng, distance: f.distance });
      const o = INTRO.origin;

      timeline.current = gsap
        .timeline()
        // Scene 1: approach from deep space.
        .to(cam, { ...keep(C.approach), duration: C.approach.at, ease: "power2.inOut", onUpdate }, 0)
        .to(introState, { exposure: 1, duration: INTRO.exposure.to - INTRO.exposure.from, ease: "power2.inOut" }, INTRO.exposure.from)
        .to(introState, { sunAngle: INTRO.sun.mid, duration: INTRO.sun.midAt - 0.2, ease: "sine.inOut" }, 0.2)
        // Scene 2: drift onto East Africa; warm light rises.
        .to(cam, { ...keep(C.origin), duration: C.origin.at - C.approach.at, ease: "sine.inOut", onUpdate }, C.approach.at)
        // Africa fully in daylight before the first stream is released.
        .to(introState, { sunAngle: INTRO.sun.end, duration: INTRO.sun.endAt - INTRO.sun.midAt, ease: "sine.inOut" }, INTRO.sun.midAt)
        .to(introState, { originGlow: 1, duration: o.peakAt - o.riseAt, ease: "power2.in" }, o.riseAt)
        // Scene 3 happens in the particle shader (story clock). The light hands over to the streams.
        .to(introState, { originGlow: 0, duration: o.fadeOutAt - o.peakAt, ease: "power2.out" }, o.peakAt)
        // Scene 4: pull back to the whole planet, title, then hand control to the user.
        .to(cam, { ...keep(C.reveal), duration: C.reveal.at - C.origin.at, ease: "power3.inOut", onUpdate }, C.origin.at)
        .to(introState, { hero: 1, duration: INTRO.hero.rise, ease: "power2.out" }, INTRO.hero.riseAt)
        .to(introState, { hero: 0, duration: INTRO.hero.fall, ease: "power1.inOut" }, INTRO.hero.fallAt)
        .call(() => setStage("title"), [], INTRO.titleAt)
        .call(settleInteractive, [], INTRO.duration);
    };

    const skip = () => {
      const tl = timeline.current;
      if (!tl) return;
      tl.kill();
      timeline.current = null;
      // Jump the story clock past the awakening so every stream is alive.
      const story = clock.elapsedTime - introState.storyStart;
      if (story < INTRO.duration) introState.storyStart = clock.elapsedTime - INTRO.duration;
      const from = readCameraFocus(camera);
      const cam = { ...from };
      gsap.to(cam, { ...unwrapTarget(from, OVERVIEW_CAMERA), duration: 1.4, ease: "power2.inOut", onUpdate: () => apply(cam) });
      gsap.to(introState, { exposure: 1, originGlow: 0, hero: 0, duration: 0.8, ease: "power1.out" });
      gsap.to(introState, {
        sunAngle: INTRO.sun.end,
        duration: 0.8,
        ease: "power1.out",
        onComplete: () => {
          introState.sunAngle = null;
        },
      });
      setStage("done");
    };

    play(true);
    const unsub = useIntroStore.subscribe((s, prev) => {
      if (s.replayNonce !== prev.replayNonce) play(false);
      else if (s.skipNonce !== prev.skipNonce) skip();
    });
    return () => {
      unsub();
      timeline.current?.kill();
    };
  }, [camera, controls, clock]);

  return null;
}
