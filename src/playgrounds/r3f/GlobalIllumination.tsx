import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Cornell-box demo for direct vs. indirect lighting. Real global illumination
 * traces light bouncing off the colored walls; that is far too expensive here,
 * so the "indirect" mode fakes the bounce with hand-placed low-intensity fill
 * lights — exactly the cheat real-time engines used for decades.
 */

const INITIAL = { indirect: true, bounce: 60 };

const WALL_ROUGHNESS = 0.95;

function CornellBox(): React.JSX.Element {
  return (
    <>
      {/* floor */}
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#e8e4dc" roughness={WALL_ROUGHNESS} />
      </mesh>
      {/* ceiling */}
      <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#e8e4dc" roughness={WALL_ROUGHNESS} />
      </mesh>
      {/* back wall */}
      <mesh position={[0, 0, -2]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#e8e4dc" roughness={WALL_ROUGHNESS} />
      </mesh>
      {/* red left wall */}
      <mesh position={[-2, 0, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#c23b2e" roughness={WALL_ROUGHNESS} />
      </mesh>
      {/* green right wall */}
      <mesh position={[2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#3b9e3f" roughness={WALL_ROUGHNESS} />
      </mesh>

      {/* tall box */}
      <mesh position={[-0.75, -0.95, -0.6]} rotation={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.05, 2.1, 1.05]} />
        <meshStandardMaterial color="#dcd8d0" roughness={WALL_ROUGHNESS} />
      </mesh>
      {/* short box */}
      <mesh position={[0.8, -1.5, 0.55]} rotation={[0, -0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#dcd8d0" roughness={WALL_ROUGHNESS} />
      </mesh>

      {/* ceiling lamp panel */}
      <mesh position={[0, 1.98, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial color="#fff7e0" />
      </mesh>
    </>
  );
}

export default function GlobalIllumination(): React.JSX.Element {
  const [indirect, setIndirect] = useState(INITIAL.indirect);
  const [bounce, setBounce] = useState(INITIAL.bounce);

  // 0..1 scale applied to every fake-bounce light.
  const k = indirect ? bounce / 100 : 0;

  const caption = !indirect
    ? "Direct light only: the lamp lights what it can see, everything else is pitch black, and the red and green walls tint nothing. Light that never bounces tells only half the story."
    : bounce < 25
      ? `A whisper of fake bounce (${bounce}%): shadows soften and a hint of red and green creeps onto the boxes. Real GI computes this bleeding automatically — here it's hand-placed fill lights, the classic real-time cheat.`
      : `Faked indirect light at ${bounce}%: the walls "bleed" red and green onto the boxes and floor. Real GI simulates bouncing photons to get this for free — this demo fakes it with carefully placed fill lights.`;

  return (
    <PlaygroundFrame
      title="Direct vs. indirect lighting (Cornell box)"
      caption={caption}
      onReset={() => {
        setIndirect(INITIAL.indirect);
        setBounce(INITIAL.bounce);
      }}
      controls={
        <>
          <SwitchControl label="Indirect light (faked)" checked={indirect} onChange={setIndirect} />
          <SliderControl
            label="Bounce strength"
            value={bounce}
            min={0}
            max={100}
            step={5}
            onInput={setBounce}
            format={(v) => `${v}%`}
          />
        </>
      }
    >
      <Canvas shadows camera={{ position: [0, 0, 6.4], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#101317"]} />

        {/* The one "real" light: a lamp at the ceiling with hard shadows. */}
        <pointLight
          position={[0, 1.55, 0]}
          intensity={14}
          color="#fff3da"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.004}
        />

        {/* Fake bounce: colored fills near the walls + floor fill + soft ambient. */}
        {k > 0 && (
          <>
            <ambientLight intensity={0.3 * k} color="#fff0e0" />
            <pointLight position={[-1.55, -0.4, 0.3]} intensity={3.2 * k} color="#ff4a30" />
            <pointLight position={[1.55, -0.4, 0.3]} intensity={3.2 * k} color="#46d04a" />
            {/* "bounce off the floor in front" — lights the camera-facing sides */}
            <pointLight position={[0, -1.2, 1.7]} intensity={2.6 * k} color="#fff4e2" />
          </>
        )}

        <CornellBox />
        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={9}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.7}
          minAzimuthAngle={-Math.PI * 0.22}
          maxAzimuthAngle={Math.PI * 0.22}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
