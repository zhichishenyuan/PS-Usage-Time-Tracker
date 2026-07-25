import React, { useState } from 'react';

export interface NoteEditorProps {
  projectId: string;
  projectName: string;
  initialNote?: string;
  onSave: (projectId: string, note: string) => Promise<void> | void;
  onCancel: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = (props: NoteEditorProps) => {
  const {
    projectId,
    projectName,
    initialNote = '',
    onSave,
    onCancel,
  } = props;
  // 强行限制初始文本最多 100 字符
  const sanitizedInitial = (initialNote || '').slice(0, 100);
  const [noteText, setNoteText] = useState(sanitizedInitial);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTextChange = (e: any) => {
    const val = e.target ? e.target.value : String(e);
    // 100 字符强限制截断
    if (val.length > 100) {
      setNoteText(val.slice(0, 100));
    } else {
      setNoteText(val);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      // 清洗空格/空串
      const trimmed = noteText.trim();
      await onSave(projectId, trimmed);
      setIsSubmitting(false);
    } catch (err: any) {
      // 保持编辑界面，不关闭，保留用户输入内容
      setIsSubmitting(false);
      const msg = err?.message || '保存备注失败，请稍后重试';
      setErrorMessage(msg);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 16px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '0.9em',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div className="utt-note-editor" data-testid="note-editor" style={{ 
      padding: '20px', 
      background: 'linear-gradient(145deg, rgba(30, 30, 30, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%)', 
      borderRadius: '8px', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      width: '100%',
      maxWidth: '400px',
      color: '#eee',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
        <div style={{ fontSize: '18px', marginRight: '8px' }}>📝</div>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold' }}>编辑项目备注</h3>
          <div style={{ fontSize: '11px', color: '#aaa' }}>{projectName}</div>
        </div>
      </div>

      {/* 文本输入框 */}
      <textarea
        data-testid="note-textarea"
        maxLength={100}
        rows={4}
        value={noteText}
        disabled={isSubmitting}
        onChange={handleTextChange}
        placeholder="请输入项目备注（最多 100 字）"
        style={{ 
          width: '100%', 
          boxSizing: 'border-box', 
          padding: '10px', 
          borderRadius: '6px', 
          border: '1px solid rgba(255, 255, 255, 0.2)', 
          background: 'rgba(0, 0, 0, 0.3)',
          color: '#fff',
          fontSize: '11px',
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'normal',
          outline: 'none',
          resize: 'none'
        }}
      />

      {/* 实时字数统计 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        <span data-testid="char-count" style={{ fontSize: '11px', color: noteText.length >= 100 ? '#ff8a80' : '#888' }}>
          {noteText.length} / 100
        </span>
      </div>

      {/* 报错保持提示 */}
      {errorMessage && (
        <div data-testid="error-message" style={{ color: '#ff8a80', fontSize: '11px', marginTop: '8px', background: 'rgba(244, 67, 54, 0.1)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {/* 按钮组 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <div
          data-testid="cancel-btn"
          onClick={isSubmitting ? undefined : onCancel}
          style={{ ...btnStyle, opacity: isSubmitting ? 0.5 : 1 }}
        >
          取消
        </div>
        <div
          data-testid="save-btn"
          onClick={isSubmitting ? undefined : handleSave}
          style={{ 
            ...btnStyle, 
            background: 'rgba(76, 175, 80, 0.2)', 
            color: '#81C784', 
            border: '1px solid rgba(76, 175, 80, 0.4)', 
            fontWeight: 'bold',
            opacity: isSubmitting ? 0.5 : 1
          }}
        >
          {isSubmitting ? '保存中...' : '保存备注'}
        </div>
      </div>
    </div>
  );
};
