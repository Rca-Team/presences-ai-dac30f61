import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FloatingParticlesProps {
  count?: number;
}

const FloatingParticles: React.FC<FloatingParticlesProps> = ({ count = 600 }) => {
  const outerGroupRef = useRef<THREE.Group>(null);
  const innerGroupRef = useRef<THREE.Group>(null);

  const colorsList = ['#6c9dff', '#36d1dc', '#c471ed'].map((c) => new THREE.Color(c));

  const generateParticles = (numParticles: number, minRadius: number, maxRadius: number, minSize: number, maxSize: number) => {
    const positions = new Float32Array(numParticles * 3);
    const colors = new Float32Array(numParticles * 3);
    const sizes = new Float32Array(numParticles);

    for (let i = 0; i < numParticles; i++) {
      // Random spherical distribution
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = minRadius + Math.random() * (maxRadius - minRadius);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const color = colorsList[i % colorsList.length];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = minSize + Math.random() * (maxSize - minSize);
    }

    return { positions, colors, sizes };
  };

  const outerParticles = useMemo(() => generateParticles(count, 3.0, 7.0, 0.02, 0.08), [count]);
  const innerParticles = useMemo(() => generateParticles(Math.floor(count / 3), 2.2, 3.5, 0.05, 0.12), [count]);

  useFrame((state) => {
    const delta = state.clock.getDelta();
    const time = state.clock.elapsedTime;
    
    if (outerGroupRef.current) {
      outerGroupRef.current.rotation.y += 0.04 * delta;
      outerGroupRef.current.rotation.x = Math.sin(time * 0.3) * 0.05;
    }
    
    if (innerGroupRef.current) {
      innerGroupRef.current.rotation.y -= 0.06 * delta;
      innerGroupRef.current.rotation.x = Math.cos(time * 0.4) * 0.08;
    }
  });

  return (
    <group>
      <group ref={outerGroupRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={count} array={outerParticles.positions} itemSize={3} />
            <bufferAttribute attach="attributes-color" count={count} array={outerParticles.colors} itemSize={3} />
            <bufferAttribute attach="attributes-size" count={count} array={outerParticles.sizes} itemSize={1} />
          </bufferGeometry>
          <pointsMaterial
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            size={0.1}
          />
        </points>
      </group>
      
      <group ref={innerGroupRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={Math.floor(count / 3)} array={innerParticles.positions} itemSize={3} />
            <bufferAttribute attach="attributes-color" count={Math.floor(count / 3)} array={innerParticles.colors} itemSize={3} />
            <bufferAttribute attach="attributes-size" count={Math.floor(count / 3)} array={innerParticles.sizes} itemSize={1} />
          </bufferGeometry>
          <pointsMaterial
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            size={0.15}
          />
        </points>
      </group>
    </group>
  );
};

export default FloatingParticles;
