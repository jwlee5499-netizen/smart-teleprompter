import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Script, PrompterSettings, PrompterMode } from './types';
import { tokenizeScript, findMatchingTokenIndex, SpeechTracker } from './utils/speechRecognition';
import { EditorView } from './components/EditorView';
import { PrompterScreen } from './components/PrompterScreen';
import { ControlBar } from './components/ControlBar';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_SAMPLE_SCRIPT = `# 1. 토크형 오프닝 (출연자별 색상 구분)
{노랑} [진행자] 안녕하세요, 반갑습니다! 오늘 스마트 음성 추적 프롬프터 시연에 오신 여러분을 진심으로 환영합니다.
{하늘} [출연자A] 네, 안녕하세요! 이렇게 토크형 촬영에서도 사람마다 글자 색상을 다르게 지정하니 내 차례를 한눈에 알 수 있어 정말 편하네요.
{초록} [출연자B] 맞습니다! 대본 편집 화면에서 줄에 커서를 두고 상단 색상 버튼만 누르면 누구나 쉽게 색을 넣을 수 있습니다.

# 2. 강사 발화 시작 감지 및 속도 동조
프롬프터는 처음부터 혼자 스크롤되지 않고 강사님이 처음 말을 시작할 때까지 기다립니다.
강사님이 말씀을 시작하시면 그때부터 읽는 속도에 맞춰 부드럽게 올라갑니다.
원하시는 시작 위치에 마우스를 올려 클릭하시면 그 문장부터 바로 시작할 수 있습니다.

# 3. NG 한 문장 되감기
만약 읽으시다가 실수로 NG가 발생했을 때는
키보드의 왼쪽 화살표(←) 버튼을 누르시면 정확히 한 문장 위로 부드럽게 올라갑니다.

# 4. 마무리
우측 상단의 챕터 버튼을 누르시면 원하는 파트로 즉시 이동하실 수 있습니다.
감사합니다. 멋진 발표 되시기 바랍니다!`;

const DEFAULT_SETTINGS: PrompterSettings = {
  fontSize: 52,
  lineHeight: 1.8,
  marginHorizontal: 15,
  theme: 'dark-white',
  scrollSpeed: 30,
  mirrorHorizontal: false,
  mirrorVertical: false,
  showGuideBar: true,
  showTimer: true,
  showProgressBar: true,
  voiceTracking: true,
  voiceLanguage: 'ko-KR',
  guidePosition: 35,
};

