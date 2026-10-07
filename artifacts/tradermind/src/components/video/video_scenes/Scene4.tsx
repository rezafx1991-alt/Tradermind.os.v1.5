import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div className="scene scene-four" initial={{ clipPath: 'polygon(100% 0,100% 0,100% 100%,100% 100%)' }} animate={{ clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }} exit={{ clipPath: 'polygon(0 0,0 0,0 100%,0 100%)' }} transition={{ duration: .9, ease: [0.16, 1, 0.3, 1] }}>
      <div className="analysis-grid" />
      <div className="analysis-copy"><div className="scene-label">03 / THE REVIEW</div><h2>Patterns,<br /><em>not guesses.</em></h2><p>Review the story behind every number.<br />Find your repeatable edge.</p></div>
      <div className="analysis-orb"><svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="105" fill="none" stroke="#d7a55b" strokeDasharray="4 9" strokeWidth="1" /><motion.circle cx="150" cy="150" r="70" fill="none" stroke="#df6d55" strokeWidth="15" strokeDasharray="310 150" initial={{ pathLength: 0, rotate: -90 }} animate={{ pathLength: .78, rotate: 270 }} transition={{ duration: 1.5, delay: .3 }} /><circle cx="150" cy="150" r="38" fill="#1d2830" /><text x="150" y="145" textAnchor="middle" fill="#f5ead8" fontSize="20" fontWeight="bold">64.8%</text><text x="150" y="165" textAnchor="middle" fill="#9aa6a6" fontSize="10">WIN RATE</text></svg><div className="orb-legend"><span /><b>breakout</b><span /><b>reversal</b></div></div>
      <div className="insight-stack"><div><small>بهترین زمان</small><b>London open</b><strong>+۲.۸R</strong></div><div><small>اشتباه تکرارشونده</small><b>زود بستن سود</b><strong>۴ بار</strong></div><div><small>امتیاز انضباط</small><b>۷.۶ / ۱۰</b><strong>↑ ۱۲٪</strong></div></div>
    </motion.div>
  );
}