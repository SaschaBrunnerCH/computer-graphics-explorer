import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";

/**
 * One small scene, four light types. A segmented control swaps a directional,
 * point, spot, or rect-area light over the same pillars, with each type's
 * defining knobs shown only while that type is active. A small emissive
 * marker (or glowing panel, for the area light) shows where the light is.
 */

// RectAreaLight needs its BRDF lookup tables installed once per app.
RectAreaLightUniformsLib.init();

type LightKind = "directional" | "point" | "spot" | "area";

const INITIAL = {
  kind: "spot" as LightKind,
  azimuth: 35,
  distance: 0, // 0 = no cutoff
  decay: 2,
  coneAngle: 28, // degrees (three's half-angle)
  penumbra: 0.4,
  width: 3,
  height: 2,
};

const KIND_OPTIONS = [
  { value: "directional", label: "Dir" },
  { value: "point", label: "Point" },
  { value: "spot", label: "Spot" },
  { value: "area", label: "Area" },
] as const;

const LIGHT_COLOR = "#fff2dc";
/** Everything aims roughly at the middle of the pillars. */
const AIM: [number, number, number] = [0, 0.5, 0];

function Pillars(): React.JSX.Element {
  const pillars: { x: number; z: number; h: number; w: number }[] = [
    { x: -2.2, z: -1.2, h: 1.6, w: 0.7 },
    { x: 0, z: -2.2, h: 2.4, w: 0.8 },
    { x: 2.3, z: -0.8, h: 1.2, w: 0.7 },
  ];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#8d939c" roughness={0.95} />
      </mesh>
      {pillars.map((p) => (
        <mesh key={`${p.x}-${p.z}`} position={[p.x, p.h / 2, p.z]} castShadow receiveShadow>
          <boxGeometry args={[p.w, p.h, p.w]} />
          <meshStandardMaterial color="#cfc9bd" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0.4, 0.55, 1.3]} castShadow receiveShadow>
        <sphereGeometry args={[0.55, 32, 24]} />
        <meshStandardMaterial color="#c2452f" roughness={0.5} />
      </mesh>
    </>
  );
}

function Gizmo({ position }: { position: [number, number, number] }): React.JSX.Element {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.13, 16, 12]} />
      <meshBasicMaterial color="#ffe9b0" />
    </mesh>
  );
}

function SpotRig({
  position,
  coneAngle,
  penumbra,
}: {
  position: [number, number, number];
  coneAngle: number;
  penumbra: number;
}): React.JSX.Element {
  // The spot light aims at .target, which must itself live in the scene.
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={AIM} />
      <spotLight
        position={position}
        target={target}
        angle={THREE.MathUtils.degToRad(coneAngle)}
        penumbra={penumbra}
        intensity={130}
        decay={2}
        color={LIGHT_COLOR}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0035}
      />
      <Gizmo position={position} />
    </>
  );
}