export function App() {
  // 1. 대본 목록 로드 및 상태
  const [scripts, setScripts] = useState<Script[]>(() => {
    const saved = localStorage.getItem('prompter_scripts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: Script) =>
            s.id === 'default-script' && !s.content.includes('{노랑}')
              ? { ...s, content: DEFAULT_SAMPLE_SCRIPT }
              : s
          );
        }
      } catch (e) {}
    }
    return [
      {
        id: 'default-script',
        title: '스마트 방송 프롬프터 시연 원고',
        content: DEFAULT_SAMPLE_SCRIPT,
        updatedAt: Date.now(),
      },
    ];
  });

  const [currentScriptId, setCurrentScriptId] = useState<string>(() => {
    return scripts[0]?.id || 'default-script';
  });

  // 2. 프롬프터 설정 상태
  const [settings, setSettings] = useState<PrompterSettings>(() => {
    const saved = localStorage.getItem('prompter_settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {}
    }
    return DEFAULT_SETTINGS;
  });

  // 3. 뷰 모드 및 제어 상태
  const [mode, setMode] = useState<PrompterMode>('edit');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [hasSpokenStarted, setHasSpokenStarted] = useState<boolean>(false);
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const [currentSpokenTokenIndex, setCurrentSpokenTokenIndex] = useState<number>(0);
  const [speechMatchCount, setSpeechMatchCount] = useState<number>(0);
  const [manualJumpRevision, setManualJumpRevision] = useState<number>(0);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Refs for real-time speech & mouse interaction
  const speechTrackerRef = useRef<SpeechTracker | null>(null);
  const tokenIndexRef = useRef<number>(currentSpokenTokenIndex);
  tokenIndexRef.current = currentSpokenTokenIndex;
  const hoveredTokenIndexRef = useRef<number | null>(null);
  const lastManualJumpTimeRef = useRef<number>(0);

  // Active Script
  const activeScript = scripts.find((s) => s.id === currentScriptId) || scripts[0];

  // Tokenize active script into tokens, lines, chapters, and readable sentenceLines
  const { tokens, lines, chapters, sentenceLines } = useMemo(() => {
    return tokenizeScript(activeScript?.content || '');
  }, [activeScript?.content]);

  // Current active sentence index (0 ~ sentenceLines.length - 1)
  const activeSentenceIndex = useMemo(() => {
    const sIdx = tokens[currentSpokenTokenIndex]?.sentenceIndex;
    return typeof sIdx === 'number' && sIdx >= 0 ? sIdx : 0;
  }, [tokens, currentSpokenTokenIndex]);

  // NG 대처: 왼쪽 화살표(←) 누르면 정확히 '한 문장 위로' 이동 (다시 말하기 시작할 때까지 대기)
  const handleRewindLine = useCallback(() => {
    if (sentenceLines.length === 0) return;

    const targetSentenceIdx = Math.max(0, activeSentenceIndex - 1);
    const targetSentence = sentenceLines[targetSentenceIdx];

    if (targetSentence && targetSentence.tokens.length > 0) {
      const targetTokenIdx = targetSentence.tokens[0].index;
      lastManualJumpTimeRef.current = performance.now();
      tokenIndexRef.current = targetTokenIdx;
      setCurrentSpokenTokenIndex(targetTokenIdx);
      setHasSpokenStarted(false);
      setManualJumpRevision((r) => r + 1);
    }
  }, [activeSentenceIndex, sentenceLines]);

  // 오른쪽 화살표(→): 한 문장 아래로 이동
  const handleAdvanceLine = useCallback(() => {
    if (sentenceLines.length === 0) return;

    const targetSentenceIdx = Math.min(sentenceLines.length - 1, activeSentenceIndex + 1);
    const targetSentence = sentenceLines[targetSentenceIdx];

    if (targetSentence && targetSentence.tokens.length > 0) {
      const targetTokenIdx = targetSentence.tokens[0].index;
      lastManualJumpTimeRef.current = performance.now();
      tokenIndexRef.current = targetTokenIdx;
      setCurrentSpokenTokenIndex(targetTokenIdx);
      setHasSpokenStarted(false);
      setManualJumpRevision((r) => r + 1);
    }
  }, [activeSentenceIndex, sentenceLines]);

  // Save scripts to localStorage
  useEffect(() => {
    localStorage.setItem('prompter_scripts', JSON.stringify(scripts));
  }, [scripts]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('prompter_settings', JSON.stringify(settings));
  }, [settings]);

  // Timer effect (실제 발화가 시작되었거나 수동 스크롤 재생 중일 때 카운트)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying && mode === 'prompt' && (!settings.voiceTracking || hasSpokenStarted)) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, mode, settings.voiceTracking, hasSpokenStarted]);

  // Initialize SpeechTracker
  useEffect(() => {
    speechTrackerRef.current = new SpeechTracker();
    return () => {
      speechTrackerRef.current?.stop();
    };
  }, []);

  // Update speech tracker language when setting changes
  useEffect(() => {
    if (speechTrackerRef.current) {
      speechTrackerRef.current.language = settings.voiceLanguage;
    }
  }, [settings.voiceLanguage]);

  // Function to start speech recognition
  const startListening = useCallback(() => {
    const tracker = speechTrackerRef.current;
    if (!tracker) return;

    setSpeechError(null);
    tracker.start(
      (transcript: string) => {
        // Ignore stale recognition events right after manual sentence jump (←)
        if (performance.now() - lastManualJumpTimeRef.current < 650) {
          return;
        }

        const matchIdx = findMatchingTokenIndex(transcript, tokens, tokenIndexRef.current);
        if (matchIdx !== null && matchIdx >= tokenIndexRef.current) {
          // 실제로 대본의 단어가 읽힌 것이 확인되었을 때만 스크롤 허용 및 목표 위치 갱신!
          setHasSpokenStarted(true);
          tokenIndexRef.current = matchIdx;
          setCurrentSpokenTokenIndex(matchIdx);
          setSpeechMatchCount((c) => c + 1);
        }
      },
      (error: string) => {
        setSpeechError(error);
      },
      (listening: boolean) => {
        setIsListening(listening);
      },
      (vol: number) => {
        setAudioVolume(vol);
      }
    );
  }, [tokens]);

  // Start / Stop speech recognition based on isPlaying & voiceTracking
  useEffect(() => {
    const tracker = speechTrackerRef.current;
    if (!tracker) return;

    if (mode === 'prompt' && isPlaying && settings.voiceTracking) {
      startListening();
    } else {
      tracker.stop();
      setIsListening(false);
      setAudioVolume(0);
    }
  }, [mode, isPlaying, settings.voiceTracking, startListening]);

  // Handlers
  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const nextPlaying = !prev;
      if (nextPlaying && hoveredTokenIndexRef.current !== null) {
        const startTokenIdx = hoveredTokenIndexRef.current;
        lastManualJumpTimeRef.current = performance.now();
        tokenIndexRef.current = startTokenIdx;
        setCurrentSpokenTokenIndex(startTokenIdx);
        setHasSpokenStarted(false);
        setManualJumpRevision((r) => r + 1);
      }
      return nextPlaying;
    });
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(true);
    setHasSpokenStarted(false);
    tokenIndexRef.current = 0;
    setCurrentSpokenTokenIndex(0);
    setSpeechMatchCount(0);
    setManualJumpRevision(0);
    setElapsedSeconds(0);
    setProgressPercent(0);
  }, []);

  const handleBackToEdit = useCallback(() => {
    setIsPlaying(false);
    setHasSpokenStarted(false);
    setMode('edit');
    setSpeechError(null);
  }, []);

  const handleStartPrompter = useCallback(() => {
    setMode('prompt');
    setIsPlaying(true);
    setHasSpokenStarted(false); // 강사가 처음 말하기 전에는 절대 혼자 스크롤되지 않음!
    tokenIndexRef.current = 0;
    setCurrentSpokenTokenIndex(0);
    setSpeechMatchCount(0);
    setManualJumpRevision(0);
    setElapsedSeconds(0);
    setProgressPercent(0);
    setSpeechError(null);
  }, []);

  const handleUpdateSettings = useCallback((newSettings: Partial<PrompterSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const handleToggleVoiceTracking = useCallback(() => {
    setSettings((prev) => ({ ...prev, voiceTracking: !prev.voiceTracking }));
  }, []);

  // 마우스로 특정 문장을 클릭하거나 휠로 위치를 지정했을 때 호출 (클릭한 문장을 읽는 위치에 올리고 강사가 말할 때까지 대기)
  const handleSelectTokenIndex = useCallback((index: number, startPlaying: boolean = false) => {
    lastManualJumpTimeRef.current = performance.now();
    tokenIndexRef.current = index;
    setCurrentSpokenTokenIndex(index);
    setHasSpokenStarted(false);
    setManualJumpRevision((r) => r + 1);
    if (startPlaying) {
      setIsPlaying(true);
    }
  }, []);

  // 스크롤이 진행됨에 따라 현재 가이드라인에 위치한 문장의 첫 토큰 인덱스를 동기화
  const handleSyncGuideTokenIndex = useCallback((index: number) => {
    if (index > tokenIndexRef.current) {
      tokenIndexRef.current = index;
      setCurrentSpokenTokenIndex(index);
    }
  }, []);

  const handleHoverTokenIndex = useCallback((index: number | null) => {
    hoveredTokenIndexRef.current = index;
  }, []);

  // Keyboard Shortcuts (NG 한 문장 되감기 및 제어)
  useEffect(() => {
    if (mode !== 'prompt') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handleTogglePlay();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSettings((prev) => ({ ...prev, scrollSpeed: Math.min(100, prev.scrollSpeed + 5) }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSettings((prev) => ({ ...prev, scrollSpeed: Math.max(5, prev.scrollSpeed - 5) }));
          break;
        case 'ArrowLeft':
        case 'Backspace':
        case 'KeyZ':
          // NG 발생 시 한 문장 위로 올라가기!
          e.preventDefault();
          handleRewindLine();
          break;
        case 'ArrowRight':
        case 'KeyX':
          // 한 문장 아래로 건너뛰기
          e.preventDefault();
          handleAdvanceLine();
          break;
        case 'KeyR':
          e.preventDefault();
          handleReset();
          break;
        case 'Escape':
          e.preventDefault();
          handleBackToEdit();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleTogglePlay, handleRewindLine, handleAdvanceLine, handleReset, handleBackToEdit]);

  // Script CRUD Handlers
  const handleSelectScript = (id: string) => {
    setCurrentScriptId(id);
    handleReset();
  };

  const handleUpdateScript = (id: string, updates: Partial<Script>) => {
    setScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s))
    );
  };

  const handleCreateScript = () => {
    const newScript: Script = {
      id: `script-${Date.now()}`,
      title: '새 발표 대본',
      content: '',
      updatedAt: Date.now(),
    };
    setScripts((prev) => [newScript, ...prev]);
    setCurrentScriptId(newScript.id);
  };

  const handleDeleteScript = (id: string) => {
    if (scripts.length <= 1) return;
    const filtered = scripts.filter((s) => s.id !== id);
    setScripts(filtered);
    if (currentScriptId === id) {
      setCurrentScriptId(filtered[0].id);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden select-none">
      {mode === 'edit' ? (
        <EditorView
          scripts={scripts}
          currentScriptId={currentScriptId}
          onSelectScript={handleSelectScript}
          onUpdateScript={handleUpdateScript}
          onCreateScript={handleCreateScript}
          onDeleteScript={handleDeleteScript}
          onStartPrompter={handleStartPrompter}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      ) : (
        <>
          <PrompterScreen
            lines={lines}
            tokens={tokens}
            chapters={chapters}
            currentSpokenTokenIndex={currentSpokenTokenIndex}
            speechMatchCount={speechMatchCount}
            manualJumpRevision={manualJumpRevision}
            hasSpokenStarted={hasSpokenStarted}
            isPlaying={isPlaying}
            audioVolume={audioVolume}
            settings={settings}
            onUpdateProgress={setProgressPercent}
            onSelectTokenIndex={handleSelectTokenIndex}
            onSyncGuideTokenIndex={handleSyncGuideTokenIndex}
            onHoverTokenIndex={handleHoverTokenIndex}
            onUpdateSettings={handleUpdateSettings}
            onRewindLine={handleRewindLine}
            onAdvanceLine={handleAdvanceLine}
          />
          <ControlBar
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onReset={handleReset}
            onBackToEdit={handleBackToEdit}
            onOpenSettings={() => setIsSettingsOpen(true)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            elapsedSeconds={elapsedSeconds}
            progressPercent={progressPercent}
            isListening={isListening}
            onToggleVoiceTracking={handleToggleVoiceTracking}
            audioVolume={audioVolume}
            speechError={speechError}
            onRetryMic={startListening}
            onRewindLine={handleRewindLine}
            onAdvanceLine={handleAdvanceLine}
            hasSpokenStarted={hasSpokenStarted}
          />
        </>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
export default App;
