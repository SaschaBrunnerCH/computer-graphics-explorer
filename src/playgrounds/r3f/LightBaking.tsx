import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";

/**
 * Baked vs. dynamic lighting on one small room. "Dynamic" runs a real point
 * light with a live shadow map. "Baked" replaces all of that with lighting
 * pre-drawn into the floor and wall textures (warm pools, soft blob shadows,
 * a hint of red color bleed) — nearly free per frame, but frozen: the lamp
 * slider deliberately does nothing because the lamp no longer exists.
 */

type Mode = "baked" | "dynamic";

const INITIAL = { mode: "baked" as Mode, lightX: 0 };

/** Where the lamp sat when the "bake" was painted (and the dynamic default). */
const LAMP = { x: 0, y: 2.3, z: 0.6 };

/** Floor footprint: x ∈ [-3, 3], z ∈ [-2.5, 2.5]. Back wall at z = -2.5. */
const FLOOR_W = 6;
const FLOOR_D = 5;
const WALL_H = 2.6;

const OBJECTS: {
  kind: "box" | "sphere";
  x: number;
  z: number;
  size: [number, number, number];
  color: string;
}[] = [
  { kind: "box", x: -1.3, z: 0.2, size: [0.9, 0.9, 0.9], color: "#c0392b" },
  { kind: "box", x: 1.2, z: -1.0, size: [1, 1.2, 1], color: "#b9a27c" },
  { kind: "sphere", x: 0.4, z: 1.3, size: [0.42, 0.42, 0.42], color: "#7f8c9b" },
];

const TEX_SIZE = 512;

function floorU(x: number): number {
  return ((x + FLOOR_W / 2) / FLOOR_W) * TEX_SIZE;
}
function floorV(z: number): number {
  return ((z + FLOOR_D / 2) / FLOOR_D) * TEX_SIZE;
}

function softBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgba: string,
): void {
  const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  g.addColorStop(0, rgba);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Hand-painted "lightmap": warm pool under the lamp, blob shadows, red bleed. */
function makeFloorBake(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const cx = floorU(LAMP.x);
  const cy = floorV(LAMP.z);
  const warm = ctx.createRadialGradient(cx, cy, 30, cx, cy, TEX_SIZE * 0.85);
  warm.addColorStop(0, "#f3e0b6");
  warm.addColorStop(0.45, "#9c8861");
  warm.addColorStop(1, "#39352d");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Soft blob shadows under each object, pushed slightly away from the lamp.
  for (const obj of OBJECTS) {
    const dx = obj.x - LAMP.x;
    const dz = obj.z - LAMP.z;
    const len = Math.hypot(dx, dz) || 1;
    const sx = floorU(obj.x) + (dx / len) * 18;
    const sy = floorV(obj.z) + (dz / len) * 18;
    softBlob(ctx, sx, sy, obj.size[0] * 95, "rgba(10, 8, 5, 0.62)");
  }

  // A hint of color bleed: the red crate bounces warm red onto nearby floor.
  softBlob(ctx, floorU(-0.78), floorV(0.32), 80, "rgba(200, 52, 32, 0.30)");

  return canvas;
}

/** Matching bake for the back wall: bright near the lamp, dark corners. */
function makeWallBake(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE / 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const cx = floorU(LAMP.x);
  const cy = canvas.height * 0.18;
  const warm = ctx.createRadialGradient(cx, cy, 20, cx, cy, TEX_SIZE * 0.8);
  warm.addColorStop(0, "#e8d3a8");
  warm.addColorStop(0.5, "#8a7757");
  warm.addColorStop(1, "#332f29");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The tall crate near the wall blocks the lamp — bake its soft wall shadow.
  softBlob(ctx, floorU(1.2), canvas.height * 0.82, 95, "rgba(10, 8, 5, 0.5)");

  return canvas;
}

function useBakedTexture(make: () => HTMLCanvasElement): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(make());
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [make]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export default function LightBaking(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>(INITIAL.mode);
  const [lightX, setLightX] = useState(INITIAL.lightX);

  const floorTex = useBakedTexture(makeFloorBake);
  const wallTex = useBakedTexture(makeWallBake);

  const baked = mode === "baked";

  const caption = baked
    ? "Lighting was painted into the textures ahead of time: a warm pool, soft blob shadows, even a hint of red bounce beside the crate — and it costs ~0 ms per frame. But it is frozen forever: the lamp slider does nothing, because the lamp no longer exists (the dim marker shows where it sat when the bake ran)."
    : "A real point light with a live shadow map — slide the lamp and the shadows follow instantly. The price: a shadow pass plus per-pixel lighting every single frame, while the baked room gets its (identical-looking, but frozen) lighting for free.";

  return (
    <PlaygroundFrame
      title="Baked vs. dynamic lighting"
      caption={caption}
      onReset={() => {
        setMode(INITIAL.mode);
        setLightX(INITIAL.lightX);
      }}
      controls={
        <>
          <SegmentedControl<Mode>
            label="Lighting"
            options={[
              { value: "baked", label: "Baked" },
              { value: "dynamic", label: "Dynamic" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <SliderControl
            label="Lamp position (X)"
            value={lightX}
            min={-2.5}
            max={2.5}
            step={0.1}
            onInput={setLightX}
            format={(v) => `${v.toFixed(1)} m`}
          />
        </>
      }
    >
      <Canvas shadows camera={{ position: [3.4, 3.2, 6.2], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#14181d"]} />

        {baked ? (
          // Stand-in for the light probes a real engine would bake for movable
          // objects — the static surfaces below get the painted lightmaps.
          <hemisphereLight args={["#ffe7c4", "#3a352c", 0.65]} />
        ) : (
          <>
            <ambientLight intensity={0.12} />
            <pointLight
              position={[lightX, LAMP.y, LAMP.z]}
              intensity={28}
              decay={1.8}
              color="#ffedc8"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.005}
            />
          </>
        )}

        {/* Lamp marker: live bulb in dynamic mode, dim ghost of the baked one. */}
        <mesh position={baked ? [LAMP.x, LAMP.y, LAMP.z] : [lightX, LAMP.y, LAMP.z]}>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshBasicMaterial color={baked ? "#6b6457" : "#ffe9b0"} />
        </mesh>

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[FLOOR_W, FLOOR_D]} />
          {baked ? (
            <meshBasicMaterial map={floorTex} />
          ) : (
            <meshStandardMaterial color="#a89f90" roughness={0.95} />
          )}
        </mesh>
        {/* Back wall */}
        <mesh position={[0, WALL_H / 2, -FLOOR_D / 2]} receiveShadow>
          <planeGeometry args={[FLOOR_W, WALL_H]} />
          {baked ? (
            <meshBasicMaterial map={wallTex} />
          ) : (
            <meshStandardMaterial color="#a89f90" roughness={0.95} />
          )}
        </mesh>

        {OBJECTS.map((obj) =>
          obj.kind === "box" ? (
            <mesh
              key={`${obj.x}-${obj.z}`}
              position={[obj.x, obj.size[1] / 2, obj.z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={obj.size} />
              <meshStandardMaterial color={obj.color} roughness={0.85} />
            </mesh>
          ) : (
            <mesh
              key={`${obj.x}-${obj.z}`}
              position={[obj.x, obj.size[0], obj.z]}
              castShadow
              receiveShadow
            >
              <sphereGeometry args={[obj.size[0], 32, 24]} />
              <meshStandardMaterial color={obj.color} roughness={0.4} />
            </mesh>
          ),
        )}

        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
