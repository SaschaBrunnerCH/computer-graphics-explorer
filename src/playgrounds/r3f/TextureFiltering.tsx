import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";

type FilterMode = "nearest" | "bilinear" | "trilinear" | "anisotropic";

const INITIAL = {
  mode: "trilinear" as FilterMode,
  anisotropy: 8,
  mipmaps: true,
  drift: true,
};

const FILTER_OPTIONS = [
  { value: "nearest", label: "Near" },
  { value: "bilinear", label: "Bilin" },
  { value: "trilinear", label: "Trilin" },
  { value: "anisotropic", label: "Aniso" },
] as const;

/**
 * High-frequency checkerboard drawn once to an offscreen 2D canvas: 32×32
 * checker cells plus a few saturated lines so moiré bands are vivid.
 */
function makeCheckerCanvas(): HTMLCanvasElement {
  const size = 512;
  const cells = 32;
  const cell = size / cells;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ece7da" : "#1d2229";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  // Colored stripes make the aliasing colorful instead of just gray noise.
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#e23d2e";
  for (const y of [64, 192, 320, 448]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2f7fe0";
  for (const x of [128, 384]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  // Corner-to-corner diagonal tiles seamlessly under RepeatWrapping.
  ctx.strokeStyle = "#f2b724";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.stroke();
  return canvas;
}

function CheckerGround({
  mode,
  anisotropy,
  mipmaps,
}: {
  mode: FilterMode;
  anisotropy: number;
  mipmaps: boolean;
}): React.JSX.Element {
  const gl = useThree((state) => state.gl);
  const canvas = useMemo(() => makeCheckerCanvas(), []);
  // Mipmaps only exist for the modes whose minFilter can read them.
  const wantsMipmaps = mipmaps && (mode === "trilinear" || mode === "anisotropic");

  // Toggling generateMipmaps reliably requires a fresh GPU texture, so any
  // setting change recreates it from the same (cached) canvas — cheap, and
  // StrictMode-safe because disposal is tied to the texture instance below.
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(48, 96);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = wantsMipmaps;
    tex.magFilter = mode === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
    tex.minFilter =
      mode === "nearest"
        ? THREE.NearestFilter
        : wantsMipmaps
          ? THREE.LinearMipmapLinearFilter
          : THREE.LinearFilter;
    tex.anisotropy =
      mode === "anisotropic" ? Math.min(anisotropy, gl.capabilities.getMaxAnisotropy()) : 1;
    return tex;
  }, [canvas, mode, anisotropy, wantsMipmaps, gl]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -170]}>
      <planeGeometry args={[240, 400]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

/** Keeps the camera low over the plane, optionally dollying slowly back and forth. */
function CameraRig({ drift }: { drift: boolean }): null {
  useFrame(({ camera, clock }) => {
    const z = drift ? Math.sin(clock.getElapsedTime() * 0.3) * 5 : 0;
    camera.position.set(0, 1.6, z);
    camera.lookAt(0, 0.6, -80);
  });
  return null;
}

function buildCaption(mode: FilterMode, mipmaps: boolean, anisotropy: number): string {
  switch (mode) {
    case "nearest":
      return "Nearest: every pixel snaps to a single texel — crunchy up close, and with no mipmaps the distant checkers alias into noisy moiré.";
    case "bilinear":
      return "Bilinear: averages the 4 nearest texels, smooth up close — but with no mipmaps the distance is still sampled too sparsely, so moiré bands shimmer near the horizon.";
    case "trilinear":
      return mipmaps
        ? "Trilinear: blends between mipmap levels, so the moiré is gone — but the floor blurs early at grazing angles. Try Anisotropic to sharpen it."
        : "Mipmaps off: distant checkers alias into violent shimmering moiré bands — the full-resolution texture is sampled too sparsely. Flip mipmaps back on to calm it.";
    case "anisotropic":
      return mipmaps
        ? `Anisotropic ${anisotropy}×: takes up to ${anisotropy} samples along the squashed view direction, keeping grazing angles sharp where plain trilinear blurs.`
        : "Anisotropic filtering needs mipmaps — with them off you are back to raw moiré shimmer at distance.";
  }
}

export default function TextureFiltering(): React.JSX.Element {
  const [mode, setMode] = useState<FilterMode>(INITIAL.mode);
  const [anisotropy, setAnisotropy] = useState(INITIAL.anisotropy);
  const [mipmaps, setMipmaps] = useState(INITIAL.mipmaps);
  const [drift, setDrift] = useState(INITIAL.drift);

  return (
    <PlaygroundFrame
      title="Texture filtering on an endless checkerboard"
      caption={buildCaption(mode, mipmaps, anisotropy)}
      onReset={() => {
        setMode(INITIAL.mode);
        setAnisotropy(INITIAL.anisotropy);
        setMipmaps(INITIAL.mipmaps);
        setDrift(INITIAL.drift);
      }}
      controls={
        <>
          <SegmentedControl
            label="Filtering"
            options={FILTER_OPTIONS}
            value={mode}
            onChange={setMode}
          />
          <SliderControl
            label="Anisotropy"
            value={anisotropy}
            min={1}
            max={16}
            onInput={setAnisotropy}
            format={(v) => `${v}×`}
          />
          <SwitchControl label="Mipmaps" checked={mipmaps} onChange={setMipmaps} />
          <SwitchControl label="Camera drift" checked={drift} onChange={setDrift} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1.6, 0], fov: 60, near: 0.1, far: 600 }} dpr={[1, 2]}>
        <color attach="background" args={["#10141a"]} />
        <CheckerGround mode={mode} anisotropy={anisotropy} mipmaps={mipmaps} />
        <CameraRig drift={drift} />
      </Canvas>
    </PlaygroundFrame>
  );
}
