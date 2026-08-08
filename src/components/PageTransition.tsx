import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

// Apple-style page transition with 3D perspective
const pageVariants = {
  initial: {
    opacity: 0,
    x: 28,
    scale: 0.985,
    filter: 'blur(3px)',
  },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.38,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    x: -24,
    scale: 0.985,
    filter: 'blur(2px)',
    transition: {
      duration: 0.26,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const childVariants = {
  initial: {
    opacity: 0,
    y: 24,
    scale: 0.97,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const PageTransition = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : pageVariants}
      initial={prefersReducedMotion ? false : 'initial'}
      animate={prefersReducedMotion ? undefined : 'animate'}
      exit={prefersReducedMotion ? undefined : 'exit'}
      className={className}
      style={prefersReducedMotion ? undefined : { perspective: 1200, transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
};

export const AnimatedSection = ({ children, className = '' }: PageTransitionProps) => {
  return (
    <motion.div
      variants={childVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
