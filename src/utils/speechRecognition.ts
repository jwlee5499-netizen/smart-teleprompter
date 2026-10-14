import { WordToken, ScriptLine, ChapterMarker } from '../types';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  AudioContext?: any;
  webkitAudioContext?: any;
}

/**
 * 토크형 촬영 출연자 구분 및 강조용 프리셋 컬러 팔레트
 */
export interface FontColorPreset {
  tag: string;
  label: string;
  hex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const FONT_COLOR_PRESETS: FontColorPreset[] = [
  {
    tag: '노랑',
    label: '노랑 (출연자1)',
    hex: '#fde047',
    bgClass: 'bg-yellow-400',
    borderClass: 'border-yellow-400/60',
    textClass: 'text-yellow-300',
  },
  {
    tag: '하늘',
    label: '하늘 (출연자2)',
    hex: '#38bdf8',
    bgClass: 'bg-sky-400',
    borderClass: 'border-sky-400/60',
    textClass: 'text-sky-300',
  },
  {
    tag: '초록',
    label: '초록 (출연자3)',
    hex: '#4ade80',
    bgClass: 'bg-emerald-400',
    borderClass: 'border-emerald-400/60',
    textClass: 'text-emerald-300',
  },
  {
    tag: '핑크',
    label: '핑크 (출연자4)',
    hex: '#f472b6',
    bgClass: 'bg-pink-400',
    borderClass: 'border-pink-400/60',
    textClass: 'text-pink-300',
  },
  {
    tag: '주황',
    label: '주황 (출연자5)',
    hex: '#fb923c',
    bgClass: 'bg-orange-400',
    borderClass: 'border-orange-400/60',
    textClass: 'text-orange-300',
  },
  {
    tag: '보라',
    label: '보라 (출연자6)',
    hex: '#c084fc',
    bgClass: 'bg-purple-400',
    borderClass: 'border-purple-400/60',
    textClass: 'text-purple-300',
  },
  {
    tag: '민트',
    label: '민트',
    hex: '#2dd4bf',
    bgClass: 'bg-teal-400',
    borderClass: 'border-teal-400/60',
    textClass: 'text-teal-300',
  },
  {
    tag: '빨강',
    label: '빨강 (강조)',
    hex: '#f87171',
    bgClass: 'bg-red-400',
    borderClass: 'border-red-400/60',
    textClass: 'text-red-300',
  },
];

export const FONT_COLOR_MAP: Record<string, string> = {
  노랑: '#fde047',
  옐로우: '#fde047',
  yellow: '#fde047',
  하늘: '#38bdf8',
  파랑: '#60a5fa',
  블루: '#38bdf8',
  blue: '#38bdf8',
  초록: '#4ade80',
  그린: '#4ade80',
  green: '#4ade80',
  핑크: '#f472b6',
  분홍: '#f472b6',
  pink: '#f472b6',
  주황: '#fb923c',
  오렌지: '#fb923c',
  orange: '#fb923c',
  보라: '#c084fc',
  퍼플: '#c084fc',
  purple: '#c084fc',
  민트: '#2dd4bf',
  mint: '#2dd4bf',
  빨강: '#f87171',
  레드: '#f87171',
  red: '#f87171',
  흰색: '#ffffff',
  화이트: '#ffffff',
  white: '#ffffff',
};

/**
 * 특수문자 및 기호를 제거하고 순수 한글/영숫자만 추출
 */
export function cleanWord(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    .trim();
}

/**
 * 한국어 유사도 매칭 (조사/어미 차이 대응하되 오매칭으로 앞서가는 현상 방지)
 */
export function isKoreanWordSimilar(scriptWord: string, spokenWord: string): boolean {
  if (!scriptWord || !spokenWord) return false;
  if (scriptWord === spokenWord) return true;

  const minLen = Math.min(scriptWord.length, spokenWord.length);
  const maxLen = Math.max(scriptWord.length, spokenWord.length);

  // 1. 접두사 일치 (어근이 같고 조사/어미만 1~2글자 차이 나는 경우)
  if (scriptWord.startsWith(spokenWord) || spokenWord.startsWith(scriptWord)) {
    if (minLen >= 2 && maxLen - minLen <= 2) {
      return true;
    }
  }

  // 2. 3글자 이상 단어에서 앞 2글자 이상이 일치하고 길이 차이가 1 이하인 경우
  if (minLen >= 3 && maxLen - minLen <= 1) {
    if (scriptWord.slice(0, 2) === spokenWord.slice(0, 2)) {
      return true;
    }
  }

  return false;
}

/**
 * 대본 텍스트를 문장(Sentence) 단위의 라인 구조, 단어 토큰, 챕터 태그, 폰트 색상으로 파싱
 */
export function tokenizeScript(text: string): {
  tokens: WordToken[];
  lines: ScriptLine[];
  chapters: ChapterMarker[];
  sentenceLines: ScriptLine[];
} {
  const rawLines = text.split('\n');
  const tokens: WordToken[] = [];
  const lines: ScriptLine[] = [];
  const chapters: ChapterMarker[] = [];
  const sentenceLines: ScriptLine[] = [];

  let tokenCounter = 0;
  let lineCounter = 0;
  let sentenceCounter = 0;

  rawLines.forEach((rawLineText) => {
    let workingLine = rawLineText.trim();

    // 빈 줄 처리
    if (!workingLine) {
      lines.push({
        lineIndex: lineCounter++,
        sentenceIndex: -1,
        tokens: [],
        rawText: '',
      });
      return;
    }

    // 1. 줄 시작 부분에 전체 줄 색상 태그가 있는 경우 확인 (단, 줄 안에 닫는 태그 {/} 가 없는 경우에만 줄 전체 기본색으로 적용)
    let lineDefaultColor: string | undefined;
    const hasClosingTagInLine = /\{\/[^}]*\}/.test(workingLine);
    const lineColorMatch = workingLine.match(/^\{([^/}]+)\}\s*/);

    if (lineColorMatch && !hasClosingTagInLine) {
      const tagKey = lineColorMatch[1].trim().toLowerCase();
      if (FONT_COLOR_MAP[tagKey]) {
        lineDefaultColor = FONT_COLOR_MAP[tagKey];
        workingLine = workingLine.slice(lineColorMatch[0].length).trim();
      }
    }

    if (!workingLine) {
      lines.push({
        lineIndex: lineCounter++,
        sentenceIndex: -1,
        tokens: [],
        rawText: '',
      });
      return;
    }

    // 2. 챕터 태그 감지 (# 1. 도입부, ## 소제목, 또는 단독 [파트명])
    const cleanForChapterCheck = workingLine
      .replace(/\{([^/}]+)\}/g, '')
      .replace(/\{\/[^}]*\}/g, '')
      .trim();
    const isHashTag = /^#{1,3}\s+(.+)/.test(cleanForChapterCheck);
    const isStandaloneBracketTag = /^\[([^\]]+)\]$/.test(cleanForChapterCheck);
    let chapterTitle: string | undefined;

    if (isHashTag) {
      const match = cleanForChapterCheck.match(/^#{1,3}\s+(.+)/);
      if (match) chapterTitle = match[1].trim();
    } else if (isStandaloneBracketTag) {
      const match = cleanForChapterCheck.match(/^\[([^\]]+)\]$/);
      if (match) chapterTitle = match[1].trim();
    }

    if (chapterTitle) {
      const thisLineIdx = lineCounter++;
      chapters.push({
        id: `chap-${thisLineIdx}`,
        title: chapterTitle,
        lineIndex: thisLineIdx,
        tokenIndex: tokenCounter,
      });
      lines.push({
        lineIndex: thisLineIdx,
        sentenceIndex: -1,
        tokens: [],
        rawText: rawLineText,
        isChapterHeading: true,
        chapterTitle: chapterTitle,
        color: lineDefaultColor,
      });
      return;
    }

    // 3. 토크형 화자 이름 표시 추출 (예: "[진행자] 안녕하세요..." 또는 "{노랑} [출연자A] 반갑습니다...")
    let lineSpeakerLabel: string | undefined;
    let speakerColor: string | undefined = lineDefaultColor;

    // 줄 맨 앞에 인라인 색상 태그 + [화자] 형태가 있는 경우도 지원
    const coloredSpeakerMatch = workingLine.match(/^(?:\{([^/}]+)\}\s*)?\[([^\]]+)\](?:\{\/[^}]*\})?\s+(.+)$/);
    if (coloredSpeakerMatch) {
      if (coloredSpeakerMatch[1]) {
        const cKey = coloredSpeakerMatch[1].trim().toLowerCase();
        if (FONT_COLOR_MAP[cKey]) {
          speakerColor = FONT_COLOR_MAP[cKey];
          if (!hasClosingTagInLine) {
            lineDefaultColor = speakerColor;
          }
        }
      }
      lineSpeakerLabel = coloredSpeakerMatch[2].trim();
      workingLine = coloredSpeakerMatch[3].trim();
    }

    // 4. 한 줄에 여러 문장이 있는 경우 문장 부호(. ? !) 기준으로 분리하되 인라인 색상 상태는 유지
    const sentenceChunks = workingLine
      .split(/(?<=[가-힣a-zA-Z][.?!](?:\{\/[^}]*\})?)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let activeInlineColor: string | undefined = lineDefaultColor;

    sentenceChunks.forEach((chunk, chunkIdx) => {
      const rawWords = chunk.split(/\s+/).filter(Boolean);
      if (rawWords.length === 0) return;

      const thisLineIdx = lineCounter++;
      const thisSentenceIdx = sentenceCounter++;
      const lineTokens: WordToken[] = [];

      rawWords.forEach((rawWord) => {
        let wordText = rawWord;
        let resetAfterThisWord = false;

        // 단어 앞이나 중간에 시작 색상 태그 {색상} 이 있는 경우 추출
        const openTagRegex = /\{([^/}]+)\}/g;
        let openMatch: RegExpExecArray | null;
        while ((openMatch = openTagRegex.exec(wordText)) !== null) {
          const tagKey = openMatch[1].trim().toLowerCase();
          if (FONT_COLOR_MAP[tagKey]) {
            activeInlineColor = FONT_COLOR_MAP[tagKey];
          }
        }
        wordText = wordText.replace(/\{([^/}]+)\}/g, '');

        // 닫는 색상 태그 {/} 또는 {/색상} 이 있는 경우 현재 단어까지 색상을 적용한 뒤 기본 줄 색상으로 복귀
        if (/\{\/[^}]*\}/.test(wordText)) {
          resetAfterThisWord = true;
          wordText = wordText.replace(/\{\/[^}]*\}/g, '');
        }

        const trimmedWord = wordText.trim();
        const wordColor = activeInlineColor;

        if (resetAfterThisWord) {
          activeInlineColor = lineDefaultColor;
        }

        if (!trimmedWord) return;

        const cleaned = cleanWord(trimmedWord);
        const token: WordToken = {
          index: tokenCounter,
          word: trimmedWord,
          cleanWord: cleaned,
          lineIndex: thisLineIdx,
          sentenceIndex: thisSentenceIdx,
          color: wordColor,
        };
        tokens.push(token);
        lineTokens.push(token);
        tokenCounter++;
      });

      if (lineTokens.length === 0) return;

      const scriptLine: ScriptLine = {
        lineIndex: thisLineIdx,
        sentenceIndex: thisSentenceIdx,
        tokens: lineTokens,
        rawText: chunk,
        color: speakerColor || lineDefaultColor,
        speakerLabel: chunkIdx === 0 ? lineSpeakerLabel : undefined,
      };

      lines.push(scriptLine);
      sentenceLines.push(scriptLine);
    });
  });

  chapters.forEach((ch) => {
    if (tokens.length > 0 && ch.tokenIndex >= tokens.length) {
      ch.tokenIndex = tokens.length - 1;
    }
  });

  return { tokens, lines, chapters, sentenceLines };
}

