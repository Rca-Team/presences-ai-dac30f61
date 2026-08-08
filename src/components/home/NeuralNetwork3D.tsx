import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const NeuralNetwork3D: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.Group>(null);
  const linesGroupRef = useRef<THREE.Group>(null);
  
  const numNodes = 18;
  const connectionDistance = 3.0;

  const { nodes, edges, pulses } = useMemo(() => {
    const generatedNodes: THREE.Vector3[] = [];
    
    // Simple seeded random to ensure consistent generation on remounts
    const seedRandom = (seed: number) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    let seed = 42;
    for (let i = 0; i < numNodes; i++) {
      const u = seedRandom(seed++);
      const v = seedRandom(seed++);
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 3.5 + seedRandom(seed++) * 2.0; // 3.5 to 5.5 radius

      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      generatedNodes.push(pos);
    }

    const generatedEdges: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    const validEdges: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    for (let i = 0; i < numNodes; i++) {
      for (let j = i + 1; j < numNodes; j++) {
        if (generatedNodes[i].distanceTo(generatedNodes[j]) < connectionDistance) {
          generatedEdges.push({ start: generatedNodes[i], end: generatedNodes[j] });
          validEdges.push({ start: generatedNodes[i], end: generatedNodes[j] });
        }
      }
    }

    // Generate 6 pulses travelling on edges
    const generatedPulses = Array.from({ length: 6 }).map(() => {
      const edgeIndex = Math.floor(seedRandom(seed++) * validEdges.length);
      return {
        edge: validEdges[edgeIndex] || validEdges[0],
        progress: seedRandom(seed++),
        speed: 0.2 + seedRandom(seed++) * 0.3,
        meshRef: React.createRef<THREE.Mesh>()
      };
    });

    return { nodes: generatedNodes, edges: generatedEdges, pulses: generatedPulses };
  }, []);

  useFrame((state) => {
    const delta = state.clock.getDelta();
    const time = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.02 * delta;
    }

    // Pulsate nodes opacity
    if (nodesRef.current) {
      nodesRef.current.children.forEach((child, i) => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = 0.5 + Math.sin(time * 2 + i) * 0.5;
        }
      });
    }

    // Pulsate lines opacity
    if (linesGroupRef.current) {
      linesGroupRef.current.children.forEach((child, i) => {
        if ((child as any).material) {
          const mat = (child as any).material;
          mat.opacity = 0.125 + Math.sin(time * 1.5 + i * 0.5) * 0.075; // Oscillate between 0.05 and 0.2
        }
      });
    }

    // Animate data pulses along edges
    pulses.forEach((pulse) => {
      pulse.progress += pulse.speed * delta;
      if (pulse.progress > 1) {
        pulse.progress = 0;
      }
      
      if (pulse.meshRef.current && pulse.edge) {
        pulse.meshRef.current.position.copy(pulse.edge.start).lerp(pulse.edge.end, pulse.progress);
      }
    });
  });

  return (
    <group ref={groupRef}>
      <group ref={nodesRef}>
        {nodes.map((pos, i) => (
          <mesh key={`node-${i}`} position={pos}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial 
              color={i % 2 === 0 ? '#4171f5' : '#36d1dc'}
              transparent
              opacity={1}
            />
          </mesh>
        ))}
      </group>

      <group ref={linesGroupRef}>
        {edges.map((edge, i) => (
          <Line
            key={`edge-${i}`}
            points={[edge.start, edge.end]}
            color="#4171f5"
            lineWidth={0.5}
            transparent
            opacity={0.1}
          />
        ))}
      </group>

      <group>
        {pulses.map((pulse, i) => (
          <mesh key={`pulse-${i}`} ref={pulse.meshRef}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
    </group>
  );
};

export default NeuralNetwork3D;