function AreaRig({
  position,
  width,
  height,
}: {
  position: [number, number, number];
  width: number;
  height: number;
}): React.JSX.Element {
  const lightRef = useRef<THREE.RectAreaLight>(null);
  const panelRef = useRef<THREE.Mesh>(null);
  // Keep the emitting face (and its visible glow panel) aimed at the scene.
  useFrame(() => {
    lightRef.current?.lookAt(...AIM);
    panelRef.current?.lookAt(...AIM);
  });
  return (
    <>
      <rectAreaLight
        ref={lightRef}
        position={position}
        width={width}
        height={height}
        intensity={7}
        color={LIGHT_COLOR}
      />
      <mesh ref={panelRef} position={position}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={LIGHT_COLOR} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function buildCaption(state: typeof INITIAL): string {
  switch (state.kind) {
    case "directional":
      return "Directional: parallel rays from infinitely far away — like the sun. The marker only defines a direction, so lighting and shadows are identical across the whole scene no matter how big it gets.";
    case "point":
      return `Point: a bare bulb radiating equally in all directions. ${
        state.distance === 0
          ? "Distance ∞ means it never cuts off, only fades"
          : `Its light cuts off entirely ${state.distance} m from the bulb`
      }; decay ${state.decay} sets how fast it fades (2 = physically correct inverse-square).`;
    case "spot":
      return `Spot: a flashlight cone — only what falls inside the ${state.coneAngle}° half-angle is lit, leaving a sharp pool of light on the ground. Penumbra ${state.penumbra.toFixed(
        1,
      )} softens the cone's edge from razor-sharp toward a gentle fade.`;
    case "area":
      return "Area: a glowing rectangle like a softbox or a window — broad, soft, flattering light with gentle highlights. WebGL's RectAreaLight casts no shadows, which is why the pillars just lost theirs.";
  }
}

export default function LightTypes(): React.JSX.Element {
  const [kind, setKind] = useState<LightKind>(INITIAL.kind);
  const [azimuth, setAzimuth] = useState(INITIAL.azimuth);
  const [distance, setDistance] = useState(INITIAL.distance);
  const [decay, setDecay] = useState(INITIAL.decay);
  const [coneAngle, setConeAngle] = useState(INITIAL.coneAngle);
  const [penumbra, setPenumbra] = useState(INITIAL.penumbra);
  const [width, setWidth] = useState(INITIAL.width);
  const [height, setHeight] = useState(INITIAL.height);

  const az = (azimuth * Math.PI) / 180;
  const lightPos: [number, number, number] = [4.2 * Math.sin(az), 3.4, 4.2 * Math.cos(az)];

  const caption = buildCaption({
    kind,
    azimuth,
    distance,
    decay,
    coneAngle,
    penumbra,
    width,
    height,
  });

  return (
    <PlaygroundFrame
      title="Four light types, one scene"
      caption={caption}
      onReset={() => {
        setKind(INITIAL.kind);
        setAzimuth(INITIAL.azimuth);
        setDistance(INITIAL.distance);
        setDecay(INITIAL.decay);
        setConeAngle(INITIAL.coneAngle);
        setPenumbra(INITIAL.penumbra);
        setWidth(INITIAL.width);
        setHeight(INITIAL.height);
      }}
      controls={
        <>
          <SegmentedControl<LightKind>
            label="Light type"
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
          />
          <SliderControl
            label="Light angle"
            value={azimuth}
            min={-180}
            max={180}
            step={5}
            onInput={setAzimuth}
            format={(v) => `${v}°`}
          />
          {kind === "point" && (
            <>
              <SliderControl
                label="Distance (cutoff)"
                value={distance}
                min={0}
                max={20}
                step={1}
                onInput={setDistance}
                format={(v) => (v === 0 ? "∞" : `${v} m`)}
              />
              <SliderControl
                label="Decay"
                value={decay}
                min={0}
                max={2}
                step={0.1}
                onInput={setDecay}
                format={(v) => v.toFixed(1)}
              />
            </>
          )}
          {kind === "spot" && (
            <>
              <SliderControl
                label="Cone angle"
                value={coneAngle}
                min={5}
                max={60}
                step={1}
                onInput={setConeAngle}
                format={(v) => `${v}°`}
              />
              <SliderControl
                label="Penumbra"
                value={penumbra}
                min={0}
                max={1}
                step={0.05}
                onInput={setPenumbra}
                format={(v) => v.toFixed(2)}
              />
            </>
          )}
          {kind === "area" && (
            <>
              <SliderControl
                label="Width"
                value={width}
                min={0.5}
                max={6}
                step={0.25}
                onInput={setWidth}
                format={(v) => `${v.toFixed(2)} m`}
              />
              <SliderControl
                label="Height"
                value={height}
                min={0.5}
                max={6}
                step={0.25}
                onInput={setHeight}
                format={(v) => `${v.toFixed(2)} m`}
              />
            </>
          )}
        </>
      }
    >
      <Canvas shadows camera={{ position: [5.5, 4.5, 8], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#171b20"]} />
        <ambientLight intensity={0.12} />

        {kind === "directional" && (
          <>
            <directionalLight
              position={lightPos}
              intensity={2.6}
              color={LIGHT_COLOR}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-7}
              shadow-camera-right={7}
              shadow-camera-top={7}
              shadow-camera-bottom={-7}
              shadow-bias={-0.0025}
            />
            <Gizmo position={lightPos} />
          </>
        )}
        {kind === "point" && (
          <>
            <pointLight
              position={lightPos}
              intensity={70}
              distance={distance}
              decay={decay}
              color={LIGHT_COLOR}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.005}
            />
            <Gizmo position={lightPos} />
          </>
        )}
        {kind === "spot" && (
          <SpotRig position={lightPos} coneAngle={coneAngle} penumbra={penumbra} />
        )}
        {kind === "area" && <AreaRig position={lightPos} width={width} height={height} />}

        <Pillars />
        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={16}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
