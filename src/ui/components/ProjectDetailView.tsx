import React from 'react';
import { ProjectViewModel } from '../../app/readmodel/types';

export interface ProjectDetailViewProps {
  project: ProjectViewModel;
  onBack: () => void;
  onEditNote: (projectId: string) => void;
  onUndoMerge?: (projectId: string) => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({ project, onBack, onEditNote, onUndoMerge }) => {
  const btnStyle: React.CSSProperties = {
    padding: '4px 8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '4px',
    color: '#eee',
    fontSize: '0.9em',
    cursor: 'pointer',
    userSelect: 'none'
  };

  const cTextPrimary = `rgba(255, 255, 255, 1)`;
  const cTextSecondary = `rgba(255, 255, 255, 0.6)`;
  const cBoxBg = `rgba(255, 255, 255, 0.05)`;
  const cBoxBorder = `rgba(255, 255, 255, 0.1)`;

  return (
    <div style={{ padding: '8px', fontFamily: 'system-ui, sans-serif', color: cTextPrimary, fontSize: '11px', height: '100vh', overflowY: 'auto', boxSizing: 'border-box' }}>
      
      {/* 顶栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div onClick={onBack} style={btnStyle}>&lt; 返回</div>
        <div style={{ fontWeight: 'bold' }}>项目详情</div>
      </div>

      <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: project.originalName !== project.name ? '4px' : '8px' }}>
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>{project.name}</div>
          <div style={{ display: 'flex', flexShrink: 0 }}>
            <div onClick={() => onEditNote(project.id)} style={{ ...btnStyle, fontSize: '0.8em', padding: '2px 6px', marginRight: (project.hasUndoRecord && onUndoMerge) ? '8px' : '0' }}>📝</div>
            {project.hasUndoRecord && onUndoMerge && (
              <div onClick={() => onUndoMerge(project.id)} style={{ ...btnStyle, fontSize: '0.8em', padding: '2px 6px', backgroundColor: 'rgba(244, 67, 54, 0.3)', color: '#fff', border: '1px solid rgba(244, 67, 54, 0.4)' }}>
                ↩️ 撤销合并
              </div>
            )}
          </div>
        </div>
        {project.originalName !== project.name && (
          <div style={{ fontSize: '0.85em', color: '#21c7fa', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            原名：{project.originalName}
          </div>
        )}
        
        {project.note && (
          <div style={{ fontSize: '0.9em', color: '#ccc', backgroundColor: 'rgba(33, 150, 243, 0.15)', padding: '6px', borderRadius: '4px', borderLeft: '3px solid #64b5f6', marginBottom: '12px' }}>
            {project.note}
          </div>
        )}

        <div style={{ display: 'flex', marginBottom: '8px' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', marginRight: '8px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>📅 创建时间</div>
            <div style={{ fontSize: '0.95em', fontWeight: 'bold', color: '#ccc' }}>{new Date(project.createdAt).toLocaleString()}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>🕒 最近工作</div>
            <div style={{ fontSize: '0.95em', fontWeight: 'bold', color: '#ccc' }}>{new Date(project.lastWorkedAt).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ display: 'flex', marginBottom: '8px' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', marginRight: '8px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>🖼️ 总在线时长</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#ccc' }}>{project.displayOnlineTime}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>🖌️ 总有效时长</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#81c784' }}>{project.displayEffectiveTime}</div>
          </div>
        </div>

        <div style={{ display: 'flex', marginBottom: '8px' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', marginRight: '8px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>🖱️ 总步数</div>
            <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff' }}>{project.totalActionSteps}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>📄 关联文件</div>
            <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff' }}>{project.associatedFileCount}</div>
          </div>
        </div>
      </div>

      <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px' }}>
        <div style={{ fontSize: '1em', fontWeight: 'bold', marginBottom: '12px', color: '#ccc' }}>文件清单 ({project.associatedFiles.length} 个)</div>
        {project.associatedFiles.length === 0 ? (
          <div style={{ color: '#888', fontStyle: 'italic' }}>无关联文件</div>
        ) : (
          project.associatedFiles.map((file, index) => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', marginBottom: index === project.associatedFiles.length - 1 ? '0' : '8px', paddingBottom: index === project.associatedFiles.length - 1 ? '0' : '8px', borderBottom: index === project.associatedFiles.length - 1 ? 'none' : `1px solid rgba(255,255,255,0.15)` }}>
              <div style={{ marginRight: '8px', fontSize: '1.8em' }}>{file.isSaved ? '📄' : '📝'}</div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: '#fff', fontSize: '1.1em', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.displayName}</div>
                {(file.displayOnlineTime || file.displayEffectiveTime || file.actionSteps !== undefined) && (
                  <div style={{ display: 'flex', color: '#ccc', fontSize: '0.95em', marginTop: '6px', marginBottom: '2px' }}>
                    <div>🖼️ {file.displayOnlineTime || '00:00:00'}</div>
                    <div style={{ color: '#81c784', fontWeight: 'bold' }}>🖌️ {file.displayEffectiveTime || '00:00:00'}</div>
                    <div>🖱️ {file.actionSteps || 0}</div>
                  </div>
                )}
                <div style={{ color: '#bbb', fontSize: '0.85em', marginTop: '4px' }}>最近打开: {new Date(file.lastSeenAt).toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
