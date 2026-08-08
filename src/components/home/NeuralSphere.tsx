import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

const NeuralSphere: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<any>(null);

  useFrame((state) => {
    const delta = state.clock.getDelta();
    const time = state.clock.elapsedTime;
    
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.15 * delta;
      groupRef.current.rotation.x = Math.sin(time * 0.5) * 0.1;
    }
    
    if (materialRef.current) {
      // Distort oscillates between 0.25 and 0.5
      materialRef.current.distort = 0.375 + Math.sin(time) * 0.125;
      // Emissive intensity oscillates between 0.4 and 0.8
      materialRef.current.emissiveIntensity = 0.6 + Math.sin(time * 1.5) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main Core */}
      <mesh>
        <sphereGeometry args={[1.8, 128, 128]} />
        <MeshDistortMaterial
          ref={materialRef}
          color="#0a0a2e"
          emissive="#4171f5"
          emissiveIntensity={0.6}
          distort={0.35}
          speed={2}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Inner Glow Shell */}
      <mesh>
        <sphereGeometry args={[2.4, 64, 64]} />
        <meshBasicMaterial
          color="#4171f5"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer Corona Shell */}
      <mesh>
        <sphereGeometry args={[3.0, 64, 64]} />
        <meshBasicMaterial
          color="#c471ed"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default NeuralSphere;
