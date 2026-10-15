export interface Script {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export type ThemeType = 'dark-white' | 'dark-yellow' | 'dark-green' | 'light';
export type PrompterMode = 'edit' | 'prompt';

export interface PrompterSettings {
  fontSize: number;          // 24 ~ 160 px
  lineHeight: number;        // 1.2 ~ 2.6
  marginHorizontal: number;  // 5% ~ 35%
  theme: ThemeType;
  scrollSpeed: number;       // 5 ~ 100
  mirrorHorizontal: boolean; // 좌우 반전
  mirrorVertical: boolean;   // 상하 반전
  showGuideBar: boolean;     // 가이드라인 바 표시
  showTimer: boolean;        // 타이머 표시
  showProgressBar: boolean;  // 진행률 표시
  voiceTracking: boolean;    // 음성 인식 추적 활성화
  voiceLanguage: string;     // 'ko-KR' 등
  guidePosition: number;     // 상단 기준 가이드라인 위치 % (기본 35%)
}

export interface WordToken {
  index: number;
  word: string;
  cleanWord: string;
  lineIndex: number;
  sentenceIndex: number;
  color?: string;            // 출연자/강조 텍스트 색상 (Hex 코드)
  isParenthetical?: boolean; // 괄호 안에 포함된 지문/참고사항 단어 여부 (발화 스킵 대응)
  altCleanWord?: string;     // 괄호 내 부가 영단어/약어 등 보조 매칭 단어
}

export interface ScriptLine {
  lineIndex: number;
  sentenceIndex: number;     // 실제 읽는 문장 인덱스 (빈 줄이나 챕터 제목은 -1)
  tokens: WordToken[];
  rawText: string;
  isChapterHeading?: boolean;
  chapterTitle?: string;
  color?: string;            // 줄 기본 폰트 색상
  speakerLabel?: string;     // 토크형 촬영 화자 표시 (예: [진행자], [출연자A])
}

export interface ChapterMarker {
  id: string;
  title: string;
  lineIndex: number;
  tokenIndex: number;
}

export interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  lastSpokenIndex: number;
  error: string | null;
  isSupported: boolean;
}
