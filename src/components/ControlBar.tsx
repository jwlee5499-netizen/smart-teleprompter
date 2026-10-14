import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Settings as SettingsIcon,
  Maximize,
  Minimize,
  Edit3,
  Mic,
  MicOff,
  FlipHorizontal,
  FlipVertical,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { PrompterSettings } from '../types';

interface ControlBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onBackToEdit: () => void;
  onOpenSettings: () => void;
  settings: PrompterSettings;
  onUpdateSettings: (newSettings: Partial<PrompterSettings>) => void;
  elapsedSeconds: number;
  progressPercent: number;
  isListening: boolean;
  onToggleVoiceTracking: () => void;
  audioVolume?: number;
  speechError?: string | null;
  onRetryMic?: () => void;
  onRewindLine?: () => void;
  onAdvanceLine?: () => void;
  hasSpokenStarted?: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isPlaying,
  onTogglePlay,
  onReset,
  onBackToEdit,
  onOpenSettings,
  settings,
  onUpdateSettings,
  elapsedSeconds,
  progressPercent,
  isListening,
  onToggleVoiceTracking,
  audioVolume = 0,
  speechError = null,
  onRetryMic,
  onRewindLine,
  onAdvanceLine,
  hasSpokenStarted = false,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Auto-hide controls when mouse is inactive
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleMouseMove = () => {
      setIsVisible(true);
      clearTimeout(timeout);
      if (isPlaying) {
        timeout = setTimeout(() => setIsVisible(false), 3500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [isPlaying]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Format timer
  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const changeSpeed = (delta: number) => {
    const newSpeed = Math.min(100, Math.max(5, settings.scrollSpeed + delta));
    onUpdateSettings({ scrollSpeed: newSpeed });
  };

  return (
    <>
      {/* Top Floating Info Bar (Timer, Progress, Edit button, Mic Status) */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 transition-opacity duration-300 ${
          isVisible || !!speechError ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        <div className="bg-gradient-to-b from-black/85 via-black/45 to-transparent p-4 flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBackToEdit}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-sm font-medium text-white border border-gray-700 backdrop-blur transition-all shadow"
              >
                <Edit3 className="w-4 h-4" />
                <span>대본 편집</span>
              </button>

              {settings.showTimer && (
                <div className="px-3 py-1.5 rounded-lg bg-black/70 border border-gray-800 text-sm font-mono text-emerald-400 backdrop-blur flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>{formatTime(elapsedSeconds)}</span>
                </div>
              )}

              {settings.showProgressBar && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 border border-gray-800 text-xs font-mono text-gray-300 backdrop-blur">
                  <span>진행률</span>
                  <span className="text-blue-400 font-bold">{Math.round(progressPercent)}%</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {/* 음성 인식 상태 & 마이크 볼륨 레벨 게이지 */}
              {settings.voiceTracking ? (
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur border transition-all ${
                      isListening
                        ? hasSpokenStarted
                          ? 'bg-emerald-900/40 border-emerald-500/70 text-emerald-200'
                          : 'bg-blue-900/40 border-blue-500/70 text-blue-200'
                        : 'bg-yellow-900/30 border-yellow-600 text-yellow-300'
                    }`}
                  >
                    <Mic
                      className={`w-3.5 h-3.5 ${
                        isListening
                          ? hasSpokenStarted
                            ? 'text-emerald-400'
                            : 'text-blue-400'
                          : 'text-yellow-400'
                      }`}
                    />
                    <span>
                      {isListening
                        ? hasSpokenStarted
                          ? '강사 읽기 속도 동조 중'
                          : '첫 발화 대기 중'
                        : '마이크 대기'}
                    </span>

                    {/* 실시간 마이크 볼륨 레벨 바 (5개 LED) */}
                    <div className="flex items-center gap-0.5 ml-1 h-3" title={`마이크 입력 볼륨: ${audioVolume}%`}>
                      {[12, 26, 45, 65, 85].map((threshold, idx) => (
                        <div
                          key={idx}
                          className={`w-1 rounded-sm transition-all duration-75 ${
                            audioVolume >= threshold
                              ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]'
                              : 'bg-gray-700'
                          }`}
                          style={{ height: `${(idx + 1) * 2.5 + 4}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800/70 border border-gray-700 text-gray-400 backdrop-blur">
                  <span>수동 속도 스크롤 모드</span>
                </div>
              )}

              {/* 전체화면 */}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-white border border-gray-700 backdrop-blur transition-all"
                title="전체화면"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 마이크/음성인식 에러 경고 배너 */}
          {speechError && (
            <div className="self-center flex items-center gap-3 px-4 py-2 rounded-xl bg-red-950/90 border border-red-500/80 text-xs text-red-200 backdrop-blur shadow-xl max-w-2xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="flex-1">{speechError}</span>
              {onRetryMic && (
                <button
                  onClick={onRetryMic}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors flex-shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>마이크 재시도</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Main Controls */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 hover:opacity-100 hover:translate-y-0'
        }`}
      >
        <div className="bg-[#141418]/90 border border-gray-700/70 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-white">
          {/* 음성 추적 토글 버튼 */}
          <button
            onClick={onToggleVoiceTracking}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium text-xs transition-all ${
              settings.voiceTracking
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            title="강사가 처음 말할 때부터 읽는 속도에 맞춰 스크롤합니다"
          >
            {settings.voiceTracking ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>음성 동조 {settings.voiceTracking ? 'ON' : 'OFF'}</span>
          </button>

          <div className="w-px h-6 bg-gray-700"></div>

          {/* 한 문장 위로 되감기 (NG 대처: 왼쪽 화살표) */}
          {onRewindLine && (
            <button
              onClick={onRewindLine}
              className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 hover:text-amber-300 transition-colors"
              title="NG 발생 시 한 문장 위로 올라가기 (단축키: ← 왼쪽 화살표)"
            >
              <SkipBack className="w-5 h-5" />
            </button>
          )}

          {/* 재생 / 일시정지 */}
          <button
            onClick={onTogglePlay}
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold transition-transform active:scale-95 shadow-lg ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
            title={isPlaying ? '일시정지 (스페이스바)' : '활성화 (스페이스바)'}
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
          </button>

          {/* 한 문장 앞으로 건너뛰기 */}
          {onAdvanceLine && (
            <button
              onClick={onAdvanceLine}
              className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
              title="다음 문장으로 이동 (단축키: → 오른쪽 화살표)"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          )}

          {/* 처음으로 리셋 */}
          <button
            onClick={onReset}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title="맨 처음 위치로 (R)"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-700"></div>

          {/* 속도 조절 */}
          <div className="flex items-center gap-1.5 bg-gray-800/80 rounded-xl px-2.5 py-1 border border-gray-700/60">
            <span className="text-xs text-gray-400">속도</span>
            <span className="font-mono text-sm font-semibold text-white w-6 text-center">{settings.scrollSpeed}</span>
            <div className="flex flex-col">
              <button
                onClick={() => changeSpeed(5)}
                className="hover:text-blue-400 transition-colors"
                title="속도 증가 (아래 화살표 ↓)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => changeSpeed(-5)}
                className="hover:text-blue-400 transition-colors"
                title="속도 감소 (위 화살표 ↑)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 폰트 크기 빠른 조절 */}
          <div className="flex items-center gap-1.5 bg-gray-800/80 rounded-xl px-2.5 py-1 border border-gray-700/60">
            <span className="text-xs text-gray-400">폰트</span>
            <span className="font-mono text-xs font-semibold text-white w-9 text-center">{settings.fontSize}</span>
            <div className="flex flex-col">
              <button
                onClick={() => onUpdateSettings({ fontSize: Math.min(160, settings.fontSize + 4) })}
                className="hover:text-blue-400 transition-colors"
                title="글자 크기 확대"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onUpdateSettings({ fontSize: Math.max(24, settings.fontSize - 4) })}
                className="hover:text-blue-400 transition-colors"
                title="글자 크기 축소"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="w-px h-6 bg-gray-700"></div>

          {/* 거울 반전 토글 */}
          <button
            onClick={() => onUpdateSettings({ mirrorHorizontal: !settings.mirrorHorizontal })}
            className={`p-2.5 rounded-xl transition-colors ${
              settings.mirrorHorizontal
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="좌우 반전 (하드웨어 프롬프터 유리용)"
          >
            <FlipHorizontal className="w-5 h-5" />
          </button>

          <button
            onClick={() => onUpdateSettings({ mirrorVertical: !settings.mirrorVertical })}
            className={`p-2.5 rounded-xl transition-colors ${
              settings.mirrorVertical
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="상하 반전"
          >
            <FlipVertical className="w-5 h-5" />
          </button>

          {/* 설정 모달 열기 */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title="상세 환경 설정"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
};
