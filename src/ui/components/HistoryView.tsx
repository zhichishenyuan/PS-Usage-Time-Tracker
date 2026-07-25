import React, { useState } from 'react';
import { HistorySessionViewModel, LiveSessionCardViewModel, PaginatedResult, ProjectViewModel } from '../../app/readmodel/types';

export interface HistoryViewProps {
  timelineSessions: PaginatedResult<HistorySessionViewModel>;
  projects: ProjectViewModel[];
  activeLiveCard: LiveSessionCardViewModel | null;
  activeTab: 'timeline' | 'projects';
  onTabChange: (tab: 'timeline' | 'projects') => void;
  onLoadMore: () => void;
  onBackToStatus: () => void;
  onMergeProjects?: (primaryProjectId: string, mergedProjectIds: string[]) => Promise<void> | void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onEditNote?: (projectId: string) => void;
  onNavigate?: (view: 'detail', extra: { projectId: string }) => void;
  onUndoMerge?: (projectId: string) => Promise<void> | void;
}

export const LiveSessionCard: React.FC<{ liveCard: LiveSessionCardViewModel }> = ({ liveCard }) => (
  <div style={{
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    border: '1px solid rgba(76, 175, 80, 0.4)',
    borderRadius: '4px',
    padding: '8px',
    marginBottom: '8px'
  }}>
    <div style={{ fontWeight: 'bold', color: '#4CAF50', display: 'flex', justifyContent: 'space-between', fontSize: '1em', marginBottom: '4px' }}>
      <span>⚡ {liveCard.displayName}</span>
      <span style={{ fontSize: '0.9em', backgroundColor: 'rgba(76, 175, 80, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>进行中...</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ color: '#bbb' }}>在线: {liveCard.displayOnlineTime}</div>
        <div style={{ color: '#bbb' }}>🖱️ {liveCard.actionSteps} 步</div>
      </div>
      <div>有效: <strong style={{ color: '#fff' }}>{liveCard.displayEffectiveTime}</strong></div>
    </div>
  </div>
);

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '4px',
  color: '#eee',
  fontSize: '0.9em',
  cursor: 'pointer',
};

const ProjectCard: React.FC<{
  project: ProjectViewModel;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditNote?: (id: string) => void;
  onDeleteProject?: (id: string) => Promise<void> | void;
  onNavigate?: (view: 'detail', extra: { projectId: string }) => void;
  onUndoMerge?: (id: string) => Promise<void> | void;
}> = ({ project: p, isSelected, onToggleSelect, onEditNote, onDeleteProject, onNavigate, onUndoMerge }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isProtected = p.isCurrentlyActive;

  return (
      <div style={{ 
        backgroundColor: isProtected ? 'rgba(255, 193, 7, 0.1)' : (isSelected ? 'rgba(33, 150, 243, 0.15)' : 'rgba(255, 255, 255, 0.04)'), 
        border: isProtected ? '1px solid rgba(255, 193, 7, 0.4)' : (isSelected ? '1px solid rgba(33, 150, 243, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)'), 
        borderRadius: '4px', padding: '8px', marginBottom: '6px'
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onNavigate && onNavigate('detail', { projectId: p.id })}>
          {!isProtected && (
            <input 
              type="checkbox" 
              checked={isSelected} 
              readOnly 
              style={{ margin: 0, marginRight: '6px', flexShrink: 0, cursor: 'pointer' }} 
              onClick={(e) => { e.stopPropagation(); onToggleSelect(p.id); }}
            />
          )}
          <div style={{ fontSize: '1em', fontWeight: 'bold', color: isSelected ? '#64b5f6' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: isProtected ? '6px' : '0' }}>
            {p.name} {isProtected && <span style={{ fontSize: '0.7em', backgroundColor: '#ffb300', color: '#000', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px' }}>活跃</span>}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexShrink: 0, marginLeft: '8px' }}>
          {!confirmDelete ? (
            <>
              {onEditNote && (
                <div onClick={() => onEditNote(p.id)} style={{ ...btnStyle, padding: '2px 6px', fontSize: '0.8em', backgroundColor: 'rgba(255,255,255,0.1)', marginRight: '4px', textAlign: 'center' }}>📝</div>
              )}
              {!isProtected && (
                <div 
                  onClick={() => {
                    if (onDeleteProject) setConfirmDelete(true);
                  }} 
                  style={{ ...btnStyle, width: '40px', textAlign: 'center', boxSizing: 'border-box', padding: '2px 0', fontSize: '0.8em', backgroundColor: 'rgba(244, 67, 54, 0.3)', color: '#fff', border: '1px solid rgba(244, 67, 54, 0.4)' }}
                >
                  删除
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div 
                onClick={async () => {
                  if (onDeleteProject) {
                    try {
                      await onDeleteProject(p.id);
                    } catch (e) {}
                  }
                  setConfirmDelete(false);
                }}
                style={{ ...btnStyle, width: '56px', textAlign: 'center', boxSizing: 'border-box', padding: '2px 0', fontSize: '0.8em', backgroundColor: 'rgba(244, 67, 54, 0.6)', color: '#fff', border: '1px solid rgba(244, 67, 54, 0.8)', marginRight: '6px' }}
              >
                确认删除
              </div>
              <div 
                onClick={() => setConfirmDelete(false)}
                style={{ ...btnStyle, width: '40px', textAlign: 'center', boxSizing: 'border-box', padding: '2px 0', fontSize: '0.8em', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
              >
                取消
              </div>
            </div>
          )}
        </div>
      </div>

          <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8em', color: '#aaa' }}>在线</div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#ccc' }}>{p.displayOnlineTime}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8em', color: '#aaa' }}>有效</div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#81c784' }}>{p.displayEffectiveTime}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8em', color: '#aaa' }}>步数</div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#bbb' }}>{p.totalActionSteps}</div>
            </div>
            <div style={{ flex: '0.5' }}>
              <div style={{ fontSize: '0.8em', color: '#aaa' }}>文件</div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#fff' }}>{p.associatedFileCount}</div>
            </div>
          </div>

      {p.note && (
        <div style={{ 
          fontSize: '0.9em', 
          color: '#e3f2fd', 
          backgroundColor: 'rgba(33, 150, 243, 0.12)', 
          padding: '6px 8px', 
          borderRadius: '4px', 
          marginTop: '8px', 
          borderLeft: '3px solid #64b5f6',
          lineHeight: '1.4',
          wordBreak: 'break-word'
        }}>
          {p.note}
        </div>
      )}
      </div>
  );
};

export const HistoryView: React.FC<HistoryViewProps> = (props) => {
  const { timelineSessions, projects, activeLiveCard, activeTab, onTabChange, onLoadMore, onBackToStatus, onMergeProjects, onDeleteProject, onEditNote, onNavigate, onUndoMerge } = props;
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const sortedItems = [...(timelineSessions.items || [])].sort((a, b) => {
    const tA = new Date(a.startAt).getTime();
    const tB = new Date(b.startAt).getTime();
    if (tA !== tB) return tB - tA;
    return b.id.localeCompare(a.id);
  });

  const handleToggleSelectProject = (id: string) => {
    if (selectedProjectIds.includes(id)) {
      setSelectedProjectIds(selectedProjectIds.filter(item => item !== id));
    } else {
      setSelectedProjectIds([...selectedProjectIds, id]);
    }
  };

  const handleMergeSelected = () => {
    if (selectedProjectIds.length < 2 || !onMergeProjects) return;
    const [primary, ...others] = selectedProjectIds;
    onMergeProjects(primary, others);
    setSelectedProjectIds([]);
  };



  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    ...btnStyle,
    backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
    fontWeight: isActive ? 'bold' : 'normal',
    border: isActive ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
    color: isActive ? '#fff' : '#aaa',
  });

  return (
    <div style={{ padding: '8px', fontFamily: 'sans-serif', color: '#eee', fontSize: '11px', height: '100vh', overflowY: 'auto' }}>
      
      {/* 顶栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div onClick={onBackToStatus} style={{ ...btnStyle, backgroundColor: 'rgba(255, 255, 255, 0.05)', userSelect: 'none' }}>
           &lt; 返回
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 'bold' }}>📋 记录</div>
        </div>
      </div>

      {/* 切换栏 */}
      <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '2px', marginBottom: '12px' }}>
        <div style={{ ...tabStyle(activeTab === 'timeline'), flex: 1, textAlign: 'center', userSelect: 'none' }} onClick={() => onTabChange('timeline')}>时间轴</div>
        <div style={{ ...tabStyle(activeTab === 'projects'), flex: 1, textAlign: 'center', userSelect: 'none' }} onClick={() => onTabChange('projects')}>项目库</div>
      </div>

      {/* Tab 1: 时间轴工作记录 */}
      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {activeLiveCard && <LiveSessionCard liveCard={activeLiveCard} />}
          
          {sortedItems.map(item => (
            <div key={item.id} style={{ backgroundColor: 'rgba(255, 255, 255,0.05)', border: '1px solid rgba(255, 255, 255,0.1)', borderRadius: '4px', padding: '8px', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.85em', color: '#aaa', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#eee', padding: '2px 4px', borderRadius: '2px' }}>{item.dateLabel} {item.timeRangeLabel}</span>
                <span style={{ color: '#64b5f6', fontWeight: 'bold' }}>{item.projectName}</span>
              </div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', marginBottom: '6px', color: '#fff' }}>
                📄 {item.displayName}
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px', marginRight: '4px' }}>
                  <div style={{ fontSize: '0.8em', color: '#aaa' }}>在线</div>
                  <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#ccc' }}>{item.displayOnlineTime}</div>
                </div>
                <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px', marginRight: '4px' }}>
                  <div style={{ fontSize: '0.8em', color: '#aaa' }}>有效</div>
                  <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#81c784' }}>{item.displayEffectiveTime}</div>
                </div>
                <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px' }}>
                  <div style={{ fontSize: '0.8em', color: '#aaa' }}>步数</div>
                  <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#bbb' }}>{item.actionSteps}</div>
                </div>
              </div>
            </div>
          ))}

          {timelineSessions.hasMore && (
            <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '16px' }}>
              <div onClick={onLoadMore} style={{ ...btnStyle, display: 'inline-block', width: '90%' }}>
                加载更多记录 ({sortedItems.length}/{timelineSessions.total})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 项目列表 */}
      {activeTab === 'projects' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {selectedProjectIds.length >= 2 && (
              <div onClick={handleMergeSelected} style={{ ...btnStyle, flex: 1, backgroundColor: '#1976d2', color: '#fff', textAlign: 'center', fontWeight: 'bold', border: 'none' }}>
                合并选中 ({selectedProjectIds.length})
              </div>
            )}
          </div>

          {projects.map((p) => (
            <ProjectCard 
              key={p.id}
              project={p}
              isSelected={selectedProjectIds.includes(p.id)}
              onToggleSelect={handleToggleSelectProject}
              onEditNote={onEditNote}
              onDeleteProject={onDeleteProject}
              onNavigate={onNavigate}
              onUndoMerge={onUndoMerge}
            />
          ))}
        </div>
      )}
    </div>
  );
};
