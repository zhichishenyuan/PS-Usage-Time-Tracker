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
    <div style={{ fontWeight: 'bold', color: '#4CAF50', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1em', marginBottom: '4px' }}>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>⚡ {liveCard.displayName}</span>
      <span style={{ fontSize: '0.9em', backgroundColor: 'rgba(76, 175, 80, 0.15)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>进行中...</span>
    </div>
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px', marginRight: '4px' }}>
        <div style={{ fontSize: '0.8em', color: '#aaa' }}>在线</div>
        <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#ccc' }}>{liveCard.displayOnlineTime}</div>
      </div>
      <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px', marginRight: '4px' }}>
        <div style={{ fontSize: '0.8em', color: '#aaa' }}>有效</div>
        <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#81c784' }}>{liveCard.displayEffectiveTime}</div>
      </div>
      <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px' }}>
        <div style={{ fontSize: '0.8em', color: '#aaa' }}>步数</div>
        <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#ccc' }}>{liveCard.actionSteps}</div>
      </div>
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
          <div style={{ fontSize: '1em', fontWeight: 'bold', color: isSelected ? '#64b5f6' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
            {isProtected && <span style={{ fontSize: '0.7em', backgroundColor: '#ffb300', color: '#000', padding: '2px 4px', borderRadius: '4px', marginRight: '6px', flexShrink: 0 }}>活跃</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
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
              <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#bbb' }}>{p.associatedFileCount}</div>
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
    const [projectPage, setProjectPage] = useState<number>(1);

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
    padding: '2px 8px', // 明确将上下内边距压缩为 2px
    backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
    fontWeight: isActive ? 'bold' : 'normal',
    border: isActive ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
    color: isActive ? '#fff' : '#aaa',
  });

  return (
    <div style={{ padding: 0, fontFamily: 'sans-serif', color: '#eee', fontSize: '11px', height: '100vh', overflowY: 'auto' }}>
      
      {/* 固定头部区 (吸顶) */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: 'var(--uxp-host-background-color, #323232)',
        width: '100%', display: 'block', boxSizing: 'border-box',
        padding: '8px 24px 12px 8px' // 右侧 24px 避开物理滚动条
      }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', height: '24px' }}>
        <div onClick={onBackToStatus} style={{ ...btnStyle, backgroundColor: 'rgba(255, 255, 255, 0.05)', userSelect: 'none' }}>
           &lt; 返回
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 'bold' }}>📋 记录</div>
        </div>
      </div>

      {/* 切换栏 */}
      <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '2px', boxSizing: 'border-box' }}>
        <div style={{ ...tabStyle(activeTab === 'timeline'), flex: 1, textAlign: 'center', userSelect: 'none' }} onClick={() => onTabChange('timeline')}>时间轴</div>
        <div style={{ ...tabStyle(activeTab === 'projects'), flex: 1, textAlign: 'center', userSelect: 'none' }} onClick={() => onTabChange('projects')}>项目库</div>
      </div>
      </div>

      {/* 物理占位符，弥补 UXP sticky 丢失的文档流高度 (按用户要求改为 80px) */}
      <div style={{ height: '80px', flexShrink: 0 }}></div>

      {/* Tab 1: 时间轴工作记录 */}
      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px 8px 8px' }}>
          {activeLiveCard && <LiveSessionCard liveCard={activeLiveCard} />}
          
          {sortedItems.map((item, index) => {
            const pageNum = Math.floor(index / 10) + 1;
            const showDivider = index > 0 && index % 10 === 0;
            return (
              <React.Fragment key={item.id}>
                {showDivider && (
                  <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 8px 0', opacity: 0.8 }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
                    <div style={{ padding: '0 12px', fontSize: '0.85em', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>第 {pageNum} 页</div>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
                  </div>
                )}
                <div style={{ backgroundColor: 'rgba(255, 255, 255,0.05)', border: '1px solid rgba(255, 255, 255,0.1)', borderRadius: '4px', padding: '8px', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.85em', color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', marginBottom: '4px' }}>
                <span style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#eee', padding: '2px 4px', borderRadius: '2px', flexShrink: 0, marginRight: '8px' }}>{item.dateLabel} {item.timeRangeLabel}</span>
                <span style={{ color: '#21c7fa', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{item.projectName}</span>
              </div>
              <div style={{ fontSize: '1em', fontWeight: 'bold', marginBottom: '6px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#ccc' }}>{item.actionSteps}</div>
                </div>
              </div>
            </div>
              </React.Fragment>
            );
          })}

          {timelineSessions.hasMore && (
            <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '16px' }}>
              <div onClick={onLoadMore} style={{ ...btnStyle, display: 'inline-block', width: '90%' }}>
                加载更多 (第 {timelineSessions.page} 页 / 共 {Math.ceil(timelineSessions.total / timelineSessions.pageSize)} 页)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 项目列表 */}
      {activeTab === 'projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px 8px 8px' }}>
          {selectedProjectIds.length >= 2 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div onClick={handleMergeSelected} style={{ ...btnStyle, flex: 1, backgroundColor: '#1976d2', color: '#fff', textAlign: 'center', fontWeight: 'bold', border: 'none' }}>
                合并选中 ({selectedProjectIds.length})
              </div>
            </div>
          )}

          {projects.slice(0, projectPage * 10).map((p, index) => {
            const pageNum = Math.floor(index / 10) + 1;
            const showDivider = index > 0 && index % 10 === 0;
            return (
              <React.Fragment key={p.id}>
                {showDivider && (
                  <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 8px 0', opacity: 0.8 }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
                    <div style={{ padding: '0 12px', fontSize: '0.85em', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>第 {pageNum} 页</div>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
                  </div>
                )}
                <ProjectCard 
                  project={p}
                  isSelected={selectedProjectIds.includes(p.id)}
                  onToggleSelect={handleToggleSelectProject}
                  onEditNote={onEditNote}
                  onDeleteProject={onDeleteProject}
                  onNavigate={onNavigate}
                  onUndoMerge={onUndoMerge}
                />
              </React.Fragment>
            );
          })}

          {projectPage * 10 < projects.length && (
            <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '16px' }}>
              <div onClick={() => setProjectPage(prev => prev + 1)} style={{ ...btnStyle, display: 'inline-block', width: '90%' }}>
                加载更多 (第 {projectPage} 页 / 共 {Math.ceil(projects.length / 10)} 页)
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
