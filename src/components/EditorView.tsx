import React, { useRef, useState, useMemo } from 'react';
import { Script, PrompterSettings } from '../types';
import { FONT_COLOR_PRESETS, FONT_COLOR_MAP, tokenizeScript } from '../utils/speechRecognition';
import {
  Play,
  Plus,
  Trash2,
  Download,
  Upload,
  Clock,
  FileText,
  Mic,
  Sliders,
  Sparkles,
  Palette,
  Eraser,
  Eye,
  Bookmark,
} from 'lucide-react';

interface EditorViewProps {
  scripts: Script[];
  currentScriptId: string;
  onSelectScript: (id: string) => void;
  onUpdateScript: (id: string, updates: Partial<Script>) => void;
  onCreateScript: () => void;
  onDeleteScript: (id: string) => void;
  onStartPrompter: () => void;
  settings: PrompterSettings;
  onOpenSettings: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  scripts,
  currentScriptId,
  onSelectScript,
  onUpdateScript,
  onCreateScript,
  onDeleteScript,
  onStartPrompter,
  settings,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 기본적으로 컬러 미리보기를 항상 켜두어 색상이 적용된 모습을 즉시 볼 수 있게 함
  const [showColorPreview, setShowColorPreview] = useState<boolean>(true);

  const activeScript = scripts.find((s) => s.id === currentScriptId) || scripts[0];

  // 실시간 컬러 미리보기용 파싱 (줄 전체 색상 + 부분 드래그 인라인 색상 + 화자 배지 모두 완벽 반영)
  const parsedPreview = useMemo(() => {
    return tokenizeScript(activeScript?.content || '');
  }, [activeScript?.content]);

  // Calculate estimated speaking time (approx. 320 Korean characters per minute)
  const charCount = activeScript?.content.length || 0;
  const wordCount = parsedPreview.tokens.length;
  const estimatedMinutes = Math.max(1, Math.ceil(charCount / 320));

  // Apply font color tag to selected text or current line(s)
  const handleApplyColor = (colorTag: string | null) => {
    const textarea = textareaRef.current;
    if (!textarea || !activeScript) return;

    const text = activeScript.content;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;

    // Find the start of the first line and end of the last line in the selection
    const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    const nextNewline = text.indexOf('\n', selEnd);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;

    const selectedText = text.slice(selStart, selEnd);
    const isSingleLinePartialSelection =
      selStart !== selEnd &&
      !selectedText.includes('\n') &&
      (selStart > lineStart || selEnd < lineEnd) &&
      selectedText.trim().length < text.slice(lineStart, lineEnd).trim().length;

    let newContent = text;
    let newCursorPos = selEnd;

    if (colorTag === null) {
      // 색상 해제: 선택된 줄(또는 현재 줄)에서 색상 태그 {색상} 및 {/} 제거
      const targetBlock = text.slice(lineStart, lineEnd);
      const cleanedBlock = targetBlock
        .replace(/\{([^/}]+)\}\s*/g, (match, tag) =>
          FONT_COLOR_MAP[tag.trim().toLowerCase()] ? '' : match
        )
        .replace(/\{\/[^}]*\}/g, '');