/**
 * 음성 인식된 텍스트와 대본 토큰을 엄격한 순차 전방(Sequential Forward-only) 방식으로 매칭합니다.
 */
export function findMatchingTokenIndex(
  spokenPhrase: string,
  tokens: WordToken[],
  currentIndex: number
): number | null {
  if (!spokenPhrase || tokens.length === 0) return null;

  const spokenWords = spokenPhrase
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w.length > 0);

  if (spokenWords.length === 0) return null;

  const recentSpoken = spokenWords.slice(-3);
  const start = Math.max(0, currentIndex);

  // 1. 최근 2단어 연속 일치 검색 (현재 위치 ~ 최대 +6단어 이내에서만 순차 탐색)
  const pairEnd = Math.min(tokens.length - 1, currentIndex + 6);
  if (recentSpoken.length >= 2) {
    for (let s = recentSpoken.length - 2; s >= 0; s--) {
      const w1 = recentSpoken[s];
      const w2 = recentSpoken[s + 1];

      for (let i = start; i <= pairEnd - 1; i++) {
        if (
          isKoreanWordSimilar(tokens[i].cleanWord, w1) &&
          isKoreanWordSimilar(tokens[i + 1].cleanWord, w2)
        ) {
          return i + 1;
        }
      }
    }
  }

  // 2. 단일 단어 일치 검색: 오직 현재 단어(currentIndex) 또는 바로 다음 1~2단어(currentIndex + 1, +2)만 허용!
  const singleEnd = Math.min(tokens.length - 1, currentIndex + 2);
  const latestTwoWords = spokenWords.slice(-2);

  for (let s = latestTwoWords.length - 1; s >= 0; s--) {
    const spWord = latestTwoWords[s];
    if (spWord.length < 2) continue;

    for (let i = start; i <= singleEnd; i++) {
      if (
        i > currentIndex &&
        isKoreanWordSimilar(tokens[i].cleanWord, tokens[currentIndex].cleanWord)
      ) {
        const matchCountInSpoken = latestTwoWords.filter((w) =>
          isKoreanWordSimilar(tokens[i].cleanWord, w)
        ).length;
        if (matchCountInSpoken < 2) continue;
      }

      if (tokens[i].cleanWord === spWord || isKoreanWordSimilar(tokens[i].cleanWord, spWord)) {
        return i;
      }
    }
  }

  return null;
}

