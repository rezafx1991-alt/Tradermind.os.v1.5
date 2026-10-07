import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div className="scene scene-one" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.8 }}>
      <div className="scene-copy">
        <p className="eyebrow">TRADERMIND OS · OFFLINE TRADING JOURNAL</p>
        <h1>Think in<br /><em>trades.</em></h1>
        <p className="lede">A private operating system for the moments<br />between the chart and the decision.</p>
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit orbit-a" /><div className="orbit orbit-b" />
        <div className="hero-node">TM<span>OS</span></div>
        <div className="orbit-dot dot-a" /><div className="orbit-dot dot-b" />
      </div>
      <div className="hero-footer">A QUIET EDGE / 01</div>
    </motion.div>
  );
}