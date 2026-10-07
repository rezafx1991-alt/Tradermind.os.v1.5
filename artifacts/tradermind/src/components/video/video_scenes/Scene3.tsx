import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div className="scene scene-three" initial={{ opacity: 0, rotateY: 14, x: '6vw' }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={{ opacity: 0, rotateY: -12, x: '-6vw' }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
      <div className="journal-copy"><div className="scene-label">02 / THE JOURNAL</div><h2>Turn a trade<br />into <em>evidence.</em></h2><p>Capture the setup. Name the risk.<br />Write down what the chart can’t.</p><div className="progress-mark"><span />01 — 04</div></div>
      <div className="journal-paper">
        <div className="paper-top"><b>ثبت معامله جدید</b><span>۲۱ مرداد ۱۴۰۴</span></div>
        <div className="paper-field wide"><label>نماد</label><strong>EURUSD</strong><i>◒</i></div>
        <div className="paper-row"><div className="paper-field"><label>نوع معامله</label><strong>خرید</strong></div><div className="paper-field"><label>ریسک</label><strong>۰.۷۵٪</strong></div></div>
        <div className="paper-field note"><label>یادداشت ذهنی</label><strong>ورود طبق پلن، بدون عجله.</strong><motion.div className="scribble" animate={{ scaleX: [0, 1] }} transition={{ duration: .8, delay: .7 }} /></div>
        <div className="paper-tags"><span>Breakout</span><span>London</span><span>Rule-based</span></div>
        <div className="paper-footer"><span>● آفلاین ذخیره شد</span><b>استناد به برنامه / ۰۲</b></div>
      </div>
    </motion.div>
  );
}