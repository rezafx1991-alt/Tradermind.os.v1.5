import { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
    __replitVideoPlayerMounted?: boolean;
    __replitVideoTotalDurationMs?: number;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const keys = useMemo(() => Object.keys(durations), [durations]);
  const [currentScene, setCurrentScene] = useState(keys[0] ?? '');
  const sceneIndex = useRef(0);
  const completedFirstPass = useRef(false);

  useEffect(() => {
    window.__replitVideoPlayerMounted = true;
    window.__replitVideoTotalDurationMs = keys.reduce((sum, key) => sum + (durations[key] ?? 0), 0);
    window.startRecording?.();
  }, [durations, keys]);

  useEffect(() => {
    let stopped = false;
    const advance = () => {
      if (stopped || keys.length === 0) return;
      sceneIndex.current = (sceneIndex.current + 1) % keys.length;
      if (sceneIndex.current === 0 && !completedFirstPass.current) {
        completedFirstPass.current = true;
        window.stopRecording?.();
      }
      setCurrentScene(keys[sceneIndex.current]);
    };
    const timer = window.setTimeout(advance, durations[keys[sceneIndex.current]] ?? 3000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [currentScene, durations, keys]);

  return { currentScene };
}