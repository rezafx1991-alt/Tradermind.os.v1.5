import { motion } from 'framer-motion';

export function Scene2() {
  const bars = [35, 48, 42, 61, 55, 70, 64, 82, 76, 90, 84, 96];
  return (
    <motion.div className="scene scene-two" initial={{ clipPath: 'circle(0% at 20% 40%)', opacity: 0 }} animate={{ clipPath: 'circle(130% at 20% 40%)', opacity: 1 }} exit={{ clipPath: 'circle(0% at 86% 70%)', opacity: 0 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
      <div className="scene-label">01 / THE DASHBOARD</div>
      <div className="dashboard-frame">
        <div className="ui-sidebar"><div className="ui-brand">TraderMind <b>OS</b></div>{['داشبورد','معاملات','تحلیل','ژورنال روزانه','استراتژی‌ها','یادآورها'].map((x, i) => <div className={`ui-nav ${i === 0 ? 'active' : ''}`} key={x}><span>{['⌂','↗','⌁','▦','◇','◷'][i]}</span>{x}</div>)}</div>
        <div className="ui-main"><div className="ui-top"><span>صبح بخیر، تریدر</span><i>امروز / ۱۴۰۴.۰۵.۲۱</i></div><div className="ui-cards"><div className="ui-card hero-card"><small>خلاصه عملکرد</small><strong>+ ۱۲.۴۸٪</strong><div className="mini-chart">{bars.map((h, i) => <span style={{ height: `${h}%` }} key={i} />)}</div></div><div className="ui-card"><small>معاملات امروز</small><strong>۰۳</strong><p>همه چیز ثبت شده است.</p></div><div className="ui-card"><small>وضعیت ذهنی</small><strong className="amber">متمرکز</strong><p>قبل از شروع، مکث کن.</p></div></div><div className="ui-bottom"><div className="line-chart"><small>منحنی سرمایه</small><svg viewBox="0 0 500 120"><motion.path d="M0 96 C55 86 62 64 102 77 S144 44 188 62 S234 20 278 43 S324 18 365 34 S416 4 500 18" fill="none" stroke="#d7a55b" strokeWidth="3" pathLength="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, delay: .5 }} /></svg></div><div className="sync-chip"><span />ذخیره محلی فعال</div></div></div>
      </div>
      <div className="scene-caption">See the pattern before it becomes a habit.</div>
    </motion.div>
  );
}