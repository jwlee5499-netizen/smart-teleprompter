import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PrompterSettings, WordToken, ScriptLine, ChapterMarker } from '../types';
import { ChevronUp, ChevronDown, Bookmark, List, X, RotateCcw, FastForward, MousePointerClick } from 'lucide-react';
import { globalAudioState } from '../utils/speechRecognition';

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
  onSyncGuideTokenIndex?: (index: number, isManualSeek?: boolean) => void;
  onHoverTokenIndex?: (index: number | null) => void;
  onUpdateSettings?: (newSettings: Partial<PrompterSettings>) => void;
  onRewindLine?: () => void;
  onAdvanceLine?: () => void;
}

const PrompterScreenComponent: React.FC<PrompterScreenProps> = ({
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
  const predictedSpeedRef = useRef<number>(Math.max(38, lineHeightPx * 0.50));
  const lastMatchTimeRef = useRef<number>(0);
  const lastActiveVoiceTimeRef = useRef<number>(0);
  const lastConfirmedYRef = useRef<number>(0);

  const lastSyncedSentenceRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const lastReportedProgressRef = useRef<number>(-1);
  const currentTokenIdxRef = useRef<number>(currentSpokenTokenIndex);
  currentTokenIdxRef.current = currentSpokenTokenIndex;
  const audioVolumeRef = useRef<number>(audioVolume);
  audioVolumeRef.current = audioVolume;
  const manualSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (manualSyncTimerRef.current) clearTimeout(manualSyncTimerRef.current);
    };
  }, []);

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
   * - confirmedY: 현재 읽고 있는 어절의 줄 내 진행률(0~100%)에 음성인식 지연 보정(+1.5어절 시선 선행)을 반영하여
   *   화자의 눈이 다음 줄/다음 문장으로 이동할 때 지체 없이 제때 가이드라인에 올라오도록 목표 위치를 전진시킵니다.
   * - safeCeilingY: 화자 속도 예측 엔진이 어절과 어절 사이를 부드럽게 이어줄 때,
   *   아직 읽지 않은 문장이 과도하게 넘어가지 않도록 보호하는 안전 상한선입니다.
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
          safeCeilingY: currentRowY + lineHeightPx * 0.45,
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

      // 1. 현재 문장의 경계 및 마지막 유효 어절 인덱스 계산
      const currentSentenceIdx = tok.sentenceIndex;
      let sentenceEndIdx = clampedIdx;
      while (
        sentenceEndIdx + 1 < tokens.length &&
        tokens[sentenceEndIdx + 1].sentenceIndex === currentSentenceIdx
      ) {
        sentenceEndIdx++;
      }

      // 문장 내 마지막 비지문 어절
      let lastNonParenSentenceTokenIdx = sentenceEndIdx;
      while (lastNonParenSentenceTokenIdx > rowStartIdx && tokens[lastNonParenSentenceTokenIdx]?.isParenthetical) {
        lastNonParenSentenceTokenIdx--;
      }

      const isAtSentenceEnd = clampedIdx >= lastNonParenSentenceTokenIdx;

      // 2. 다음 문장의 첫 번째 어절 및 DOM 위치 확인 (첫 번째 어절 span을 우선 사용하여 줄바꿈된 긴 문장에서도 첫 줄 높이를 정확히 타겟팅)
      let nextSentenceFirstTokenIdx = -1;
      for (let i = sentenceEndIdx + 1; i < tokens.length; i++) {
        if (tokens[i].sentenceIndex > currentSentenceIdx && !tokens[i].isParenthetical) {
          nextSentenceFirstTokenIdx = i;
          break;
        }
      }

      let nextSentenceY = -1;
      if (nextSentenceFirstTokenIdx !== -1) {
        const nextTokenEl = tokenElementsRef.current[nextSentenceFirstTokenIdx];
        const nextSentenceEl = sentenceElementsRef.current.get(tokens[nextSentenceFirstTokenIdx].sentenceIndex);
        const nextTargetEl = nextTokenEl || nextSentenceEl;
        if (nextTargetEl) {
          nextSentenceY = getElementTargetY(nextTargetEl);
        }
      }

      const isLastRowOfSentence = rowEndIdx > lastNonParenSentenceTokenIdx;
      const targetEndOfRowY =
        isLastRowOfSentence && nextSentenceY > currentRowY ? nextSentenceY : nextRowY;
      const effectiveDelta = Math.min(
        lineHeightPx * 1.65,
        Math.max(lineHeightPx * 0.80, targetEndOfRowY - currentRowY)
      );

      // [핵심 기능: 지금 말하는 문장이 끝나면 지체 없이 다음 문장 첫 줄이 가이드라인에 오도록 전환]
      if (isAtSentenceEnd && nextSentenceY > currentRowY) {
        const confirmedY = nextSentenceY;
        const safeCeilingY = nextSentenceY + lineHeightPx * 0.45;
        return { confirmedY, safeCeilingY };
      }

      // 긴 문장 내에서 한 줄이 끝나 다음 줄(nextRow)로 줄바꿈될 때
      const isAtRowEnd = clampedIdx >= rowEndIdx - 1;
      if (isAtRowEnd && nextRowStartIdx !== -1 && nextRowY > currentRowY) {
        const confirmedY = nextRowY;
        const safeCeilingY = nextRowY + lineHeightPx * 0.45;
        return { confirmedY, safeCeilingY };
      }

      // 줄 내부를 순차적으로 읽고 있는 동안:
      // Web Speech API의 약 0.35~0.5초 인식 지연을 보상하기 위해 +1.5어절 시선 선행(Look-ahead)을 적용하고,
      // 줄의 100%(effectiveDelta 전체)를 온전히 전진시켜 다음 줄이 늦게 올라오는 현상을 원천 해결합니다.
      const progressFraction = Math.min(1, (wordOrderInRow + 1.5) / Math.max(1, tokensInRow));
      const confirmedY = currentRowY + progressFraction * effectiveDelta;
      const safeCeilingY = confirmedY + lineHeightPx * 0.45;

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
      predictedSpeedRef.current = Math.max(38, lineHeightPx * 0.50);
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

      // 화자의 실제 읽는 속도(px/sec)를 반응성 높은 지수이동평균(EMA, 55:45)으로 실시간 추정
      // 줄바꿈/문장 전환 시의 이동량도 함께 반영하여 화자가 빠르게 읽을 때 즉시 속도를 맞춰줍니다.
      if (dtSec >= 0.08 && dtSec <= 3.5 && deltaY > 1) {
        const clampedDelta = Math.min(deltaY, lineHeightPx * 1.4);
        const minNaturalSpeed = lineHeightPx * 0.22;
        const maxNaturalSpeed = lineHeightPx * 1.30;
        const instantSpeed = Math.min(maxNaturalSpeed, Math.max(minNaturalSpeed, clampedDelta / dtSec));
        predictedSpeedRef.current = predictedSpeedRef.current * 0.55 + instantSpeed * 0.45;
      }

      confirmedTargetYRef.current = bounds.confirmedY;
      lastConfirmedYRef.current = bounds.confirmedY;
      lastMatchTimeRef.current = now;
    }

    if (bounds.safeCeilingY > maxSafeCeilingYRef.current) {
      maxSafeCeilingYRef.current = bounds.safeCeilingY;
    }
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
          // Smooth studio camera glide when user presses ← (한 문장 위로), clicks a starting sentence, or uses mouse wheel / PageUp / PageDown
          const diff = manualTargetYRef.current - scrollYRef.current;
          if (Math.abs(diff) > 0.6) {
            scrollYRef.current += diff * Math.min(1, dt * 18);
            confirmedTargetYRef.current = manualTargetYRef.current;
            predictedTargetYRef.current = manualTargetYRef.current;
          } else {
            scrollYRef.current = manualTargetYRef.current;
            confirmedTargetYRef.current = manualTargetYRef.current;
            predictedTargetYRef.current = manualTargetYRef.current;
            isGlidingManualRef.current = false;

            // When manual glide finishes, align reading token bounds to guideline
            const guideHit = findTokenAtGuideLine();
            if (guideHit) {
              lastSyncedSentenceRef.current = guideHit.sentenceIndex;
              const bounds = computeTargetBoundsForToken(guideHit.tokenIndex, false);
              if (bounds) {
                confirmedTargetYRef.current = bounds.confirmedY;
                predictedTargetYRef.current = bounds.confirmedY;
                maxSafeCeilingYRef.current = bounds.safeCeilingY;
                lastConfirmedYRef.current = bounds.confirmedY;
              }
              if (onSyncGuideTokenIndex) {
                onSyncGuideTokenIndex(guideHit.tokenIndex, true);
              }
            }
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
            // [실시간 화자 속도 적응형 유체 스크롤 엔진]:
            // 화자의 실제 발화 속도(느림/보통/빠름)에 맞춰 뒤처지지 않고 즉시 올라오면서도
            // 프레임 간 관성 보간을 통해 끊김 없이 매끄럽게 주행합니다.
            if (!hasSpokenStarted) {
              velocityRef.current = 0;
            } else {
              const timeSinceVoice = Math.min(
                now - lastActiveVoiceTimeRef.current,
                now - globalAudioState.lastVoiceTime
              );
              const isSpeakerActivelyReading =
                timeSinceVoice < 2400 || audioVolumeRef.current > 4 || globalAudioState.volume > 4;

              // 1단계: 가상 가이드 목표점(predictedTargetY)을 매 프레임 전진
              // - 음성인식 확인 위치(confirmedTargetY)가 앞서 나갔을 때는 초당 8.0배율로 빠르게 수렴
              if (predictedTargetYRef.current < confirmedTargetYRef.current) {
                const catchUpDiff = confirmedTargetYRef.current - predictedTargetYRef.current;
                predictedTargetYRef.current += catchUpDiff * Math.min(1, dt * 8.0);
              } else if (isSpeakerActivelyReading) {
                // 확인된 위치에 도달한 뒤 화자가 말을 이어가는 동안 상한선까지 예측 속도로 자연스럽게 전진
                const ceilingHeadroom = Math.max(
                  0,
                  maxSafeCeilingYRef.current - predictedTargetYRef.current
                );
                const runwayFactor = Math.min(1, ceilingHeadroom / (lineHeightPx * 0.35));
                predictedTargetYRef.current = Math.min(
                  maxSafeCeilingYRef.current,
                  predictedTargetYRef.current +
                    predictedSpeedRef.current * 0.90 * runwayFactor * dt
                );
              }

              // 2단계: 실제 카메라 속도(desiredVelocity) 계산 — 화자의 낭독 속도에 맞춰 지체 없이 추종
              const gapToConfirmed = Math.max(0, confirmedTargetYRef.current - scrollYRef.current);
              const gapToTarget = Math.max(0, predictedTargetYRef.current - scrollYRef.current);
              const headroomToCeiling = Math.max(0, maxSafeCeilingYRef.current - scrollYRef.current);

              let desiredVelocity = 0;
              if (headroomToCeiling > 0.05) {
                // 이미 확인된 발화 위치(confirmedTargetY)보다 뒤처져 있을 때는 감속 없이 전속력으로 따라잡고,
                // 확인된 발화 위치를 통과해 상한선(safeCeilingY) 근처로 유영할 때만 소프트 쿠션 감속 적용
                const softCushion =
                  gapToConfirmed > 2
                    ? 1.0
                    : Math.min(1, headroomToCeiling / (lineHeightPx * 0.35));

                // 화자의 실시간 발화 속도 기반 순항 속도
                const cruiseSpeed = isSpeakerActivelyReading
                  ? predictedSpeedRef.current * 0.95 * softCushion
                  : 0;

                // 목표 위치와의 거리(gapToTarget)에 비례하는 능동 추종 속도
                const catchUpVelocity =
                  (predictedSpeedRef.current * 0.75 + gapToTarget * 2.5) * softCushion;

                // 화자가 빠르게 읽거나 줄바꿈이 일어날 때도 뒤처지지 않도록 충분한 최고 속도 허용
                const maxSafeVelocity =
                  gapToConfirmed > lineHeightPx * 0.8
                    ? lineHeightPx * 1.65
                    : lineHeightPx * 1.25;

                desiredVelocity = Math.min(
                  Math.max(cruiseSpeed, catchUpVelocity),
                  headroomToCeiling * 4.5,
                  maxSafeVelocity
                );
              }

              // 3단계: 유체 관성 필터 (First-Order Low-Pass Filter)
              // 반응성을 높이면서도(dt * 5.5) 프레임 간 속도 변화를 매끄럽게 이어줌
              const inertiaFactor = Math.min(1, dt * 5.5);
              velocityRef.current = velocityRef.current + (desiredVelocity - velocityRef.current) * inertiaFactor;

              // 4단계: 스크롤 적용
              if (headroomToCeiling > 0.05 && velocityRef.current > 0.005) {
                const nextY = Math.min(
                  maxSafeCeilingYRef.current,
                  scrollYRef.current + velocityRef.current * dt
                );
                scrollYRef.current = Math.max(0, Math.min(maxScrollY, nextY));
              } else if (headroomToCeiling <= 0.05) {
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
        if (frameCount % 16 === 0) {
          if (maxScrollY > 0) {
            const pct = Math.min(100, Math.max(0, (scrollYRef.current / maxScrollY) * 100));
            if (Math.abs(pct - lastReportedProgressRef.current) >= 0.4) {
              lastReportedProgressRef.current = pct;
              onUpdateProgress(pct);
            }
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
    computeTargetBoundsForToken,
  ]);

  // 4. Mouse Wheel and PageUp/PageDown handler: allows manual scrolling anywhere on the screen
  const performManualScrollDelta = useCallback(
    (deltaPixels: number) => {
      const viewport = viewportRef.current;
      const track = contentTrackRef.current;
      if (!viewport || !track) return;

      const maxScrollY = Math.max(0, track.scrollHeight - viewport.clientHeight);
      const currentManualBase = isGlidingManualRef.current ? manualTargetYRef.current : scrollYRef.current;
      const nextY = Math.max(0, Math.min(maxScrollY, currentManualBase + deltaPixels));

      manualTargetYRef.current = nextY;
      confirmedTargetYRef.current = nextY;
      predictedTargetYRef.current = nextY;
      maxSafeCeilingYRef.current = nextY + lineHeightPx * 0.45;
      lastConfirmedYRef.current = nextY;
      velocityRef.current = 0;
      isGlidingManualRef.current = true;

      // Debounce guideline token sync to prevent thrashing and to ensure DOM has updated
      if (manualSyncTimerRef.current) {
        clearTimeout(manualSyncTimerRef.current);
      }
      manualSyncTimerRef.current = setTimeout(() => {
        const guideHit = findTokenAtGuideLine();
        if (guideHit && onSyncGuideTokenIndex) {
          lastSyncedSentenceRef.current = guideHit.sentenceIndex;
          onSyncGuideTokenIndex(guideHit.tokenIndex, true);
        }
      }, 120);
    },
    [findTokenAtGuideLine, onSyncGuideTokenIndex, lineHeightPx]
  );

  // Global window wheel event listener to ensure mouse wheel works anywhere on screen
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      // Don't intercept scroll inside drawer or modals if they are scrollable
      const target = e.target as HTMLElement;
      if (target?.closest?.('.overflow-y-auto')) {
        return;
      }

      e.preventDefault();
      // Apply intuitive wheel delta with sensible scaling & mode normalization
      let delta = e.deltaY;
      if (e.deltaMode === 1) {
        delta *= lineHeightPx;
      } else if (e.deltaMode === 2) {
        delta *= (viewportRef.current?.clientHeight || 600);
      }
      performManualScrollDelta(delta * 0.95);
    };

    window.addEventListener('wheel', handleGlobalWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel, { capture: true });
    };
  }, [performManualScrollDelta, lineHeightPx]);

  // PageUp / PageDown keyboard and custom event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const isPageUp = e.key === 'PageUp' || e.code === 'PageUp' || e.key === 'Prior';
      const isPageDown = e.key === 'PageDown' || e.code === 'PageDown' || e.key === 'Next';

      if (isPageUp || isPageDown) {
        e.preventDefault();
        e.stopPropagation();
        const viewport = viewportRef.current;
        const pageSize = viewport ? viewport.clientHeight * 0.75 : 450;
        const delta = isPageUp ? -pageSize : pageSize;
        performManualScrollDelta(delta);
      }
    };

    const handleCustomPageScroll = (e: Event) => {
      const customEvt = e as CustomEvent<{ direction: number }>;
      const viewport = viewportRef.current;
      if (!viewport) return;

      const pageSize = viewport.clientHeight * 0.75;
      const delta = customEvt.detail.direction * pageSize;
      performManualScrollDelta(delta);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('prompter-page-scroll', handleCustomPageScroll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('prompter-page-scroll', handleCustomPageScroll);
    };
  }, [performManualScrollDelta]);

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
                    className={`inline-block mr-[0.32em] px-0.5 rounded ${
                      tok.isParenthetical ? 'opacity-60 italic text-gray-400 font-normal' : 'opacity-95'
                    }`}
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

export const PrompterScreen = React.memo(PrompterScreenComponent, (prev, next) => {
  return (
    prev.currentSpokenTokenIndex === next.currentSpokenTokenIndex &&
    prev.speechMatchCount === next.speechMatchCount &&
    prev.manualJumpRevision === next.manualJumpRevision &&
    prev.hasSpokenStarted === next.hasSpokenStarted &&
    prev.isPlaying === next.isPlaying &&
    prev.settings === next.settings &&
    prev.lines === next.lines &&
    prev.tokens === next.tokens &&
    prev.chapters === next.chapters &&
    prev.onUpdateProgress === next.onUpdateProgress &&
    prev.onSelectTokenIndex === next.onSelectTokenIndex &&
    prev.onSyncGuideTokenIndex === next.onSyncGuideTokenIndex &&
    prev.onHoverTokenIndex === next.onHoverTokenIndex &&
    prev.onUpdateSettings === next.onUpdateSettings &&
    prev.onRewindLine === next.onRewindLine &&
    prev.onAdvanceLine === next.onAdvanceLine
  );
});
