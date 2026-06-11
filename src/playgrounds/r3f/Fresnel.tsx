import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Fresnel reflectance, computed by hand in a ShaderMaterial: a sphere and a
 * large "water" plane share one shader that mixes a deep base color with a
 * bright reflection color by F. The camera is constrained to swing low over
 * the plane because grazing angles are where the effect lives.
 */

const INITIAL = { f0: 0.04, boost: 1, fresnel: true, visualize: false };

const VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAG = /* glsl */ `
uniform float uF0;
uniform float uBoost;
uniform float uFresnelOn;  // 1 = angle-dependent, 0 = constant reflectance
uniform float uVisualize;  // 1 = paint F itself as grayscale
uniform vec3 uBaseColor;
uniform vec3 uReflectColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float cosTheta = clamp(dot(N, V), 0.0, 1.0);

  // Schlick's approximation: F = F0 + (1 - F0) * (1 - cos(theta))^5
  float schlick = uF0 + (1.0 - uF0) * pow(1.0 - cosTheta, 5.0);

  // With Fresnel off, every pixel gets the head-on reflectance F0.
  float F = clamp(mix(uF0, schlick, uFresnelOn) * uBoost, 0.0, 1.0);

  vec3 color = mix(uBaseColor, uReflectColor, F);
  color = mix(color, vec3(F), uVisualize);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

interface FresnelParams {
  f0: number;
  boost: number;
  fresnel: boolean;
  visualize: boolean;
}

function FresnelMaterial({ f0, boost, fresnel, visualize }: FresnelParams): React.JSX.Element {
  const ref = useRef<THREE.ShaderMaterial>(null);
  // Uniforms are created once and mutated through the ref in useFrame, so the
  // material is never recompiled or recreated while you drag a slider.
  const uniforms = useMemo(
    () => ({
      uF0: { value: INITIAL.f0 },
      uBoost: { value: INITIAL.boost },
      uFresnelOn: { value: 1 },
      uVisualize: { value: 0 },
      uBaseColor: { value: new THREE.Color("#06222e") },
      uReflectColor: { value: new THREE.Color("#dce9f7") },
    }),
    [],
  );

  useFrame(() => {
    const material = ref.current;
    if (!material) return;
    material.uniforms.uF0.value = f0;
    material.uniforms.uBoost.value = boost;
    material.uniforms.uFresnelOn.value = fresnel ? 1 : 0;
    material.uniforms.uVisualize.value = visualize ? 1 : 0;
  });

  // Declarative material: r3f disposes it with the mesh on unmount.
  return <shaderMaterial ref={ref} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />;
}

function FresnelMeshes(params: FresnelParams): React.JSX.Element {
  return (
    <>
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[1, 48, 32]} />
        <FresnelMaterial {...params} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[80, 80]} />
        <FresnelMaterial {...params} />
      </mesh>
    </>
  );
}

export default function Fresnel(): React.JSX.Element {
  const [f0, setF0] = useState(INITIAL.f0);
  const [boost, setBoost] = useState(INITIAL.boost);
  const [fresnel, setFresnel] = useState(INITIAL.fresnel);
  const [visualize, setVisualize] = useState(INITIAL.visualize);

  const caption = visualize
    ? "Visualizing F itself: white = mirror-like grazing reflection, dark = looking straight in. The bright band at the horizon is Schlick's (1 − cosθ)⁵ curve painted on the water."
    : fresnel
      ? "Reflectance grows toward grazing angles — swing the camera down low and the far water turns to mirror while the water at your feet stays deep and dark. The sphere picks up the same bright rim."
      : "Fresnel is off: every pixel reflects the same F0 no matter the angle, and the water goes flat and fake — no bright horizon, no rim on the sphere. Flip it back on to compare.";

  return (
    <PlaygroundFrame
      title="Fresnel: reflections live at grazing angles"
      caption={caption}
      onReset={() => {
        setF0(INITIAL.f0);
        setBoost(INITIAL.boost);
        setFresnel(INITIAL.fresnel);
        setVisualize(INITIAL.visualize);
      }}
      controls={
        <>
          <SliderControl
            label="F0 (head-on reflectance)"
            value={f0}
            min={0.02}
            max={0.4}
            step={0.01}
            onInput={setF0}
            format={(v) => v.toFixed(2)}
          />
          <SliderControl
            label="Exaggerate"
            value={boost}
            min={1}
            max={5}
            step={0.1}
            onInput={setBoost}
            format={(v) => `×${v.toFixed(1)}`}
          />
          <SwitchControl label="Fresnel" checked={fresnel} onChange={setFresnel} />
          <SwitchControl label="Visualize F" checked={visualize} onChange={setVisualize} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 3.2, 8], fov: 55 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b0e13"]} />
        {/* A distant "moon" so the dark sky has an anchor; the shader itself is unlit. */}
        <mesh position={[-9, 6, -30]}>
          <sphereGeometry args={[1.1, 24, 16]} />
          <meshBasicMaterial color="#f3eeda" />
        </mesh>
        <FresnelMeshes f0={f0} boost={boost} fresnel={fresnel} visualize={visualize} />
        <OrbitControls
          target={[0, 0.6, 0]}
          enablePan={false}
          minDistance={3}
          maxDistance={16}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 - 0.03}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
