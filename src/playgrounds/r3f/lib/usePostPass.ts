import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";

export interface PostPassContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/**
 * Shared EffectComposer plumbing for the post-processing playgrounds.
 *
 * Builds a composer (RenderPass + whatever `build` returns), takes over the
 * r3f render loop, follows canvas resizes, and disposes everything on
 * unmount (StrictMode-safe: the effect re-runs cleanly on remount).
 *
 * `build` must be referentially stable (module-level or `useCallback([])`),
 * otherwise the composer is rebuilt every render. `onFrame` may change every
 * render (it usually closes over the latest props); it receives the built
 * passes right before each composed frame so callers can sync uniforms/flags.
 */
export function usePostPass<T extends readonly Pass[]>(
  build: (ctx: PostPassContext) => T,
  onFrame?: (passes: T) => void,
): void {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const composerRef = useRef<EffectComposer | null>(null);
  const passesRef = useRef<T | null>(null);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const passes = build({ scene, camera });
    for (const pass of passes) composer.addPass(pass);
    composerRef.current = composer;
    passesRef.current = passes;
    return () => {
      composerRef.current = null;
      passesRef.current = null;
      renderPass.dispose();
      for (const pass of passes) pass.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera, build]);

  // Keep the composer (and every pass via composer.setSize) at canvas size.
  useEffect(() => {
    composerRef.current?.setPixelRatio(gl.getPixelRatio());
    composerRef.current?.setSize(size.width, size.height);
  }, [gl, size.width, size.height]);

  // Priority > 0 takes over the render loop from r3f.
  useFrame(() => {
    const composer = composerRef.current;
    const passes = passesRef.current;
    if (!composer || !passes) return;
    onFrameRef.current?.(passes);
    composer.render();
  }, 1);
}
