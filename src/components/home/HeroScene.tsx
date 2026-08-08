import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import NeuralSphere from './NeuralSphere';
import FloatingParticles from './FloatingParticles';
import NeuralNetwork3D from './NeuralNetwork3D';

interface HeroSceneProps {
  className?: string;
}

const HeroScene: React.FC<HeroSceneProps> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.15} />
          <pointLight position={[10, 8, 10]} intensity={1.5} color="#4171f5" />
          <pointLight position={[-8, -6, -8]} intensity={0.8} color="#e84393" />
          <pointLight position={[0, 10, 0]} intensity={0.4} color="#36d1dc" />
          <fog attach="fog" args={['#080818', 8, 20]} />
          
          <NeuralSphere />
          <FloatingParticles />
          <NeuralNetwork3D />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default HeroScene;