export class SpeechTracker {
  private recognition: any = null;
  private isListeningRequested: boolean = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneStream: MediaStream | null = null;
  private animFrameId: number | null = null;

  public language: string = 'ko-KR';
  private onResultCallback?: (transcript: string, isFinal: boolean) => void;
  private onErrorCallback?: (err: string) => void;
  private onStateChangeCallback?: (isListening: boolean) => void;
  private onVolumeChangeCallback?: (volume: number) => void;

  constructor() {
    const win = typeof window !== 'undefined' ? (window as IWindow) : null;
    const SpeechRec = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (SpeechRec) {
      this.initRecognition(SpeechRec);
    }
  }

  private initRecognition(SpeechRec: any) {
    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.language;

      this.recognition.onresult = (event: any) => {
        const latestIdx = event.results.length - 1;
        if (latestIdx < event.resultIndex) return;

        const latestItem = event.results[latestIdx];
        const transcript = (latestItem[0]?.transcript || '').trim();
        const isFinal = !!latestItem.isFinal;

        if (transcript && this.onResultCallback) {
          this.onResultCallback(transcript, isFinal);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        let userMsg = event.error;
        if (event.error === 'not-allowed') {
          userMsg = '마이크 권한이 차단되었습니다. 브라우저 주소창 좌측의 설정/자물쇠 아이콘에서 마이크를 허용해주세요.';
        } else if (event.error === 'network') {
          userMsg = '음성 인식 서버(인터넷) 연결을 확인해주세요.';
        } else if (event.error === 'audio-capture') {
          userMsg = '마이크 하드웨어를 찾을 수 없습니다. 마이크 연결을 확인해주세요.';
        }

        if (this.onErrorCallback) {
          this.onErrorCallback(userMsg);
        }
      };

      this.recognition.onend = () => {
        if (this.isListeningRequested) {
          setTimeout(() => {
            if (this.isListeningRequested && this.recognition) {
              try {
                this.recognition.start();
              } catch (e) {}
            }
          }, 120);
        } else {
          if (this.onStateChangeCallback) {
            this.onStateChangeCallback(false);
          }
        }
      };
    } catch (e) {
      console.error('Failed to init speech recognition:', e);
    }
  }

