import React from 'react';
import { PrompterSettings, ThemeType } from '../types';
import { X, Sliders, Eye, Mic, FlipHorizontal, FlipVertical, Type, Palette } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PrompterSettings;
  onUpdateSettings: (newSettings: Partial<PrompterSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const themes: { id: ThemeType; label: string; bg: string; text: string }[] = [
    { id: 'dark-white', label: '블랙 / 화이트', bg: 'bg-black', text: 'text-white' },
    { id: 'dark-yellow', label: '블랙 / 옐로우', bg: 'bg-black', text: 'text-yellow-400' },
    { id: 'dark-green', label: '블랙 / 그린', bg: 'bg-black', text: 'text-green-400' },
    { id: 'light', label: '화이트 / 블랙', bg: 'bg-white', text: 'text-black' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#141418] border border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-gray-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-xl font-bold text-white">
            <Sliders className="w-5 h-5 text-blue-500" />
            <span>프롬프터 환경 설정</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 pt-5">
          {/* 음성 인식 추적 설정 */}
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-white">스마트 음성 추적 (Voice Follow)</span>
              </div>
              <input
                type="checkbox"
                checked={settings.voiceTracking}
                onChange={(e) => onUpdateSettings({ voiceTracking: e.target.checked })}
                className="w-5 h-5 accent-blue-500 rounded cursor-pointer"
              />
            </div>
            <p className="text-xs text-gray-400 mb-3">
              강사가 원고를 읽으면 실시간으로 발화를 인식하여 읽는 위치를 자동으로 따라가며 스크롤합니다.
            </p>
            {settings.voiceTracking && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-300">인식 언어:</span>
                <select
                  value={settings.voiceLanguage}
                  onChange={(e) => onUpdateSettings({ voiceLanguage: e.target.value })}
                  className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                >
                  <option value="ko-KR">한국어 (Korean)</option>
                  <option value="en-US">English (US)</option>
                  <option value="ja-JP">日本語 (Japanese)</option>
                </select>
              </div>
            )}
          </div>

          {/* 거울 반전 모드 (하드웨어용) */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-400" />
              <span>하드웨어 거울 반전 (Mirror Display)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdateSettings({ mirrorHorizontal: !settings.mirrorHorizontal })}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm font-medium transition-all ${
                  settings.mirrorHorizontal
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <FlipHorizontal className="w-4 h-4" />
                <span>좌우 반전 {settings.mirrorHorizontal ? '(켜짐)' : '(꺼짐)'}</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ mirrorVertical: !settings.mirrorVertical })}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm font-medium transition-all ${
                  settings.mirrorVertical
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <FlipVertical className="w-4 h-4" />
                <span>상하 반전 {settings.mirrorVertical ? '(켜짐)' : '(꺼짐)'}</span>
              </button>
            </div>
          </div>

          {/* 텍스트 크기 & 여백 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <Type className="w-4 h-4 text-emerald-400" />
              <span>텍스트 가독성</span>
            </div>

            {/* 글자 크기 */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>글꼴 크기 (최대 160px 지원)</span>
                <span className="font-mono text-white font-bold">{settings.fontSize}px</span>
              </div>
              <input
                type="range"
                min="24"
                max="160"
                step="2"
                value={settings.fontSize}
                onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
              {/* 폰트 퀵 프리셋 버튼 */}
              <div className="flex gap-1.5 mt-2">
                {[36, 52, 72, 96, 120, 150].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onUpdateSettings({ fontSize: size })}
                    className={`flex-1 py-1 text-[11px] rounded-lg border font-medium transition-all ${
                      settings.fontSize === size
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>

            {/* 읽는 위치 (가이드라인 위치) */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>읽는 가이드라인 위치 (화면 상단 기준)</span>
                <span className="font-mono text-white font-bold">{settings.guidePosition}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="65"
                step="1"
                value={settings.guidePosition}
                onChange={(e) => onUpdateSettings({ guidePosition: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
              <div className="flex gap-2 mt-2">
                {[
                  { pos: 25, label: '상단 (25%)' },
                  { pos: 35, label: '기본 (35%)' },
                  { pos: 50, label: '중앙 (50%)' },
                ].map(({ pos, label }) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => onUpdateSettings({ guidePosition: pos })}
                    className={`flex-1 py-1 text-[11px] rounded-lg border font-medium transition-all ${
                      settings.guidePosition === pos
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 줄 간격 */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>줄 간격 (배율)</span>
                <span className="font-mono text-white">{settings.lineHeight.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.2"
                max="2.6"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>

            {/* 좌우 여백 */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>화면 좌우 여백</span>
                <span className="font-mono text-white">{settings.marginHorizontal}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="35"
                step="1"
                value={settings.marginHorizontal}
                onChange={(e) => onUpdateSettings({ marginHorizontal: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>

            {/* 기본 스크롤 속도 */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>자동 스크롤 기본 속도 (수동 모드용)</span>
                <span className="font-mono text-white">{settings.scrollSpeed}</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={settings.scrollSpeed}
                onChange={(e) => onUpdateSettings({ scrollSpeed: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* 컬러 테마 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <Palette className="w-4 h-4 text-amber-400" />
              <span>컬러 테마</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onUpdateSettings({ theme: t.id })}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    settings.theme === t.id
                      ? 'border-blue-500 ring-2 ring-blue-500/30 bg-gray-800'
                      : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg border border-gray-600 flex items-center justify-center font-bold text-xs ${t.bg} ${t.text}`}>
                    Aa
                  </div>
                  <span className="text-xs font-medium text-gray-300">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 인디케이터 표시 옵션 */}
          <div className="space-y-3 pt-2 border-t border-gray-800">
            <div className="text-sm font-semibold text-gray-300">보조 표시 도구</div>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs text-gray-300 hover:text-white cursor-pointer py-1">
                <span>가이드라인 바 및 화살표 마커 표시</span>
                <input
                  type="checkbox"
                  checked={settings.showGuideBar}
                  onChange={(e) => onUpdateSettings({ showGuideBar: e.target.checked })}
                  className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-gray-300 hover:text-white cursor-pointer py-1">
                <span>발표 타이머 (경과 시간) 표시</span>
                <input
                  type="checkbox"
                  checked={settings.showTimer}
                  onChange={(e) => onUpdateSettings({ showTimer: e.target.checked })}
                  className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-gray-300 hover:text-white cursor-pointer py-1">
                <span>진행률 막대 (Progress Bar) 표시</span>
                <input
                  type="checkbox"
                  checked={settings.showProgressBar}
                  onChange={(e) => onUpdateSettings({ showProgressBar: e.target.checked })}
                  className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
};
