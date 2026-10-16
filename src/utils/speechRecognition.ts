import { WordToken, ScriptLine, ChapterMarker } from '../types';

export const globalAudioState = {
  volume: 0,
  lastVoiceTime: 0,
};

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
    .replace(/[\(\[\（\〔\【\〈\《\「\)\]\）\〕\】\〉\》\」]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    .trim();
}

/**
 * 숫자 및 한글 수사 상호 매칭 사전
 */
const NUMBER_TO_KOREAN: Record<string, string[]> = {
  '1': ['일', '첫', '하나', '첫번째', '일번'],
  '2': ['이', '둘', '두', '두번째', '이번'],
  '3': ['삼', '셋', '세', '세번째', '삼번'],
  '4': ['사', '넷', '네', '네번째', '사번'],
  '5': ['오', '다섯', '다섯번째', '오번'],
  '6': ['육', '여섯', '여섯번째', '육번'],
  '7': ['칠', '일곱', '일곱번째', '칠번'],
  '8': ['팔', '여덟', '여덟번째', '팔번'],
  '9': ['구', '아홉', '아홉번째', '구번'],
  '10': ['십', '열', '열번째', '십번'],
};

/**
 * 한국어 유사도 매칭:
 * - 조사/어미 차이 대응 (예: "발표를" vs "발표는", "돈을" vs "돈이", "집에" vs "집으로")
 * - 동사/형용사 활용형 대응 (예: "시작하겠습니다" vs "시작합니다", "알아보겠습니다" vs "알아봅니다")
 * - 숫자 및 한글 수사 대응 (예: "1" vs "일"/"첫", "2" vs "이"/"둘"/"두")
 */
export function isKoreanWordSimilar(scriptWord: string, spokenWord: string): boolean {
  if (!scriptWord || !spokenWord) return false;
  if (scriptWord === spokenWord) return true;

  const minLen = Math.min(scriptWord.length, spokenWord.length);
  const maxLen = Math.max(scriptWord.length, spokenWord.length);

  // 1. 숫자 <-> 한글 수사 상호 매칭 대응
  if (NUMBER_TO_KOREAN[scriptWord]?.includes(spokenWord) || NUMBER_TO_KOREAN[spokenWord]?.includes(scriptWord)) {
    return true;
  }
  const digitMatch = scriptWord.match(/^(\d+)(.*)$/);
  if (digitMatch && NUMBER_TO_KOREAN[digitMatch[1]]) {
    const numWords = NUMBER_TO_KOREAN[digitMatch[1]];
    if (numWords.some((nw) => spokenWord.startsWith(nw))) {
      return true;
    }
  }

  // 2. 접두사 일치 (어근이 같고 조사/어미만 1~2글자 차이 나는 경우)
  if (scriptWord.startsWith(spokenWord) || spokenWord.startsWith(scriptWord)) {
    if (minLen >= 2 && maxLen - minLen <= 2) {
      return true;
    }
  }

  // 3. 2글자 이상 어근 일치 및 활용형 대응
  if (minLen >= 2) {
    // 2글자 단어에서 첫 글자가 같은 조사 차이 (예: "돈을" vs "돈이", "집에" vs "집을")
    if (minLen === 2 && maxLen === 2 && scriptWord[0] === spokenWord[0]) {
      return true;
    }

    // 2~3글자 이상 어근이 같고 길이 차이가 2 이하인 경우 ("발표를" vs "발표는", "시작하겠습니다" vs "시작합니다")
    if (scriptWord.slice(0, 2) === spokenWord.slice(0, 2) && maxLen - minLen <= 2) {
      return true;
    }

    // 4글자 이상 긴 단어에서 앞 3글자 어근이 같은 경우 (어미 변형 허용)
    if (minLen >= 4 && scriptWord.slice(0, 3) === spokenWord.slice(0, 3) && maxLen - minLen <= 3) {
      return true;
    }
  }

  return false;
}