  public isSupported(): boolean {
    const win = typeof window !== 'undefined' ? (window as IWindow) : null;
    return !!(win?.SpeechRecognition || win?.webkitSpeechRecognition);
  }

  public async startAudioMeter(onVolume: (vol: number) => void): Promise<boolean> {
    this.onVolumeChangeCallback = onVolume;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.microphoneStream = stream;

        const win = window as IWindow;
        const AudioCtx = win.AudioContext || win.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          this.audioContext = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          this.analyser = analyser;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkVolume = () => {
            if (!this.analyser || !this.isListeningRequested) return;

            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const vol = Math.min(100, Math.round((average / 128) * 100));
            if (this.onVolumeChangeCallback) {
              this.onVolumeChangeCallback(vol);
            }

            this.animFrameId = requestAnimationFrame(checkVolume);
          };

          checkVolume();
        }
        return true;
      }
    } catch (err: any) {
      console.warn('Microphone permission / AudioMeter error:', err);
      if (this.onErrorCallback) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          this.onErrorCallback('브라우저 마이크 접근 권한이 필요합니다. 주소창 좌측 아이콘에서 [마이크 허용]을 선택해주세요.');
        } else if (err.name === 'NotFoundError') {
          this.onErrorCallback('연결된 마이크 장치를 찾을 수 없습니다.');
        }
      }
      return false;
    }
    return false;
  }

  public async start(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (err: string) => void,
    onStateChange?: (isListening: boolean) => void,
    onVolume?: (vol: number) => void
  ) {
    if (!this.isSupported()) {
      if (onError) {
        onError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.');
      }
      return;
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.onStateChangeCallback = onStateChange;
    this.isListeningRequested = true;

    if (onVolume) {
      await this.startAudioMeter(onVolume);
    }

    if (this.recognition) {
      this.recognition.lang = this.language;
      try {
        this.recognition.start();
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback(true);
        }
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') {
          console.warn('Recognition start error:', e);
        }
      }
    }
  }

  public stop() {
    this.isListeningRequested = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(false);
    }
    if (this.onVolumeChangeCallback) {
      this.onVolumeChangeCallback(0);
    }
  }
}
