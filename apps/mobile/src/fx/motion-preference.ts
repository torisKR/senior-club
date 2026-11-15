import { createContext } from 'react';

/** 앱에서 움직임 줄이기를 켜면 기기 설정과 관계없이 효과를 최소화합니다. */
export const MotionPreferenceContext = createContext(false);
