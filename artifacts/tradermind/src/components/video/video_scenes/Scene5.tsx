import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div className="scene scene-five" initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}>
      <div className="closing-ring" /><div className="scene-label">04 / YOUR EDGE, KEPT PRIVATE</div>
      <div className="closing-copy"><h2>Stay close<br />to your <em>process.</em></h2><p>Offline by design. Ready wherever you trade.</p></div>
      <div className="platforms"><div><b>WINDOWS</b><span>Desktop focus / local-first</span></div><div><b>ANDROID</b><span>Journal anywhere / sync when you choose</span></div></div>
      <div className="closing-lockup"><div className="tm-mark">TM</div><div><b>TraderMind OS</b><span>TRADING, WITH MEMORY.</span></div></div>
      <div className="loop-line">NO CLOUD. NO NOISE. JUST THE WORK.</div>
    </motion.div>
  );
}