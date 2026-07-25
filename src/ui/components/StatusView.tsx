import React from 'react';
import { ProjectViewModel, SummaryViewModel } from '../../app/readmodel/types';
import { SessionState } from '../../domain/types';

export interface StatusViewProps {
  activeProject: ProjectViewModel | null;
  summary: SummaryViewModel;
  sessionState: SessionState | 'NO_DOCUMENT' | 'UNTRACKED';
  onNavigate: (view: 'status' | 'history' | 'settings' | 'note', extra?: any) => void;
}

export const StatusView: React.FC<StatusViewProps> = (props: StatusViewProps) => {
  const { activeProject, summary, sessionState, onNavigate } = props;

  let statusColor = '#fff';
  let statusText = '未统计';

  if (activeProject) {
    if (sessionState === 'WORKING') {
      statusColor = '#4CAF50';
      statusText = '工作中';
    } else if (sessionState === 'IDLE') {
      statusColor = '#FFC107';
      statusText = '空闲';
    } else if (sessionState === 'FROZEN') {
      statusColor = '#fff';
      statusText = '冻结';
    }
  } else {
    statusText = '未打开文件';
  }

  const primaryFile = activeProject && activeProject.associatedFiles.length > 0
    ? activeProject.associatedFiles[0].displayName
    : '无关联文件';

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    padding: '8px',
    marginBottom: '6px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  };

  const btnStyle: React.CSSProperties = {
    flex: 1,
    padding: '4px',
    background: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    color: 'var(--uxp-host-text-color, #fff)',
    textAlign: 'center',
    fontSize: '0.9em',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  };

  return (
    <div style={{ padding: '4px', fontFamily: 'system-ui, sans-serif', color: 'var(--uxp-host-text-color, #fff)', fontSize: '11px' }}>
      
      {/* 当前前台项目卡片 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '0.9em', color: '#fff', fontWeight: 'bold' }}>
            ⏱️ 当前活跃项目
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255,0.2)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.85em' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColor, marginRight: '4px', boxShadow: `0 0 4px ${statusColor}` }}></div>
            <span style={{ fontWeight: '500' }}>{statusText}</span>
          </div>
        </div>
        {activeProject ? (
          <div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeProject.name}
            </div>
            <div style={{ fontSize: '0.85em', color: '#999', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📄 {primaryFile}
            </div>
            
            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', marginRight: '6px' }}>
                <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '2px' }}>总在线</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#aaa', fontFamily: 'monospace' }}>
                  {activeProject.displayOnlineTime}
                </div>
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', marginRight: '6px' }}>
                <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '2px' }}>总步数</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#bbb', fontFamily: 'monospace' }}>
                  🖱️ {activeProject.totalActionSteps} 步
                </div>
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '2px' }}>有效工作</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#4CAF50', fontFamily: 'monospace' }}>
                  {activeProject.displayEffectiveTime}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '10px 0', textAlign: 'center', color: '#fff', fontSize: '0.9em' }}>
            未打开文件
          </div>
        )}
      </div>

      {/* 工时汇总区域 */}
      {summary.isSummaryVisible && (
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(33, 150, 243, 0.05) 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#4CAF50' }}>
              📊 {summary.summaryMode === 'today' ? '今日汇总' : '本周汇总'}
            </span>
            <span style={{ fontSize: '0.8em', color: '#fff' }}>
              {summary.summaryMode === 'today' ? summary.todayDateLabel : summary.weekStartDateLabel}
            </span>
          </div>

          {summary.summaryMode === 'today' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
              <div style={{ color: '#fff' }}>在线: {summary.displayTodayOnlineTime}</div>
              <div>有效: <strong style={{ color: 'var(--uxp-host-text-color, #eee)' }}>{summary.displayTodayEffectiveTime}</strong></div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
              <div style={{ color: '#fff' }}>在线: {summary.displayWeekOnlineTime}</div>
              <div>有效: <strong style={{ color: 'var(--uxp-host-text-color, #eee)' }}>{summary.displayWeekEffectiveTime}</strong></div>
            </div>
          )}
        </div>
      )}

      {/* 导航按钮组 */}
      <div style={{ display: 'flex', marginTop: '12px' }}>
        <div 
          onClick={() => activeProject && onNavigate('note', { projectId: activeProject.id })}
          style={{ ...btnStyle, opacity: activeProject ? 1 : 0.4, pointerEvents: activeProject ? 'auto' : 'none', marginRight: '8px' }}
        >
          <span>📝 备注</span>
        </div>
        <div 
          onClick={() => onNavigate('history')}
          style={{ ...btnStyle, marginRight: '8px' }}
        >
          <span>📋 记录</span>
        </div>
        <div 
          onClick={() => onNavigate('settings')}
          style={btnStyle}
        >
          <span>⚙️ 设置</span>
        </div>
      </div>
    </div>
  );
};