/**
 * 괄호( 지문, 외래어/영문 병기 등 ) 내부의 공백이 일반 어절 분리로 쪼개지지 않도록 보존하여 어절 목록을 추출합니다.
 * 예: "카슨(Anne Carson)을 발표했는데요" -> ["카슨(Anne Carson)을", "발표했는데요"]
 * 예: "(자료화면 제시 15초) 다음으로" -> ["(자료화면 제시 15초)", "다음으로"]
 */
export function extractWordsPreservingParentheses(str: string): string[] {
  const words: string[] = [];
  let current = '';
  let inParen = false;

  const OPEN_BRACKETS = '([（〔【〈《「';
  const CLOSE_BRACKETS = ')]）〕】〉》」';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (OPEN_BRACKETS.includes(ch)) {
      inParen = true;
      current += ch;
    } else if (CLOSE_BRACKETS.includes(ch)) {
      inParen = false;
      current += ch;
    } else if (/\s/.test(ch)) {
      if (inParen) {
        current += ch;
      } else {
        if (current.trim()) {
          words.push(current.trim());
          current = '';
        }
      }
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    words.push(current.trim());
  }
  return words;
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
      const rawWords = extractWordsPreservingParentheses(chunk);
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

        // 괄호/지문 및 부가어절(영단어/외래어 병기 등) 분석
        const OPEN_BRACKETS = '([（〔【〈《「';
        const CLOSE_BRACKETS = ')]）〕】〉》」';
        const hasOpen = [...trimmedWord].some((ch) => OPEN_BRACKETS.includes(ch));
        const hasClose = [...trimmedWord].some((ch) => CLOSE_BRACKETS.includes(ch));

        let isParenthetical = false;
        let cleaned = cleanWord(trimmedWord);
        let altCleaned: string | undefined;

        if (hasOpen || hasClose) {
          // 괄호 안의 내용을 완전히 제거했을 때 외부에 남는 한국어/텍스트 확인
          const stripped = trimmedWord
            .replace(/[\(\[\（\〔\【\〈\《\「][^\)\]\）\〕\】\〉\》\」]*[\)\]\）\〕\】\〉\》\」]/g, '')
            .trim();

          if (!stripped) {
            // (자료화면 제시), (웃음) 등 괄호 밖 텍스트가 없는 순수 지문/비발화 연출
            isParenthetical = true;
            cleaned = '';
          } else {
            // "카슨(Anne Carson)을" 또는 "스마트폰(Smartphone)" 처럼 본문 명사/조사에 괄호 병기가 붙은 경우:
            // 괄호 밖의 본문(예: "카슨을", "스마트폰")을 기본 cleanWord로 추출하여 음성인식의 기준어로 삼습니다.
            cleaned = cleanWord(stripped);
            isParenthetical = false;

            // 괄호 안의 내용(예: "Anne Carson", "Smartphone")도 보조 인식어(altCleanWord)로 등록
            const parenMatch = trimmedWord.match(/[\(\[\（\〔\【\〈\《\「]([^\)\]\）\〕\】\〉\》\」]*)[\)\]\）\〕\】\〉\》\」]/);
            if (parenMatch && parenMatch[1]) {
              altCleaned = cleanWord(parenMatch[1]);
            }
          }
        }

        const token: WordToken = {
          index: tokenCounter,
          word: trimmedWord,
          cleanWord: cleaned,
          altCleanWord: altCleaned,
          isParenthetical,
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
 * 한국어 단일 음절 및 고빈도 조사/단어 (단일 단어로는 원거리 점프를 방지할 불용어 목록)
 */
const KOREAN_STOPWORDS = new Set([
  '네', '예', '그', '이', '저', '수', '것', '등', '및', '또', '더', '잘', '못', '안', '다', '참', '좀',
  '를', '을', '에', '와', '과', '도', '로', '으로', '하고', '에서', '에게', '한테'
]);

function isTokenMatch(token: WordToken | undefined, spokenWord: string): boolean {
  if (!token || !spokenWord) return false;
  if (token.cleanWord && (token.cleanWord === spokenWord || isKoreanWordSimilar(token.cleanWord, spokenWord))) {
    return true;
  }
  if (token.altCleanWord) {
    if (token.altCleanWord === spokenWord || isKoreanWordSimilar(token.altCleanWord, spokenWord)) {
      return true;
    }
    // 영어 병기 또는 복합어 (예: "anne carson" 안에 "carson" 또는 "anne"이 포함된 경우)
    if (token.altCleanWord.split(/\s+/).some((w) => w === spokenWord || isKoreanWordSimilar(w, spokenWord))) {
      return true;
    }
  }
  return false;
}

function getNextNonParentheticalIndex(tokens: WordToken[], fromIndex: number): number {
  let idx = fromIndex;
  while (idx < tokens.length && tokens[idx].isParenthetical) {
    idx++;
  }
  return idx;
}

/**
 * 음성 인식된 텍스트와 대본 토큰을 스마트하게 매칭합니다.
 *
 * [핵심 원칙: 지역성 최우선 (Proximity Priority) 및 계층형 가드레일]
 * 1. 현재 읽고 있는 문장(Zone 1) 우선 매칭:
 *    - 현재 문장 내에 발화된 단어가 존재하면 절대 다음 문장이나 다른 단락으로 건너뛰지 않습니다.
 *    - 같은 단어(예: "우리가", "오늘", "카슨")가 다음 단락이나 다음 문장에 있더라도
 *      현재 문장 내부에서 먼저 완전히 소비되므로 문장/단락 점프 오작동이 원천 차단됩니다.
 * 2. 가이드라인 바로 아래 문장(Zone 2) 선행 읽기 대응:
 *    - 현재 문장을 다 읽었거나(startIdx >= currentSentenceEnd), 화자가 바로 아래 문장을 2어절 이상 연속으로 읽을 때만
 *      다음 문장으로 자연스럽게 전진합니다. 아직 현재 문장을 읽는 중에는 단일 단어로 다음 문장으로 점프할 수 없습니다.
 * 3. 2문장 이상 원거리/다음 단락(Zone 3) 점프 제한:
 *    - 2문장 이상 먼 곳이나 다음 단락으로 넘어가려면 반드시 최신 발화 기준 3어절 이상 연속 일치해야만 허용됩니다.
 * 4. 괄호 지문 스킵:
 *    - (자료화면 제시), (웃음) 등은 거리 0의 스킵 가능한 지문으로 처리되어 강사가 읽지 않아도 다음 본문이 즉시 매칭됩니다.
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

  // 1. 현재 유효 시작 위치 계산 (괄호 안 지문 토큰이면 다음 발화 토큰으로 이동)
  const clampedCurrent = Math.max(0, Math.min(tokens.length - 1, currentIndex));
  const startIdx = tokens[clampedCurrent]?.isParenthetical
    ? getNextNonParentheticalIndex(tokens, clampedCurrent)
    : clampedCurrent;

  if (startIdx >= tokens.length) return null;

  // 2. 현재 문장 및 다음 문장의 인덱스 경계 계산
  const currentSentenceIdx = tokens[startIdx].sentenceIndex;
  let currentSentenceEnd = startIdx;
  while (
    currentSentenceEnd + 1 < tokens.length &&
    tokens[currentSentenceEnd + 1].sentenceIndex === currentSentenceIdx
  ) {
    currentSentenceEnd++;
  }

  // ★ 핵심: Zone 1은 엄격히 '현재 문장 끝(currentSentenceEnd)'까지만 탐색합니다.
  // 다음 문장의 첫 어절로 Zone 1이 누수되면, 동일 단어나 유사어가 반복될 때
  // 단일 단어로도 다음 문장으로 튕겨 올라가는 치명적 오류가 발생하므로 누수되지 않도록 엄격히 차단합니다.
  const zone1End = currentSentenceEnd;

  // 다음 문장(Zone 2)의 경계 계산
  let nextSentenceStart = -1;
  let nextSentenceEnd = -1;
  for (let i = currentSentenceEnd + 1; i < tokens.length; i++) {
    if (tokens[i].sentenceIndex > currentSentenceIdx) {
      if (nextSentenceStart === -1) {
        nextSentenceStart = i;
      }
      if (tokens[i].sentenceIndex === tokens[nextSentenceStart].sentenceIndex) {
        nextSentenceEnd = i;
      } else {
        break;
      }
    }
  }

  // =========================================================================
  // [1단계: Zone 1 - 현재 읽고 있는 문장 지역성 우선 매칭]
  // =========================================================================

  // 1-A) Zone 1 내 3어절 연속 일치
  if (spokenWords.length >= 3) {
    for (let s = spokenWords.length - 3; s >= 0; s--) {
      const w1 = spokenWords[s];
      const w2 = spokenWords[s + 1];
      const w3 = spokenWords[s + 2];
      if (w1.length < 2 && w2.length < 2) continue;

      for (let i = startIdx; i <= zone1End - 2; i++) {
        if (isTokenMatch(tokens[i], w1)) {
          let j = getNextNonParentheticalIndex(tokens, i + 1);
          if (i + 1 < tokens.length && tokens[i + 1].isParenthetical && isTokenMatch(tokens[i + 1], w2)) {
            j = i + 1;
          }
          if (j <= zone1End && isTokenMatch(tokens[j], w2)) {
            let k = getNextNonParentheticalIndex(tokens, j + 1);
            if (j + 1 < tokens.length && tokens[j + 1].isParenthetical && isTokenMatch(tokens[j + 1], w3)) {
              k = j + 1;
            }
            if (k <= zone1End && isTokenMatch(tokens[k], w3)) {
              return k;
            }
          }
        }
      }
    }
  }

  // 1-B) Zone 1 내 2어절 연속 일치 (한국어 띄어쓰기 결합 포함)
  if (spokenWords.length >= 2) {
    for (let s = spokenWords.length - 2; s >= 0; s--) {
      const w1 = spokenWords[s];
      const w2 = spokenWords[s + 1];
      if (w1.length < 2 && w2.length < 2) continue;

      for (let i = startIdx; i <= zone1End - 1; i++) {
        let j = getNextNonParentheticalIndex(tokens, i + 1);
        if (i + 1 < tokens.length && tokens[i + 1].isParenthetical && isTokenMatch(tokens[i + 1], w2)) {
          j = i + 1;
        }

        // 2어절 연속 일치
        if (isTokenMatch(tokens[i], w1) && j <= zone1End && isTokenMatch(tokens[j], w2)) {
          return j;
        }

        // 한국어 띄어쓰기 결합 (대본 '첫' '번째', 음성 '첫번째' + '항목을')
        if (j <= zone1End) {
          const combinedW1 = tokens[i].cleanWord + tokens[j].cleanWord;
          if (combinedW1 === w1 || isKoreanWordSimilar(combinedW1, w1)) {
            let k = getNextNonParentheticalIndex(tokens, j + 1);
            if (k <= zone1End && isTokenMatch(tokens[k], w2)) {
              return k;
            }
          }
        }
      }
    }
  }

  // 1-C) Zone 1 내 단일 단어 일치 (현재 문장 범위 내 어디서든 신속 매칭)
  const latestSpoken = spokenWords.slice(-4);
  for (let s = latestSpoken.length - 1; s >= 0; s--) {
    const spWord = latestSpoken[s];
    if (spWord.length < 2) continue;

    for (let i = startIdx; i <= zone1End; i++) {
      if (isTokenMatch(tokens[i], spWord)) {
        return i;
      }
    }
  }

  // 1-D) Zone 1 내 띄어쓰기 단일 단어 결합 (예: 대본 '인공지능' -> 음성 '인공' '지능')
  for (let s = spokenWords.length - 1; s >= Math.max(0, spokenWords.length - 3); s--) {
    const spWord = spokenWords[s];
    if (spWord.length < 3) continue;

    for (let i = startIdx; i <= zone1End - 1; i++) {
      let j = getNextNonParentheticalIndex(tokens, i + 1);
      if (j <= zone1End) {
        const combined = tokens[i].cleanWord + tokens[j].cleanWord;
        if (combined === spWord || isKoreanWordSimilar(combined, spWord)) {
          return j;
        }
      }
    }
  }

  // =========================================================================
  // ★ 중요: Zone 1(현재 문장)에서 일치하는 단어가 발견되었다면 여기서 이미 반환됨!
  // 아래 단계는 화자가 현재 문장을 읽지 않고 "가이드라인 아래 문장"이나 "다음 단락"을
  // 선행 발화했을 때만 실행됩니다.
  // =========================================================================

  // 이전 문장의 오래된 발화 단어로 미래 단락이 매칭되는 것을 차단하기 위해,
  // 원거리 선행 탐색은 오직 '가장 최근에 발화된 4개 단어'만을 후보로 사용합니다.
  const activeRecentSpoken = spokenWords.slice(-4);

  // =========================================================================
  // [2단계: Zone 2 - 가이드라인 바로 아래 문장(Next Sentence) 선행 읽기 대응]
  // =========================================================================
  if (nextSentenceStart !== -1 && nextSentenceEnd >= nextSentenceStart) {
    // 2-A) 바로 아래 문장에서 3어절 연속 일치
    if (activeRecentSpoken.length >= 3) {
      for (let s = activeRecentSpoken.length - 3; s >= 0; s--) {
        const w1 = activeRecentSpoken[s];
        const w2 = activeRecentSpoken[s + 1];
        const w3 = activeRecentSpoken[s + 2];
        if (w1.length < 2 && w2.length < 2) continue;

        for (let i = nextSentenceStart; i <= nextSentenceEnd - 2; i++) {
          if (isTokenMatch(tokens[i], w1)) {
            let j = getNextNonParentheticalIndex(tokens, i + 1);
            if (i + 1 < tokens.length && tokens[i + 1].isParenthetical && isTokenMatch(tokens[i + 1], w2)) {
              j = i + 1;
            }
            if (j <= nextSentenceEnd && isTokenMatch(tokens[j], w2)) {
              let k = getNextNonParentheticalIndex(tokens, j + 1);
              if (j + 1 < tokens.length && tokens[j + 1].isParenthetical && isTokenMatch(tokens[j + 1], w3)) {
                k = j + 1;
              }
              if (k <= nextSentenceEnd && isTokenMatch(tokens[k], w3)) {
                return k;
              }
            }
          }
        }
      }
    }

    // 2-B) 바로 아래 문장에서 2어절 연속 일치 (양쪽 단어 모두 길이 2 이상 필수)
    if (activeRecentSpoken.length >= 2) {
      for (let s = activeRecentSpoken.length - 2; s >= 0; s--) {
        const w1 = activeRecentSpoken[s];
        const w2 = activeRecentSpoken[s + 1];
        // 단어 길이가 1글자이거나 단순 불용어만으로 구성된 2어절 점프 차단
        if (w1.length < 2 || w2.length < 2) continue;
        if (KOREAN_STOPWORDS.has(w1) && KOREAN_STOPWORDS.has(w2)) continue;

        for (let i = nextSentenceStart; i <= nextSentenceEnd - 1; i++) {
          let j = getNextNonParentheticalIndex(tokens, i + 1);
          if (i + 1 < tokens.length && tokens[i + 1].isParenthetical && isTokenMatch(tokens[i + 1], w2)) {
            j = i + 1;
          }

          if (isTokenMatch(tokens[i], w1) && j <= nextSentenceEnd && isTokenMatch(tokens[j], w2)) {
            return j;
          }

          if (j <= nextSentenceEnd) {
            const combinedW1 = tokens[i].cleanWord + tokens[j].cleanWord;
            if (combinedW1 === w1 || isKoreanWordSimilar(combinedW1, w1)) {
              let k = getNextNonParentheticalIndex(tokens, j + 1);
              if (k <= nextSentenceEnd && isTokenMatch(tokens[k], w2)) {
                return k;
              }
            }
          }
        }
      }
    }

    // 2-C) 현재 문장이 이미 끝까지 완독된 상태(startIdx >= currentSentenceEnd)에서만
    //      다음 문장의 첫 번째 단어 단일 매칭을 허용합니다.
    //      (아직 현재 문장을 읽는 중에는 단일 단어로 다음 문장으로 절대 넘어가지 못합니다.)
    if (startIdx >= currentSentenceEnd) {
      for (let s = activeRecentSpoken.length - 1; s >= 0; s--) {
        const spWord = activeRecentSpoken[s];
        if (spWord.length < 2) continue;
        if (isTokenMatch(tokens[nextSentenceStart], spWord)) {
          return nextSentenceStart;
        }
      }
    }
  }

  // =========================================================================
  // [3단계: Zone 3 - 2문장 이상 원거리 / 다음 단락 선행 점프 (엄격한 가드레일)]
  // ★ 규칙: 2문장 이상 먼 곳이나 다음 단락으로 넘어가려면 반드시
  //           '최신 발화 기준 3어절 이상 연속 일치'해야만 점프를 허용합니다!
  //   단일 단어나 2어절로는 절대 다음 단락으로 건너뛰지 않습니다.
  // =========================================================================
  const zone3Start = nextSentenceEnd !== -1 ? nextSentenceEnd + 1 : currentSentenceEnd + 3;
  const zone3End = Math.min(tokens.length - 1, startIdx + 50);

  if (zone3Start <= zone3End && activeRecentSpoken.length >= 3) {
    for (let s = activeRecentSpoken.length - 3; s >= 0; s--) {
      const w1 = activeRecentSpoken[s];
      const w2 = activeRecentSpoken[s + 1];
      const w3 = activeRecentSpoken[s + 2];
      // 3개 단어 중 최소 2개 이상은 2글자 이상이어야 유효
      if ((w1.length >= 2 ? 1 : 0) + (w2.length >= 2 ? 1 : 0) + (w3.length >= 2 ? 1 : 0) < 2) {
        continue;
      }

      for (let i = zone3Start; i <= zone3End - 2; i++) {
        if (isTokenMatch(tokens[i], w1)) {
          let j = getNextNonParentheticalIndex(tokens, i + 1);
          if (i + 1 < tokens.length && tokens[i + 1].isParenthetical && isTokenMatch(tokens[i + 1], w2)) {
            j = i + 1;
          }
          if (j <= zone3End && isTokenMatch(tokens[j], w2)) {
            let k = getNextNonParentheticalIndex(tokens, j + 1);
            if (j + 1 < tokens.length && tokens[j + 1].isParenthetical && isTokenMatch(tokens[j + 1], w3)) {
              k = j + 1;
            }
            if (k <= zone3End && isTokenMatch(tokens[k], w3)) {
              return k;
            }
          }
        }
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
          let lastReportTime = 0;
          let lastReportedVol = 0;

          const checkVolume = () => {
            if (!this.analyser || !this.isListeningRequested) return;

            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const vol = Math.min(100, Math.round((average / 128) * 100));

            const now = performance.now();
            globalAudioState.volume = vol;
            if (vol > 4) {
              globalAudioState.lastVoiceTime = now;
            }

            // Throttle volume callbacks to ~12fps (80ms) unless volume drops to 0 or changes by >= 15%
            // This prevents 60-144Hz React state re-rendering lag while keeping LED meters responsive
            if (this.onVolumeChangeCallback) {
              if (
                now - lastReportTime >= 80 ||
                (vol === 0 && lastReportedVol !== 0) ||
                Math.abs(vol - lastReportedVol) >= 15
              ) {
                lastReportTime = now;
                lastReportedVol = vol;
                this.onVolumeChangeCallback(vol);
              }
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
    globalAudioState.volume = 0;

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
