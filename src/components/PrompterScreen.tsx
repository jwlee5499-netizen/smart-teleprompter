import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PrompterSettings, WordToken, ScriptLine, ChapterMarker } from '../types';
import { ChevronUp, ChevronDown, Bookmark, List, X, RotateCcw, FastForward, MousePointerClick } from 'lucide-react';

interface PrompterScreenProps {
  lines: ScriptLine[];
  tokens: WordToken[];
  chapters?: ChapterMarker[];
  currentSpokenTokenIndex: number;
  speechMatchCount: number;
  manualJumpRevision: number;
  hasSpokenStarted: boolean;
  isPlaying: boolean;
  audioVolume?: number;
  settings: PrompterSettings;
  onUpdateProgress: (percent: number) => void;
  onSelectTokenIndex: (index: number, startPlaying?: boolean) => void;
  onSyncGuideTokenIndex?: (index: number) => void;
  onHoverTokenIndex?: (index: number | null) => void;
  onUpdateSettings?: (newSettings: Partial<PrompterSettings>) => void;
  onRewindLine?: () => void;
  onAdvanceLine?: () => void;
}

export const PrompterScreen: React.FC<PrompterScreenProps> = ({
  lines,
  tokens,
  chapters = [],
  currentSpokenTokenIndex,
  speechMatchCount,
  manualJumpRevision,
  hasSpokenStarted,
  isPlaying,
  audioVolume = 0,
  settings,
  onUpdateProgress,
  onSelectTokenIndex,
  onSyncGuideTokenIndex,
  onHoverTokenIndex,
  onUpdateSettings,
  onRewindLine,
  onAdvanceLine,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentTrackRef = useRef<HTMLDivElement>(null);
  const tokenElementsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const sentenceElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // Pre-calculate line height in px for accurate positioning
  const lineHeightPx = Math.round(settings.fontSize * settings.lineHeight);
  const shadedBandHeight = lineHeightPx + 20;

  // Broadcast Predictive Continuous Scroll Engine Refs
  const scrollYRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const confirmedTargetYRef = useRef<number>(0);
  const predictedTargetYRef = useRef<number>(0);
  const maxSafeCeilingYRef = useRef<number>(0);
  const manualTargetYRef = useRef<number>(0);
  const isGlidingManualRef = useRef<boolean>(false);

  // Real-time Speaker Pace Prediction Refs (px/sec)
  const predictedSpeedRef = useRef<number>(Math.max(28, lineHeightPx * 0.42));
  const lastMatchTimeRef = useRef<number>(0);
  const lastActiveVoiceTimeRef = useRef<number>(0);
  const lastConfirmedYRef = useRef<number>(0);

  const lastSyncedSentenceRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const currentTokenIdxRef = useRef<number>(currentSpokenTokenIndex);
  currentTokenIdxRef.current = currentSpokenTokenIndex;
  const audioVolumeRef = useRef<number>(audioVolume);
  audioVolumeRef.current = audioVolume;

  // Track microphone vocal activity so continuous predictive glide stays alive while speaking
  useEffect(() => {
    if (audioVolume > 5) {
      lastActiveVoiceTimeRef.current = performance.now();
    }
  }, [audioVolume]);

  // UI state
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false);
  const [hoveredSentenceIdx, setHoveredSentenceIdx] = useState<number | null>(null);

  // Clear hovered highlight once playback starts and speaker begins
  useEffect(() => {
    if (isPlaying && hasSpokenStarted) {
      setHoveredSentenceIdx(null);
      if (onHoverTokenIndex) {
        onHoverTokenIndex(null);
      }
    }
  }, [isPlaying, hasSpokenStarted, onHoverTokenIndex]);

  // Helper: get un-scrolled document Y coordinate that centers a given DOM element at the reading guide line
  const getElementTargetY = useCallback(
    (el: HTMLElement): number => {
      const viewport = viewportRef.current;
      if (!viewport) return 0;
      const guideY = viewport.clientHeight * (settings.guidePosition / 100);
      const viewportRect = viewport.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const visualCenterY = elRect.top + elRect.height / 2 - viewportRect.top;
      return Math.max(0, scrollYRef.current + (visualCenterY - guideY));
    },
    [settings.guidePosition]
  );

  /**
   * Compute continuous target scrollY and safe ceiling for a token:
   * - confirmedY: 현재 읽고 있는 어절의 줄 내 진행률(0~100%)을 연속적으로 보간하여,
   *   줄 중간에 멈춰 서지 않고 첫 단어부터 끝 단어까지 물 흐르듯 부드럽게 목표 위치를 전진시킵니다.
   * - safeCeilingY: 화자 속도 예측 엔진이 단어와 단어 사이를 부드럽게 이어줄 때,
   *   아직 읽지 않은 다음 줄이 가이드라인을 넘어가지 않도록 막아주는 안전 상한선입니다.
   */
  const computeTargetBoundsForToken = useCallback(
    (
      tokenIdx: number,
      includeIntraLineProgress: boolean
    ): { confirmedY: number; safeCeilingY: number } | null => {
      const viewport = viewportRef.current;
      if (!viewport || tokens.length === 0) return null;

      const clampedIdx = Math.max(0, Math.min(tokens.length - 1, tokenIdx));
      const tokenEl = tokenElementsRef.current[clampedIdx];
      const tok = tokens[clampedIdx];
      const sentenceEl = tok ? sentenceElementsRef.current.get(tok.sentenceIndex) : null;
      const baseEl = tokenEl || sentenceEl;

      if (!baseEl) return null;

      const currentRowY = getElementTargetY(baseEl);

      if (!includeIntraLineProgress || !tokenEl) {
        return {
          confirmedY: currentRowY,
          safeCeilingY: currentRowY + lineHeightPx * 0.35,
        };
      }

      // Find the start of the current visual row and the start of the next visual row
      let rowStartIdx = clampedIdx;
      while (rowStartIdx > 0) {
        const prevEl = tokenElementsRef.current[rowStartIdx - 1];
        if (!prevEl || Math.abs(getElementTargetY(prevEl) - currentRowY) > 10) {
          break;
        }
        rowStartIdx--;
      }

      let nextRowStartIdx = -1;
      let nextRowY = currentRowY + lineHeightPx;
      for (let i = clampedIdx + 1; i < Math.min(tokens.length, clampedIdx + 25); i++) {
        const nextEl = tokenElementsRef.current[i];
        if (nextEl) {
          const y = getElementTargetY(nextEl);
          if (y > currentRowY + 10) {
            nextRowStartIdx = i;
            nextRowY = y;
            break;
          }
        }
      }

      const rowEndIdx = nextRowStartIdx !== -1 ? nextRowStartIdx : tokens.length;
      const tokensInRow = Math.max(1, rowEndIdx - rowStartIdx);
      const wordOrderInRow = clampedIdx - rowStartIdx; // 0-indexed within current row
      const rowDelta = Math.min(
        lineHeightPx * 1.45,
        Math.max(lineHeightPx * 0.75, nextRowY - currentRowY)
      );

      // 줄의 첫 단어부터 마지막 단어까지 끊김 없이 연속 비례 진행 (0% ~ 85%)
      const progressFraction = Math.min(1, (wordOrderInRow + 0.5) / tokensInRow);
      const confirmedY = currentRowY + progressFraction * rowDelta * 0.85;

      // 음성인식이 어절 단위로 0.4~0.9초 간격으로 들어오는 동안에도
      // 스크롤이 중간에 벽에 부딪혀 멈칫거리지 않도록 현재 어절 앞쪽으로 넉넉한 활주로(runway)를 확보하되,
      // 아직 읽지 않은 다음 줄(nextRowY)이 가이드라인 위로 넘어가는 것은 엄격히 차단합니다.
      const lookaheadFraction = Math.min(0.95, (wordOrderInRow + 2.6) / tokensInRow);
      const safeCeilingY = Math.max(
        confirmedY + lineHeightPx * 0.35,
        currentRowY + lookaheadFraction * rowDelta
      );

      return { confirmedY, safeCeilingY };
    },
    [tokens, getElementTargetY, lineHeightPx]
  );

  // Helper: find which sentence is currently sitting at the reading guide line
  const findTokenAtGuideLine = useCallback((): { sentenceIndex: number; tokenIndex: number } | null => {
    const viewport = viewportRef.current;
    if (!viewport || sentenceElementsRef.current.size === 0) return null;

    const guideY = viewport.clientHeight * (settings.guidePosition / 100);
    const viewportRect = viewport.getBoundingClientRect();

    let closestSentenceIdx = -1;
    let minDistance = Infinity;

    sentenceElementsRef.current.forEach((el, sIdx) => {
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2 - viewportRect.top;
      const dist = Math.abs(centerY - guideY);
      if (dist < minDistance) {
        minDistance = dist;
        closestSentenceIdx = sIdx;
      }
    });

    if (closestSentenceIdx !== -1) {
      const matchingLine = lines.find((l) => l.sentenceIndex === closestSentenceIdx);
      if (matchingLine && matchingLine.tokens.length > 0) {
        return {
          sentenceIndex: closestSentenceIdx,
          tokenIndex: matchingLine.tokens[0].index,
        };
      }
    }
    return null;
  }, [lines, settings.guidePosition]);

  // 1. Handle explicit manual jumps (Left Arrow 1-sentence rewind, Right Arrow advance, Mouse click start, Chapter jump, Reset)
  useEffect(() => {
    const targetTokenIdx = currentTokenIdxRef.current;
    if (targetTokenIdx === 0 && manualJumpRevision === 0) {
      scrollYRef.current = 0;
      confirmedTargetYRef.current = 0;
      predictedTargetYRef.current = 0;
      maxSafeCeilingYRef.current = lineHeightPx * 0.45;
      manualTargetYRef.current = 0;
      velocityRef.current = 0;
      lastConfirmedYRef.current = 0;
      lastMatchTimeRef.current = 0;
      predictedSpeedRef.current = Math.max(26, lineHeightPx * 0.38);
      isGlidingManualRef.current = false;
      if (contentTrackRef.current) {
        contentTrackRef.current.style.transform = `translate3d(0, 0px, 0)`;
      }
      return;
    }

    const bounds = computeTargetBoundsForToken(targetTokenIdx, false);
    if (bounds !== null) {
      manualTargetYRef.current = bounds.confirmedY;
      confirmedTargetYRef.current = bounds.confirmedY;
      predictedTargetYRef.current = bounds.confirmedY;
      maxSafeCeilingYRef.current = bounds.safeCeilingY;
      lastConfirmedYRef.current = bounds.confirmedY;
      lastMatchTimeRef.current = 0;
      isGlidingManualRef.current = true;
      velocityRef.current = 0;
    }
  }, [manualJumpRevision, computeTargetBoundsForToken, lineHeightPx]);

  // 2. When speech recognition matches spoken words: update speaker pace estimation & continuous target bounds (forward-only)
  useEffect(() => {
    if (!hasSpokenStarted || speechMatchCount === 0 || isGlidingManualRef.current) return;

    const now = performance.now();
    lastActiveVoiceTimeRef.current = now;

    const bounds = computeTargetBoundsForToken(currentSpokenTokenIndex, true);
    if (!bounds) return;

    // Forward-only update of confirmed target & safe ceiling
    if (bounds.confirmedY > confirmedTargetYRef.current) {
      const deltaY = bounds.confirmedY - lastConfirmedYRef.current;
      const dtSec = lastMatchTimeRef.current > 0 ? (now - lastMatchTimeRef.current) / 1000 : 0;

      // 화자의 실제 읽는 속도(px/sec)를 아주 무거운 지수이동평균(EMA, 82:18)으로 부드럽게 추정하여
      // 특정 단어가 늦게 인식되더라도 속도가 출렁이지 않게 유지합니다.
      if (dtSec >= 0.15 && dtSec <= 4.0 && deltaY > 1) {
        const minNaturalSpeed = lineHeightPx * 0.22;
        const maxNaturalSpeed = lineHeightPx * 0.95;
        const instantSpeed = Math.min(maxNaturalSpeed, Math.max(minNaturalSpeed, deltaY / dtSec));
        predictedSpeedRef.current = predictedSpeedRef.current * 0.82 + instantSpeed * 0.18;
      }

      confirmedTargetYRef.current = bounds.confirmedY;
      lastConfirmedYRef.current = bounds.confirmedY;
      lastMatchTimeRef.current = now;
    }

    if (bounds.safeCeilingY > maxSafeCeilingYRef.current) {
      maxSafeCeilingYRef.current = bounds.safeCeilingY;
    }
    // 주의: 여기서 predictedTargetYRef.current를 confirmedTargetYRef.current로 즉시 스냅(점프)시키지 않습니다!
    // 매 프레임(60/120fps) scrollLoop 안에서 부드럽게 보간하며 따라가야 끊어지는 느낌이 전혀 없습니다.
  }, [speechMatchCount, currentSpokenTokenIndex, hasSpokenStarted, computeTargetBoundsForToken, lineHeightPx]);

  // 3. Broadcast Studio Ultra-Fluid Continuous Conveyor Scroll Engine (60/120fps GPU translate3d)
  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;

    const scrollLoop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      frameCount++;

      const viewport = viewportRef.current;
      const track = contentTrackRef.current;

      if (viewport && track) {
        const maxScrollY = Math.max(0, track.scrollHeight - viewport.clientHeight);

        if (isGlidingManualRef.current) {
          // Smooth studio camera glide when user presses ← (한 문장 위로) or clicks a starting sentence with mouse
          const diff = manualTargetYRef.current - scrollYRef.current;
          if (Math.abs(diff) > 0.6) {
            scrollYRef.current += diff * Math.min(1, dt * 10);
            confirmedTargetYRef.current = manualTargetYRef.current;
            predictedTargetYRef.current = manualTargetYRef.current;
          } else {
            scrollYRef.current = manualTargetYRef.current;
            confirmedTargetYRef.current = manualTargetYRef.current;
            predictedTargetYRef.current = manualTargetYRef.current;
            isGlidingManualRef.current = false;
          }
        } else if (isPlaying) {
          if (!settings.voiceTracking) {
            // [수동 연속 스크롤 모드 (음성 동조 OFF 시)]: 설정된 속도로 일정하게 상승
            const desiredVelocity = settings.scrollSpeed * 2.0;
            const inertiaFactor = Math.min(1, dt * 3.5);
            velocityRef.current = Math.max(
              0,
              velocityRef.current + (desiredVelocity - velocityRef.current) * inertiaFactor
            );
            scrollYRef.current = Math.max(
              0,
              Math.min(maxScrollY, scrollYRef.current + velocityRef.current * dt)
            );
          } else {
            // [초저진동 유체 컨베이어 음성 동조 엔진]:
            // 음성인식이 0.4~0.8초마다 한 번씩 들어오더라도 속도가 울컥거리거나 멈칫거리지 않고,
            // 마치 일정한 속도의 방송국 전동 프롬프터처럼 유유히 흘러가도록 2단계 연속 보간(Dual-Stage Fluid Smoothing)을 수행합니다.
            if (!hasSpokenStarted) {
              velocityRef.current = 0;
            } else {
              const timeSinceVoice = now - lastActiveVoiceTimeRef.current;
              const isSpeakerActivelyReading =
                timeSinceVoice < 2400 || audioVolumeRef.current > 4;

              // 1단계: 가상 가이드 목표점(predictedTargetY)을 매 프레임 부드럽게 전진
              // - 음성인식 확인 위치(confirmedTargetY)가 앞서 나갔을 때도 즉시 점프하지 않고 초당 2.4배율로 매끄럽게 흡수
              if (predictedTargetYRef.current < confirmedTargetYRef.current) {
                const catchUpDiff = confirmedTargetYRef.current - predictedTargetYRef.current;
                predictedTargetYRef.current += catchUpDiff * Math.min(1, dt * 2.4);
              }

              // - 화자가 말을 이어가는 동안 화자 예상 속도(predictedSpeedRef)로 끊김 없이 연속 전진
              if (isSpeakerActivelyReading) {
                const ceilingHeadroom = Math.max(
                  0,
                  maxSafeCeilingYRef.current - predictedTargetYRef.current
                );
                // 상한선에 가까워질수록 서서히 속도를 줄여 벽에 부딪히는 느낌 방지
                const runwayFactor = Math.min(1, ceilingHeadroom / (lineHeightPx * 0.45));
                predictedTargetYRef.current = Math.min(
                  maxSafeCeilingYRef.current,
                  predictedTargetYRef.current +
                    predictedSpeedRef.current * (0.35 + 0.6 * runwayFactor) * dt
                );
              }

              // 2단계: 실제 카메라 속도(velocityRef) 계산 — 급가속 없이 화자의 평균 속도를 중심으로 유영
              const gapToPredicted = Math.max(0, predictedTargetYRef.current - scrollYRef.current);
              const headroomToCeiling = Math.max(0, maxSafeCeilingYRef.current - scrollYRef.current);

              let desiredVelocity = 0;
              if (headroomToCeiling > 0.2) {
                // 상한선까지 남은 거리에 따른 부드러운 감속 곡선 (Soft S-Curve Cushion)
                const softCushion = Math.min(1, headroomToCeiling / (lineHeightPx * 0.5));

                // 기본 순항 속도(화자 예측 속도)가 중심을 잡고, 거리 차이(gapToPredicted)는 완만한 보정만 수행 (0.75배)
                const cruiseSpeed = isSpeakerActivelyReading
                  ? predictedSpeedRef.current * 0.88 * softCushion
                  : 0;
                const gentleCorrectionSpeed = gapToPredicted * 0.78;

                desiredVelocity = Math.min(
                  cruiseSpeed + gentleCorrectionSpeed,
                  headroomToCeiling * 1.8,
                  lineHeightPx * 1.15
                );
              }

              // 3단계: 무거운 유체 관성 필터(Heavy Fluid Inertia, dt * 2.2)로 미세한 속도 변화까지 완전히 다림질
              const inertiaBlend = Math.min(1, dt * 2.2);
              velocityRef.current = Math.max(
                0,
                velocityRef.current + (desiredVelocity - velocityRef.current) * inertiaBlend
              );

              if (velocityRef.current > 0.05 && headroomToCeiling > 0.05) {
                const nextY = Math.min(
                  maxSafeCeilingYRef.current,
                  scrollYRef.current + velocityRef.current * dt
                );
                scrollYRef.current = Math.max(0, Math.min(maxScrollY, nextY));
              } else {
                velocityRef.current = 0;
              }
            }
          }
        } else {
          // 일시정지 시 부드럽게 정지
          velocityRef.current *= Math.max(0, 1 - dt * 8);
          if (velocityRef.current > 0.4) {
            scrollYRef.current = Math.max(
              0,
              Math.min(maxScrollY, scrollYRef.current + velocityRef.current * dt)
            );
          } else {
            velocityRef.current = 0;
          }
        }

        // Apply GPU-accelerated sub-pixel transform
        track.style.transform = `translate3d(0, -${scrollYRef.current.toFixed(2)}px, 0)`;

        // Periodically update progress bar & manual scroll sentence index
        if (frameCount % 8 === 0) {
          if (maxScrollY > 0) {
            const pct = Math.min(100, Math.max(0, (scrollYRef.current / maxScrollY) * 100));
            onUpdateProgress(pct);
          }

          // 수동 스크롤 모드(음성 동조 OFF)일 때만 스크롤 위치로 현재 문장 인덱스 동기화
          if (!settings.voiceTracking) {
            const guideHit = findTokenAtGuideLine();
            if (guideHit && guideHit.sentenceIndex !== lastSyncedSentenceRef.current) {
              lastSyncedSentenceRef.current = guideHit.sentenceIndex;
              if (onSyncGuideTokenIndex) {
                onSyncGuideTokenIndex(guideHit.tokenIndex);
              }
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(scrollLoop);
    };

    animFrameRef.current = requestAnimationFrame(scrollLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    isPlaying,
    hasSpokenStarted,
    settings.voiceTracking,
    settings.scrollSpeed,
    lineHeightPx,
    onUpdateProgress,
    findTokenAtGuideLine,
    onSyncGuideTokenIndex,
  ]);

  // 4. Mouse Wheel handler: allows placing any sentence at the reading guide line with the mouse
  const handleUserWheel = useCallback(
    (e: React.WheelEvent) => {
      const viewport = viewportRef.current;
      const track = contentTrackRef.current;
      if (!viewport || !track) return;

      isGlidingManualRef.current = false;
      velocityRef.current = 0;

      const maxScrollY = Math.max(0, track.scrollHeight - viewport.clientHeight);
      const nextY = Math.max(0, Math.min(maxScrollY, scrollYRef.current + e.deltaY * 0.85));
      scrollYRef.current = nextY;
      confirmedTargetYRef.current = nextY;
      predictedTargetYRef.current = nextY;
      maxSafeCeilingYRef.current = nextY + lineHeightPx * 0.35;
      lastConfirmedYRef.current = nextY;
      manualTargetYRef.current = nextY;
      track.style.transform = `translate3d(0, -${nextY.toFixed(2)}px, 0)`;

      // Immediately sync active starting token to the sentence placed at the guide line
      const guideHit = findTokenAtGuideLine();
      if (guideHit) {
        lastSyncedSentenceRef.current = guideHit.sentenceIndex;
        onSelectTokenIndex(guideHit.tokenIndex, false);
      }
    },
    [findTokenAtGuideLine, onSelectTokenIndex, lineHeightPx]
  );

  // Theme styles
  const getThemeClass = () => {
    switch (settings.theme) {
      case 'dark-yellow':
        return 'bg-black text-yellow-400';
      case 'dark-green':
        return 'bg-black text-emerald-400';
      case 'light':
        return 'bg-white text-gray-900';
      case 'dark-white':
      default:
        return 'bg-black text-white';
    }
  };

  // Transform for mirror mode
  const mirrorStyle: React.CSSProperties = {
    transform: `scale(${settings.mirrorHorizontal ? -1 : 1}, ${settings.mirrorVertical ? -1 : 1})`,
    transformOrigin: 'center center',
  };

  // Guide line adjustment handlers
  const adjustGuidePosition = (delta: number) => {
    if (!onUpdateSettings) return;
    const newPos = Math.min(65, Math.max(15, settings.guidePosition + delta));
    onUpdateSettings({ guidePosition: newPos });
  };

  return (
    <div
      ref={viewportRef}
      onWheel={handleUserWheel}
      className={`relative w-full h-screen overflow-hidden select-none ${getThemeClass()}`}
    >
      {/* 강사가 아직 첫 발화를 시작하기 전 안내 배너 */}
      {isPlaying && settings.voiceTracking && !hasSpokenStarted && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/90 border border-blue-500/60 text-blue-200 text-xs font-medium shadow-xl backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>대본을 읽기 시작하시면 그때부터 읽는 속도에 맞춰 스크롤됩니다 (읽지 않은 부분은 절대 먼저 넘어가지 않습니다)</span>
        </div>
      )}

      {/* 1. 읽는 위치의 단일 포커스 음영 줄 (Reading Position Focus Band) */}
      {settings.showGuideBar && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center transition-all duration-300 ease-out"
          style={{
            top: `${settings.guidePosition}%`,
            transform: 'translateY(-50%)',
            height: `${shadedBandHeight}px`,
            paddingLeft: `${Math.max(2, settings.marginHorizontal - 2)}%`,
            paddingRight: `${Math.max(2, settings.marginHorizontal - 2)}%`,
          }}
        >
          <div className="w-full h-full rounded-2xl bg-blue-500/[0.13] border-l-4 border-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.18)]" />
        </div>
      )}

      {/* 2. 읽는 위치 표시 인디케이터 및 문장 이동 버튼 (음영 줄 위쪽에 위치하여 글씨를 가리지 않음) */}
      {settings.showGuideBar && (
        <div
          className="absolute left-0 right-0 z-30 pointer-events-none flex items-center transition-all duration-300 ease-out"
          style={{ top: `${settings.guidePosition}%` }}
        >
          {/* 가이드 수평선 */}
          <div className="w-full border-b border-blue-500/20"></div>

          {/* 좌측 마커 & 위치 조절 버튼 — 스크롤이 시작되면 대본 글씨를 가리지 않도록 자동으로 숨김 */}
          <div
            className={`absolute left-4 flex items-center gap-2 bg-[#141418]/95 border border-blue-500/50 text-white text-xs px-3 py-1 rounded-full shadow-xl backdrop-blur-md transition-opacity duration-300 ${
              isPlaying && (!settings.voiceTracking || hasSpokenStarted)
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100 pointer-events-auto'
            }`}
            style={{
              bottom: `${Math.round(shadedBandHeight / 2 + 8)}px`,
            }}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="font-semibold text-blue-300">읽는 위치 ({settings.guidePosition}%)</span>
            <div className="flex items-center gap-0.5 ml-1 border-l border-gray-700 pl-1.5">
              <button
                onClick={() => adjustGuidePosition(-5)}
                className="p-0.5 hover:text-blue-400 text-gray-400 transition-colors"
                title="읽는 위치 위로 올리기"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => adjustGuidePosition(5)}
                className="p-0.5 hover:text-blue-400 text-gray-400 transition-colors"
                title="읽는 위치 아래로 내리기"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* NG 대처 한 문장 위로 / 앞으로 버튼 */}
            {onRewindLine && (
              <button
                onClick={onRewindLine}
                className="ml-2 pl-2 border-l border-gray-700 flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                title="NG 발생 시 한 문장 위로 이동 (단축키: ← 왼쪽 화살표)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>한 문장 위로 (←)</span>
              </button>
            )}
            {onAdvanceLine && (
              <button
                onClick={onAdvanceLine}
                className="ml-1.5 pl-1.5 border-l border-gray-700 flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                title="한 문장 아래로 이동 (단축키: → 오른쪽 화살표)"
              >
                <FastForward className="w-3 h-3" />
                <span>다음 문장 (→)</span>
              </button>
            )}
          </div>

          {/* 우측 챕터 목차 버튼 */}
          {chapters.length > 0 && (
            <div
              className="absolute right-4 pointer-events-auto flex items-center gap-1.5"
              style={{
                bottom: `${Math.round(shadedBandHeight / 2 + 8)}px`,
              }}
            >
              <button
                onClick={() => setIsChapterDrawerOpen(!isChapterDrawerOpen)}
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-md transition-all border border-blue-400/40"
                title="대본 챕터 목차 열기"
              >
                <List className="w-3.5 h-3.5" />
                <span>챕터 ({chapters.length})</span>
              </button>
            </div>
          )}

          {/* 우측 인디케이터 화살표 */}
          <div className="absolute right-4 -translate-y-1/2 text-blue-400/70 font-mono text-sm">
            ◀
          </div>
        </div>
      )}

      {/* 3. 챕터 목차 슬라이드 드로어 (우측 퀵 점프 메뉴) */}
      {isChapterDrawerOpen && chapters.length > 0 && (
        <div className="absolute right-4 top-20 z-50 w-72 max-h-[75vh] bg-[#141418]/95 border border-blue-500/40 rounded-2xl shadow-2xl backdrop-blur-xl p-4 text-white flex flex-col pointer-events-auto animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-400">
              <Bookmark className="w-4 h-4" />
              <span>대본 챕터 목차</span>
            </div>
            <button
              onClick={() => setIsChapterDrawerOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 mt-2 space-y-1.5 pr-1">
            {chapters.map((chap, idx) => (
              <button
                key={chap.id}
                onClick={() => {
                  onSelectTokenIndex(chap.tokenIndex, false);
                  setIsChapterDrawerOpen(false);
                }}
                className="w-full text-left p-2.5 rounded-xl text-xs font-medium hover:bg-blue-600/20 hover:border-blue-500/40 border border-transparent text-gray-300 hover:text-white transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-5 h-5 rounded-md bg-gray-800 group-hover:bg-blue-600/50 flex items-center justify-center font-mono text-[11px] text-gray-400 group-hover:text-white">
                    {idx + 1}
                  </span>
                  <span className="truncate">{chap.title}</span>
                </div>
                <FastForward className="w-3 h-3 text-gray-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. 메인 방송용 서브픽셀(Sub-pixel) 스크롤 트랙 */}
      <div
        style={{
          paddingLeft: `${settings.marginHorizontal}%`,
          paddingRight: `${settings.marginHorizontal}%`,
          ...mirrorStyle,
        }}
        className="w-full h-full"
      >
        <div
          ref={contentTrackRef}
          className="relative z-10 will-change-transform"
          style={{
            paddingTop: `calc(${settings.guidePosition}vh - ${Math.round(lineHeightPx / 2)}px)`,
            paddingBottom: `calc(${100 - settings.guidePosition + 25}vh)`,
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            wordBreak: 'keep-all',
          }}
        >
          {lines.map((line) => {
            // 1) 챕터 구분 헤더 라인
            if (line.isChapterHeading && line.chapterTitle) {
              return (
                <div
                  key={`chap-line-${line.lineIndex}`}
                  className="flex items-center gap-2 text-blue-400 font-bold text-base tracking-wide border-b border-blue-500/30 pb-1.5 mb-4 mt-6 select-none"
                >
                  <Bookmark className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span>{line.chapterTitle}</span>
                </div>
              );
            }

            // 2) 빈 줄
            if (line.tokens.length === 0) {
              return <div key={`empty-${line.lineIndex}`} className="h-[0.55em]" />;
            }

            const isHovered = hoveredSentenceIdx === line.sentenceIndex;

            // 3) 실제 읽는 문장 라인 (마우스를 올려 시작 위치 지정 및 클릭 시 즉시 해당 문장으로 정렬)
            return (
              <div
                key={`line-${line.lineIndex}`}
                ref={(el) => {
                  if (el && line.sentenceIndex >= 0) {
                    sentenceElementsRef.current.set(line.sentenceIndex, el);
                  } else if (line.sentenceIndex >= 0) {
                    sentenceElementsRef.current.delete(line.sentenceIndex);
                  }
                }}
                onMouseEnter={() => {
                  setHoveredSentenceIdx(line.sentenceIndex);
                  if (onHoverTokenIndex) {
                    onHoverTokenIndex(line.tokens[0].index);
                  }
                }}
                onMouseLeave={() => {
                  setHoveredSentenceIdx((prev) => (prev === line.sentenceIndex ? null : prev));
                  if (onHoverTokenIndex) {
                    onHoverTokenIndex(null);
                  }
                }}
                onClick={() => {
                  // 마우스로 클릭한 문장을 즉시 읽는 위치에 올리고, 강사가 읽기 시작하면 그 부분부터 스크롤!
                  onSelectTokenIndex(line.tokens[0].index, true);
                }}
                className={`group relative cursor-pointer rounded-xl px-3 -mx-3 transition-colors duration-150 ${
                  isHovered
                    ? 'bg-emerald-500/[0.12] ring-1 ring-emerald-400/50'
                    : 'hover:bg-white/[0.04]'
                }`}
                style={{ marginBottom: `${Math.round(settings.fontSize * 0.32)}px` }}
              >
                {/* 마우스를 문장 위에 올렸을 때 뜨는 '이 위치부터 시작' 안내 배지 */}
                {isHovered && (
                  <div className="absolute -top-6 right-2 z-30 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600/95 text-white text-[11px] font-sans font-semibold shadow-lg pointer-events-none">
                    <MousePointerClick className="w-3 h-3" />
                    <span>여기서부터 시작 (클릭)</span>
                  </div>
                )}

                {/* 토크형 촬영 화자 표시 배지 (예: [진행자], [출연자A]) */}
                {line.speakerLabel && (
                  <span
                    className="inline-block mr-[0.4em] px-2.5 py-0.5 rounded-lg border font-bold align-middle text-[0.78em] select-none"
                    style={{
                      color: line.color || '#60a5fa',
                      borderColor: line.color ? `${line.color}66` : 'rgba(96,165,250,0.4)',
                      backgroundColor: line.color ? `${line.color}18` : 'rgba(59,130,246,0.15)',
                    }}
                  >
                    {line.speakerLabel}
                  </span>
                )}

                {line.tokens.map((tok) => (
                  <span
                    key={`tok-${tok.index}`}
                    ref={(el) => (tokenElementsRef.current[tok.index] = el)}
                    className="inline-block mr-[0.32em] px-0.5 rounded opacity-95"
                    style={tok.color ? { color: tok.color } : undefined}
                  >
                    {tok.word}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