      newContent = text.slice(0, lineStart) + cleanedBlock + text.slice(lineEnd);
      newCursorPos = lineStart + cleanedBlock.length;
    } else if (isSingleLinePartialSelection) {
      // 한 줄 안에서 특정 단어만 드래그한 경우: {색상}선택텍스트{/} 로 감싸기
      const cleanSelected = selectedText
        .replace(/\{([^/}]+)\}/g, '')
        .replace(/\{\/[^}]*\}/g, '');
      const wrapped = `{${colorTag}}${cleanSelected}{/}`;
      newContent = text.slice(0, selStart) + wrapped + text.slice(selEnd);
      newCursorPos = selStart + wrapped.length;
    } else {
      // 커서가 있는 줄 전체 또는 여러 줄을 드래그한 경우: 각 줄 앞에 {색상} 적용
      const targetBlock = text.slice(lineStart, lineEnd);
      const updatedBlock = targetBlock
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || /^#{1,3}\s+/.test(trimmed)) return line;
          // 기존 줄의 색상 태그 제거 후 새 색상 태그 부여
          const withoutOldColor = line
            .replace(/^\s*\{([^/}]+)\}\s*/, (match, tag) =>
              FONT_COLOR_MAP[tag.trim().toLowerCase()] ? '' : match
            )
            .replace(/\{\/[^}]*\}/g, '');
          return `{${colorTag}} ${withoutOldColor.trimStart()}`;
        })
        .join('\n');

      newContent = text.slice(0, lineStart) + updatedBlock + text.slice(lineEnd);
      newCursorPos = lineStart + updatedBlock.length;
    }

    onUpdateScript(activeScript.id, { content: newContent });

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  // File import (.txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const title = file.name.replace(/\.[^/.]+$/, '');
        onUpdateScript(activeScript.id, {
          title: title || activeScript.title,
          content,
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // File export (.txt)
  const handleFileDownload = () => {
    if (!activeScript) return;
    const element = document.createElement('a');
    const file = new Blob([activeScript.content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeScript.title || '대본'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex h-screen bg-[#0d0e12] text-gray-200 overflow-hidden font-sans">
      {/* Sidebar: Scripts list */}
      <aside className="w-72 bg-[#13141a] border-r border-gray-800 flex flex-col flex-shrink-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight">스마트 프롬프터</h1>
              <p className="text-xs text-gray-400">Smart Voice Prompter</p>
            </div>
          </div>
        </div>

        {/* Script List Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">대본 보관함</span>
          <button
            onClick={onCreateScript}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded-md hover:bg-blue-950/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 대본</span>
          </button>
        </div>

        {/* Script List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {scripts.map((script) => (
            <div
              key={script.id}
              onClick={() => onSelectScript(script.id)}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                script.id === currentScriptId
                  ? 'bg-blue-600/20 border border-blue-500/50 text-white shadow-sm'
                  : 'hover:bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <FileText className={`w-4 h-4 flex-shrink-0 ${script.id === currentScriptId ? 'text-blue-400' : 'text-gray-500'}`} />
                <span className="truncate text-sm font-medium">{script.title || '제목 없음'}</span>
              </div>

              {scripts.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteScript(script.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 rounded transition-opacity"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Bottom Feature Guide */}
        <div className="p-4 border-t border-gray-800/80 bg-[#101116] space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
            <Palette className="w-4 h-4" />
            <span>토크형 화자별 컬러 미리보기</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            원하는 줄이나 단어를 드래그한 뒤 색상 버튼을 누르면 우측 <strong>실시간 컬러 미리보기</strong>에 즉시 색상이 적용되어 표시됩니다.
          </p>
        </div>
      </aside>

      {/* Main Content: Script Editor */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Editor Top Bar */}
        <header className="h-16 border-b border-gray-800 px-6 flex items-center justify-between bg-[#111218] flex-shrink-0">
          <div className="flex-1 max-w-lg mr-4">
            <input
              type="text"
              value={activeScript?.title || ''}
              onChange={(e) => onUpdateScript(activeScript.id, { title: e.target.value })}
              placeholder="대본 제목 입력..."
              className="w-full bg-transparent text-lg font-bold text-white focus:outline-none placeholder-gray-500"
            />
          </div>

          <div className="flex items-center gap-2.5">
            {/* Import / Export */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.md"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/80 hover:bg-gray-700 hover:text-white rounded-lg border border-gray-700 transition-colors"
              title="텍스트 파일 불러오기"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>파일 불러오기</span>
            </button>

            <button
              onClick={handleFileDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/80 hover:bg-gray-700 hover:text-white rounded-lg border border-gray-700 transition-colors"
              title="텍스트 파일로 저장"
            >
              <Download className="w-3.5 h-3.5" />
              <span>파일 저장</span>
            </button>

            {/* Settings Quick Status */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/60 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Mic className={`w-3.5 h-3.5 ${settings.voiceTracking ? 'text-blue-400' : 'text-gray-500'}`} />
                <span>{settings.voiceTracking ? '음성추적 ON' : '일반스크롤'}</span>
              </span>
              <span>•</span>
              <span>{settings.fontSize}px</span>
            </div>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/80 hover:bg-gray-700 hover:text-white rounded-lg border border-gray-700 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>환경설정</span>
            </button>

            {/* Start Prompter Button */}
            <button
              onClick={onStartPrompter}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>프롬프터 시작</span>
            </button>
          </div>
        </header>

        {/* Script Content Editor */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* 토크형 촬영 출연자별 폰트 색상 지정 툴바 */}
          <div className="mb-3 p-3 bg-[#14151c] border border-gray-800 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mr-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <span>폰트 색상 (줄에 커서 또는 단어 드래그 후 클릭):</span>
              </div>

              {FONT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.tag}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // 드래그 선택 영역이 풀리지 않도록 보호
                  onClick={() => handleApplyColor(preset.tag)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900/90 hover:bg-gray-800 border ${preset.borderClass} text-xs font-medium ${preset.textClass} transition-all active:scale-95 shadow-sm`}
                  title={`선택한 줄 또는 단어에 '${preset.label}' 색상을 적용합니다`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span>{preset.label}</span>
                </button>
              ))}

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleApplyColor(null)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-gray-700 text-xs text-gray-300 hover:text-white transition-all"
                title="선택한 줄의 색상을 기본색(흰색)으로 되돌립니다"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>기본색(해제)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowColorPreview((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                showColorPreview
                  ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                  : 'bg-gray-800/70 border-gray-700 text-gray-400 hover:text-white'
              }`}
              title="우측 컬러 미리보기 창을 켜거나 끕니다"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showColorPreview ? '미리보기 켜짐' : '미리보기 열기'}</span>
            </button>
          </div>

          {/* 에디터 영역 + 실시간 프롬프터 컬러 미리보기 (단어별/줄별 모든 색상 100% 반영) */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="text-xs font-semibold text-gray-400 mb-1.5 px-1 flex items-center justify-between">
                <span>✏️ 대본 입력 및 편집</span>
                <span className="text-[11px] text-gray-500">원하는 줄이나 단어를 드래그하고 위 색상 버튼을 눌러보세요</span>
              </div>
              <textarea
                ref={textareaRef}
                value={activeScript?.content || ''}
                onChange={(e) => onUpdateScript(activeScript.id, { content: e.target.value })}
                placeholder="# 1. 토크형 오프닝&#10;{노랑} [진행자] 안녕하세요, 반갑습니다! 오늘 스마트 프롬프터 토크쇼에 오신 여러분을 환영합니다.&#10;{하늘} [출연자A] 네, 안녕하세요! 초대해 주셔서 정말 감사합니다.&#10;{초록} [출연자B] 반갑습니다 여러분! 오늘 알찬 이야기를 들려드리겠습니다."
                className="flex-1 w-full p-5 bg-[#14141a] border border-gray-800 rounded-2xl text-gray-100 placeholder-gray-600 text-base leading-relaxed focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 resize-none font-sans"
              />
            </div>

            {showColorPreview && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="text-xs font-semibold text-amber-300 mb-1.5 px-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    <span>실시간 프롬프터 컬러 미리보기</span>
                  </span>
                  <span className="text-[11px] font-normal text-gray-400">실제 프롬프터와 동일하게 색상이 적용되어 표시됩니다</span>
                </div>
                <div className="flex-1 p-5 bg-black border border-gray-800 rounded-2xl overflow-y-auto space-y-2.5">
                  {parsedPreview.lines.map((line) => {
                    // 1) 챕터 구분 헤더
                    if (line.isChapterHeading && line.chapterTitle) {
                      return (
                        <div
                          key={`prev-chap-${line.lineIndex}`}
                          className="flex items-center gap-1.5 text-blue-400 font-bold text-sm border-b border-blue-500/30 pb-1 pt-3"
                        >
                          <Bookmark className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span>{line.chapterTitle}</span>
                        </div>
                      );
                    }

                    // 2) 빈 줄
                    if (line.tokens.length === 0) {
                      return <div key={`prev-empty-${line.lineIndex}`} className="h-2.5" />;
                    }

                    // 3) 문장 및 단어별 실제 컬러 렌더링 (줄 전체 색상 + 부분 단어 색상 + 화자 배지 모두 표시)
                    return (
                      <div
                        key={`prev-line-${line.lineIndex}`}
                        className="text-lg font-semibold leading-relaxed"
                      >
                        {line.speakerLabel && (
                          <span
                            className="inline-block mr-2 px-2 py-0.5 rounded-md border font-bold text-xs align-middle"
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
                            key={`prev-tok-${tok.index}`}
                            className="inline-block mr-1.5"
                            style={{ color: tok.color || '#ffffff' }}
                          >
                            {tok.word}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Editor Footer: Stats */}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-500" />
                <span>{charCount.toLocaleString()} 자</span>
                <span className="text-gray-600">|</span>
                <span>{wordCount.toLocaleString()} 단어</span>
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <Clock className="w-3.5 h-3.5" />
                <span>예상 발표 시간: 약 {estimatedMinutes}분</span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-gray-500">
              <span className="text-amber-300/90 font-medium">🎨 실시간 컬러 미리보기 적용</span>
              <span>•</span>
              <span className="text-blue-400/90 font-medium">첫 발화 시 스크롤 시작 & 속도 동조</span>
              <span>•</span>
              <span className="text-emerald-400/90 font-medium">← (왼쪽 화살표): 한 문장 위로</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
