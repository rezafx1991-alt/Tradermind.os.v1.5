import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = { opening: 4200, dashboard: 5600, journal: 4700, analysis: 5200, closing: 4600 };

export function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  return (
    <main className="video-root" dir="rtl">
      <img className="video-noise" src={`${import.meta.env.BASE_URL}tradermind-ink-grid.png`} alt="" />
      <motion.div className="persistent-arc" animate={{ rotate: currentScene === 'analysis' ? 18 : currentScene === 'closing' ? -18 : 0, scale: currentScene === 'opening' ? 1.2 : 1 }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }} />
      <div className="brand-stamp"><span>TM</span><b>TRADERMIND OS</b></div>
      <AnimatePresence mode="sync" initial>
        {currentScene === 'opening' && <Scene1 key="opening" />}
        {currentScene === 'dashboard' && <Scene2 key="dashboard" />}
        {currentScene === 'journal' && <Scene3 key="journal" />}
        {currentScene === 'analysis' && <Scene4 key="analysis" />}
        {currentScene === 'closing' && <Scene5 key="closing" />}
      </AnimatePresence>
    </main>
  );
}