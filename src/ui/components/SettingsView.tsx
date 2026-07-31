import React, { useState } from 'react';
import { Settings } from '../../domain/types';

export interface SettingsViewProps {
  settings: Settings;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onBackToStatus: () => void;
  onExportTxt: (type: 'work' | 'project') => Promise<void> | void;
  onResetDefaults?: () => void;
}

const SafeInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <input 
        {...props} 
        autoFocus
        onBlur={(e) => {
          setIsEditing(false);
          if (props.onBlur) props.onBlur(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            if (props.onBlur) props.onBlur(e as any);
          }
          if (props.onKeyDown) props.onKeyDown(e);
        }}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      style={{ 
        ...(props.style as any), 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center', // 确保纯文本状态下居中
        cursor: 'text',
        backgroundColor: 'rgba(255, 255, 255, 0.05)', // 模拟输入框背景
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden'
      }}
      title="点击修改"
    >
      {props.value}
    </div>
  );
};

const IncButton = ({ label, onClick, isLeft = false, btnStyle }: { label: string, onClick: () => void, isLeft?: boolean, btnStyle: React.CSSProperties }) => {
  const [flash, setFlash] = useState(false);
  const handleClick = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 100);
    onClick();
  };
  return (
    <div 
      onClick={handleClick}
      style={{
        ...btnStyle, 
        width: '22px', 
        height: '22px', 
        padding: 0, 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginRight: isLeft ? '2px' : '0',
        fontSize: '1.2em', 
        fontWeight: 'bold',
        background: flash ? 'rgba(33, 150, 243, 0.6)' : btnStyle.background,
        
      }}
    >
      {label}
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onBackToStatus,
  onExportTxt,
  onResetDefaults,
}) => {
  const [idleStr, setIdleStr] = useState(String(Math.round(settings.idleThresholdMs / 1000)));
  const [freezeStr, setFreezeStr] = useState(String(Math.round(settings.freezeThresholdMs / 60000)));
  const [showSummary, setShowSummary] = useState(settings.showSummary);
  const [summaryMode, setSummaryMode] = useState<'today' | 'week'>(settings.summaryMode);
  const [projectNameDisplayMode, setProjectNameDisplayMode] = useState<'name' | 'note-first'>(settings.projectNameDisplayMode || 'name');
  const [retentionMode, setRetentionMode] = useState<string>(settings.retentionMode || 'forever');
  const [customDaysStr, setCustomDaysStr] = useState<string>(
    settings.retentionMode && settings.retentionMode !== 'forever' 
      ? settings.retentionMode.replace('d', '') 
      : '30'
  );
  
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [exportErrorMsg, setExportErrorMsg] = useState('');
  const [resetState, setResetState] = useState<0 | 1 | 2>(0);
  const [showExportOptions, setShowExportOptions] = useState(false);

  const cTextPrimary = `rgba(255, 255, 255, 1)`;
  const cTextSecondary = `rgba(255, 255, 255, 0.6)`;
  const cBoxBg = `rgba(255, 255, 255, 0.05)`;
  const cBoxBorder = `rgba(255, 255, 255, 0.1)`;
  
  // 高对比度主题色 (摒弃纯色文字，改用带透明度的底色 + 纯白文字)
  const cGreenBg = `rgba(76, 175, 80, 0.4)`;
  const cGreenBorder = `rgba(76, 175, 80, 0.7)`;
  const cBlueBg = `rgba(33, 150, 243, 0.4)`;
  const cBlueBorder = `rgba(33, 150, 243, 0.7)`;
  const cBorder = 'rgba(255, 255, 255, 0.08)';
  
  // 激活状态下统一使用纯白高亮文字，加粗
  const cActiveText = '#ffffff';

  const isCustomRetention = retentionMode !== 'forever';

  const handleCustomDaysChange = (valStr: string) => {
    setCustomDaysStr(valStr);
  };
  
  const handleCustomDaysBlur = () => {
    let d = parseInt(customDaysStr);
    if (isNaN(d)) d = 30;
    d = Math.max(7, Math.min(365, d));
    setCustomDaysStr(String(d));
    const newVal = `${d}d`;
    setRetentionMode(newVal);
    fireSave({ retentionMode: newVal });
  };

  const handleSaveThresholds = async (idleS: string, freezeS: string, triggerType?: 'idle' | 'freeze') => {
    let idleVal = parseInt(idleS, 10);
    if (isNaN(idleVal)) idleVal = 60;
    idleVal = Math.min(900, Math.max(1, idleVal));

    let freezeVal = parseInt(freezeS, 10);
    if (isNaN(freezeVal)) freezeVal = 1;
    freezeVal = Math.min(60, Math.max(1, freezeVal));

    // 联动逻辑：确保挂机超时(分) 必须 >= 空闲超时(分)向上取整
    const minFreeze = Math.ceil(idleVal / 60);
    if (freezeVal < minFreeze) {
      if (triggerType === 'freeze') {
        // 用户调小挂机时间，迫使空闲时间自动下压
        idleVal = freezeVal * 60;
      } else {
        // 用户调大空闲时间，迫使挂机时间自动上顶
        freezeVal = minFreeze;
        freezeVal = Math.min(60, freezeVal); 
        // 兜底：如果挂机顶到了 60 分钟上限，反向压空闲
        if (freezeVal < Math.ceil(idleVal / 60)) {
           idleVal = freezeVal * 60;
        }
      }
    }

    setIdleStr(String(idleVal));
    setFreezeStr(String(freezeVal));
    
    const idleMs = idleVal * 1000;
    const freezeMs = freezeVal * 60000;

    await onSaveSettings({
      ...settings,
      idleThresholdMs: idleMs,
      freezeThresholdMs: freezeMs,
      showSummary,
      summaryMode,
      retentionMode,
      projectNameDisplayMode,
    });
    
    setMessage('已生效');
    setTimeout(() => setMessage(''), 2000);
  };

  const fireSave = async (overrides: Partial<Settings>) => {
    if (overrides.showSummary !== undefined) setShowSummary(overrides.showSummary);
    if (overrides.summaryMode !== undefined) setSummaryMode(overrides.summaryMode);
    if (overrides.retentionMode !== undefined) setRetentionMode(overrides.retentionMode);
    if (overrides.projectNameDisplayMode !== undefined) setProjectNameDisplayMode(overrides.projectNameDisplayMode);
    
    let idleVal = parseInt(idleStr, 10) || 60;
    let freezeVal = parseInt(freezeStr, 10) || 1;
    const idleMs = idleVal * 1000;
    const freezeMs = freezeVal * 60000;

    await onSaveSettings({
      ...settings,
      idleThresholdMs: idleMs,
      freezeThresholdMs: freezeMs,
      showSummary,
      summaryMode,
      retentionMode,
      projectNameDisplayMode,
      ...overrides
    });

    setMessage('已生效');
    setTimeout(() => setMessage(''), 2000);
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 8px',
    background: cBoxBg,
    border: `1px solid ${cBoxBorder}`,
    borderRadius: '4px',
    color: cTextPrimary,
    fontSize: '0.9em',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const numberControl = (valStr: string, setValStr: (v: string) => void, min: number, max: number, type: 'idle'|'freeze') => {
    const handleInc = (delta: number) => {
      let v = parseInt(valStr, 10);
      if (isNaN(v)) v = min;
      v = Math.min(max, Math.max(min, v + delta));
      const s = String(v);
      setValStr(s);
      if (type === 'idle') handleSaveThresholds(s, freezeStr, 'idle');
      else handleSaveThresholds(idleStr, s, 'freeze');
    };
    const handleBlur = () => {
      if (type === 'idle') handleSaveThresholds(valStr, freezeStr, 'idle');
      else handleSaveThresholds(idleStr, valStr, 'freeze');
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <IncButton label="-" onClick={() => handleInc(type === 'idle' ? -15 : -1)} isLeft={true} btnStyle={btnStyle} />
        <SafeInput 
          type="text"
          value={valStr} 
          onChange={(e) => setValStr(e.target.value)}
          onBlur={handleBlur}
          style={{ width: '26px', height: '22px', boxSizing: 'border-box', padding: '0', margin: 0, marginLeft: 0, marginRight: '2px', fontWeight: 'bold', color: cTextPrimary, borderRadius: '4px', outline: 'none', textAlign: 'center' }}
        />
        <IncButton label="+" onClick={() => handleInc(type === 'idle' ? 15 : 1)} btnStyle={btnStyle} />
      </div>
    );
  };

  const toggleControl = (checked: boolean, onChange: (v: boolean) => void) => (
    <div onClick={() => onChange(!checked)} style={{ ...btnStyle, padding: '4px 10px', background: checked ? cGreenBg : cBoxBg, border: checked ? `1px solid ${cGreenBorder}` : `1px solid ${cBoxBorder}`, color: checked ? cActiveText : cTextPrimary, fontWeight: checked ? 'bold' : 'normal' }}>
      {checked ? '✓ 开启' : '✗ 关闭'}
    </div>
  );

  const renderTabBtn = (label: string, isActive: boolean, onClick: () => void, addMargin: boolean = false) => (
    <div onClick={onClick} style={{ 
      ...btnStyle, 
      background: isActive ? cBlueBg : cBoxBg, 
      color: isActive ? cActiveText : cTextPrimary, 
      border: isActive ? `1px solid ${cBlueBorder}` : `1px solid ${cBoxBorder}`, 
      fontWeight: isActive ? 'bold' : 'normal', 
      marginRight: addMargin ? '6px' : '0' 
    }}>
      {label}
    </div>
  );

  return (
    <div style={{ padding: 0, fontFamily: 'system-ui, sans-serif', color: cTextPrimary, fontSize: '11px', height: '100vh', overflowY: 'auto', boxSizing: 'border-box' }}>
      
      {/* 吸顶保护层（包裹器） */}
      <div style={{ 
        position: 'sticky', top: 0, zIndex: 999, 
        backgroundColor: 'var(--uxp-host-background-color, #323232)',
        width: '100%', display: 'block', boxSizing: 'border-box',
        padding: '8px 24px 12px 8px' // 右侧 24px 避开物理滚动条
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px' }}>
          <div onClick={onBackToStatus} style={btnStyle}>&lt; 返回</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {message && <span style={{ color: '#4CAF50', fontSize: '12px', fontWeight: 'bold', marginRight: '8px' }}>{message}</span>}
            <div style={{ fontWeight: 'bold' }}>⚙️ 设置</div>
          </div>
        </div>
      </div>
      
      {/* 物理占位符，弥补 UXP sticky 丢失的文档流高度 (8 + 24 + 12 = 44px) */}
      <div style={{ height: '44px', flexShrink: 0 }}></div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px 8px 8px' }}>
        
        {/* 阈值卡片 */}
        <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px', marginBottom: '8px' }}>
          <div style={{ fontSize: '1em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '12px', fontWeight: 'bold' }}>统计阈值</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ color: cTextPrimary }}>空闲判定(s)</div>
              <div style={{ color: cTextSecondary, fontSize: '0.8em', marginTop: '2px' }}>1~900s, 停计有效</div>
            </div>
            {numberControl(idleStr, setIdleStr, 1, 900, 'idle')}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: cTextPrimary }}>冻结判定(min)</div>
              <div style={{ color: cTextSecondary, fontSize: '0.8em', marginTop: '2px' }}>1~60min, 冻结在线</div>
            </div>
            {numberControl(freezeStr, setFreezeStr, 1, 60, 'freeze')}
          </div>
        </div>

        {/* 显示卡片 */}
        <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px', marginBottom: '8px' }}>
          <div style={{ fontSize: '1em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '12px', fontWeight: 'bold' }}>界面显示</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSummary ? '12px' : '0' }}>
            <div style={{ color: cTextPrimary }}>工时汇总区域</div>
            {toggleControl(showSummary, (v) => fireSave({ showSummary: v }))}
          </div>

          {showSummary && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '12px', paddingLeft: '8px', borderLeft: `2px solid ${cBoxBorder}` }}>
              <div style={{ color: cTextSecondary, fontSize: '0.9em' }}>汇总范围</div>
              <div style={{ display: 'flex' }}>
                {renderTabBtn('今日', summaryMode === 'today', () => fireSave({ summaryMode: 'today' }), true)}
                {renderTabBtn('本周', summaryMode === 'week', () => fireSave({ summaryMode: 'week' }), false)}
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <div style={{ color: cTextPrimary }}>项目显示名称</div>
            <div style={{ display: 'flex' }}>
              {renderTabBtn('原文件', projectNameDisplayMode === 'name', () => { setProjectNameDisplayMode('name'); fireSave({ projectNameDisplayMode: 'name' }); }, true)}
              {renderTabBtn('优先备注', projectNameDisplayMode === 'note-first', () => { setProjectNameDisplayMode('note-first'); fireSave({ projectNameDisplayMode: 'note-first' }); }, false)}
            </div>
          </div>
        </div>

        {/* 数据管理卡片 */}
        <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px', marginBottom: '8px' }}>
          <div style={{ fontSize: '1em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '12px', fontWeight: 'bold' }}>数据清理</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ color: cTextPrimary }}>保留策略</div>
            <div style={{ display: 'flex' }}>
              {renderTabBtn('永久保留', !isCustomRetention, () => { setRetentionMode('forever'); fireSave({ retentionMode: 'forever' }); }, true)}
              {renderTabBtn('自定义', isCustomRetention, () => { const val = `${customDaysStr}d`; setRetentionMode(val); fireSave({ retentionMode: val }); }, false)}
            </div>
          </div>
          
          {isCustomRetention && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', marginLeft: '12px', paddingLeft: '8px', borderLeft: `2px solid ${cBoxBorder}` }}>
              <div style={{ color: cTextSecondary, fontSize: '0.9em' }}>保留天数 (7-365天)</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <SafeInput 
                  type="text"
                  value={customDaysStr}
                  onChange={(e) => handleCustomDaysChange(e.target.value)}
                  onBlur={handleCustomDaysBlur}
                  style={{ width: '26px', height: '22px', margin: 0, boxSizing: 'border-box', padding: '0', fontWeight: 'bold', color: cTextPrimary, borderRadius: '4px', outline: 'none', textAlign: 'center' }}
                />
                <div style={{ color: cTextSecondary, marginLeft: '4px', fontSize: '0.9em' }}>天</div>
              </div>
            </div>
          )}
          
          <div style={{ color: cTextSecondary, fontSize: '0.8em', marginTop: '4px', marginBottom: '14px' }}>
            {retentionMode === 'forever' 
              ? '所有项目及记录将永久保留' 
              : `清理超过 ${customDaysStr} 天未活跃的项目及记录`}
          </div>

          <div style={{ borderTop: `1px solid ${cBoxBorder}`, paddingTop: '14px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', visibility: resetState === 2 ? 'hidden' : 'visible' }}>
              <div>
                <div style={{ color: cTextPrimary }}>清空所有记录</div>
                <div style={{ color: '#ff8a80', fontSize: '0.8em', marginTop: '2px' }}>(此操作不可恢复)</div>
              </div>
              {resetState === 0 ? (
                <div 
                  onClick={() => setResetState(1)} 
                  style={{ ...btnStyle, width: '64px', backgroundColor: 'rgba(244, 67, 54, 0.3)', color: '#fff', border: '1px solid rgba(244, 67, 54, 0.4)', fontWeight: 'bold', flexShrink: 0 }}
                >
                  🗑️ 清空
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div 
                    onClick={() => setResetState(2)}
                    style={{ ...btnStyle, whiteSpace: 'nowrap', padding: '4px 10px', backgroundColor: 'rgba(244, 67, 54, 0.6)', color: '#fff', fontWeight: 'bold', border: '1px solid rgba(244, 67, 54, 0.8)', flexShrink: 0, marginRight: '6px' }}
                  >
                    确认清空
                  </div>
                  <div 
                    onClick={() => setResetState(0)}
                    style={{ ...btnStyle, width: '64px', backgroundColor: cBoxBg, color: cTextPrimary, flexShrink: 0 }}
                  >
                    取消
                  </div>
                </div>
              )}
            </div>

            {resetState === 2 && (
              <div 
                onClick={async () => {
                  try {
                    if (onResetDefaults) await onResetDefaults();
                    setMessage('✅ 已清空！');
                    setTimeout(() => {
                      setMessage('');
                      setResetState(0);
                      onBackToStatus();
                    }, 1200);
                  } catch (err: any) {
                    setMessage('❌ 清空失败: ' + err.message);
                  }
                }}
                style={{ 
                  ...btnStyle, 
                  position: 'absolute', 
                  top: '14px', 
                  left: 0, 
                  right: 0, 
                  bottom: 0,
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: 'rgba(244, 67, 54, 0.95)', 
                  color: '#fff', 
                  fontWeight: 'bold', 
                  border: '1px solid rgba(244, 67, 54, 1)', 
                  fontSize: '1em' 
                }}
              >
                ⚠️确认清空所有记录！
              </div>
            )}
          </div>
        </div>

        {/* 导出卡片 */}
        <div style={{ background: cBoxBg, border: `1px solid ${cBoxBorder}`, borderRadius: '4px', padding: '12px' }}>
          {showExportOptions ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div onClick={async () => {
                try {
                  await onExportTxt('work');
                  setExportStatus('success');
                  setShowExportOptions(false);
                  setTimeout(() => setExportStatus('idle'), 3000);
                } catch (e: any) {
                  if (e.message && !e.message.toLowerCase().includes('cancel')) {
                    setExportStatus('error');
                    setExportErrorMsg(e.message);
                    setShowExportOptions(false);
                    setTimeout(() => setExportStatus('idle'), 3000);
                  }
                }
              }} style={{ ...btnStyle, flex: 1, marginRight: '8px', background: cBlueBg, color: cActiveText, border: `1px solid ${cBlueBorder}`, fontWeight: 'bold' }}>
                ⏱️ 导出时间
              </div>
              <div onClick={async () => {
                try {
                  await onExportTxt('project');
                  setExportStatus('success');
                  setShowExportOptions(false);
                  setTimeout(() => setExportStatus('idle'), 3000);
                } catch (e: any) {
                  if (e.message && !e.message.toLowerCase().includes('cancel')) {
                    setExportStatus('error');
                    setExportErrorMsg(e.message);
                    setShowExportOptions(false);
                    setTimeout(() => setExportStatus('idle'), 3000);
                  }
                }
              }} style={{ ...btnStyle, flex: 1, background: cBlueBg, color: cActiveText, border: `1px solid ${cBlueBorder}`, fontWeight: 'bold' }}>
                📂 导出项目
              </div>
            </div>
          ) : (
            <div onClick={() => {
              if (exportStatus === 'idle') setShowExportOptions(true);
            }} style={{ 
              ...btnStyle, 
              background: exportStatus === 'success' ? cGreenBg : (exportStatus === 'error' ? 'rgba(244, 67, 54, 0.4)' : cBlueBg), 
              color: cActiveText, 
              border: `1px solid ${exportStatus === 'success' ? cGreenBorder : (exportStatus === 'error' ? 'rgba(244, 67, 54, 0.7)' : cBlueBorder)}`, 
              fontWeight: 'bold'
            }}>
              {exportStatus === 'success' ? '✅ 报表导出成功' : (exportStatus === 'error' ? `❌ 导出失败: ${exportErrorMsg}` : '📤 导出历史报表 (CSV)')}
            </div>
          )}
        </div>

        {/* 底部版权信息 */}
        <div style={{ textAlign: 'center', marginTop: '3px', fontSize: '0.85em', color: cTextSecondary, letterSpacing: '0.5px' }}>
          V1.4.2(beta) <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span> by Zhichi
        </div>
        
      </div>
    </div>
  );
};
