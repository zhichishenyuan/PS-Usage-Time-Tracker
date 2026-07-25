import React, { useState } from 'react';
import { ReadModelService } from '../app/readmodel/ReadModelService';
import { AppSnapshot, RuntimeSession, Settings } from '../domain/types';
import { StatusView } from './components/StatusView';
import { HistoryView } from './components/HistoryView';
import { NoteEditor } from './components/NoteEditor';
import { SettingsView } from './components/SettingsView';
import { ProjectDetailView } from './components/ProjectDetailView';
import { useReadModel } from './hooks/useReadModel';

export type UIViewMode = 'status' | 'history' | 'settings' | 'note' | 'detail';

export interface AppUIProps {
  getSnapshot: () => Readonly<AppSnapshot>;
  getActiveRuntime: () => Readonly<RuntimeSession> | null;
  subscribe?: (listener: () => void) => () => void;
  getNow?: () => number;
  sessionState?: any;
  onUpdateNote?: (projectId: string, note: string) => Promise<void> | void;
  onSaveSettings?: (newSettings: Settings) => Promise<void> | void;
  onMergeProjects?: (primaryProjectId: string, mergedProjectIds: string[]) => Promise<void> | void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onExportTxt?: () => Promise<void> | void;
  onResetDefaults?: () => Promise<void> | void;
  onUndoMerge?: (projectId: string) => Promise<void> | void;
}

export const AppUI: React.FC<AppUIProps> = (props: AppUIProps) => {
  const {
    getSnapshot,
    getActiveRuntime,
    subscribe,
    getNow,
    sessionState,
    onUpdateNote,
    onSaveSettings,
    onMergeProjects,
    onDeleteProject,
    onExportTxt,
    onResetDefaults,
    onUndoMerge,
  } = props;
  const [currentView, setCurrentView] = useState<UIViewMode>('status');
  const [previousView, setPreviousView] = useState<UIViewMode>('status');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [timelinePage, setTimelinePage] = useState<number>(1);
  const [historyTab, setHistoryTab] = useState<'timeline' | 'projects'>('timeline');

  const readOptions = { getSnapshot, getActiveRuntime, subscribe, getNow };

  // 1. ViewModel 只读订阅
  const projects = useReadModel((snap, rt, now) => ReadModelService.getProjectViewModels(snap, rt, now), readOptions);
  const summary = useReadModel((snap, rt, now) => ReadModelService.getSummaryViewModel(snap, rt, now), readOptions);
  const timelineSessions = useReadModel(
    (snap, rt, now) => ReadModelService.getTimelineSessionViewModels(snap, rt, { page: timelinePage, pageSize: 10 }, now),
    readOptions
  );

  const activeProject = projects.find((p) => p.isCurrentlyActive) || (projects.length > 0 ? projects[0] : null);
  const activeLiveCard = activeProject?.liveSessionCard || null;
  const runtime = getActiveRuntime();
  const currentSessionState = (runtime?.state) || sessionState || (activeProject?.isCurrentlyActive ? 'WORKING' : 'NO_DOCUMENT');

  const handleNavigate = (view: UIViewMode, extra?: any) => {
    if (view === 'note') {
      const targetId = extra?.projectId || activeProject?.id;
      if (targetId) {
        setEditingProjectId(targetId);
        setPreviousView(currentView);
        setCurrentView('note');
      }
    } else if (view === 'detail') {
      if (extra?.projectId) {
        setDetailProjectId(extra.projectId);
        setPreviousView(currentView);
        setCurrentView('detail');
      }
    } else {
      setCurrentView(view);
    }
  };

  const editingProject = projects.find((p) => p.id === editingProjectId) || activeProject;

  return (
    <div className="utt-app-ui" data-testid="app-ui-container" style={{ width: '100%', height: '100%', fontFamily: 'sans-serif' }}>
      {currentView === 'status' && (
        <StatusView
          activeProject={activeProject}
          summary={summary}
          sessionState={currentSessionState}
          onNavigate={handleNavigate}
        />
      )}

      {currentView === 'history' && (
        <HistoryView
          timelineSessions={timelineSessions}
          projects={projects}
          activeLiveCard={activeLiveCard}
          activeTab={historyTab}
          onTabChange={setHistoryTab}
          onLoadMore={() => setTimelinePage((prev) => prev + 1)}
          onBackToStatus={() => setCurrentView('status')}
          onMergeProjects={onMergeProjects}
          onDeleteProject={onDeleteProject}
          onEditNote={(id: string) => {
            setEditingProjectId(id);
            setPreviousView('history');
            setCurrentView('note');
          }}
          onNavigate={handleNavigate}
          onUndoMerge={onUndoMerge}
        />
      )}

      {currentView === 'detail' && detailProjectId && (
        <ProjectDetailView
          project={projects.find(p => p.id === detailProjectId)!}
          onBack={() => setCurrentView(previousView)}
          onEditNote={(id: string) => {
            setEditingProjectId(id);
            setPreviousView('detail');
            setCurrentView('note');
          }}
          onUndoMerge={onUndoMerge}
        />
      )}

      {currentView === 'note' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '20px' }}>
          <NoteEditor
            projectId={editingProject ? editingProject.id : 'proj_unknown'}
            projectName={editingProject ? editingProject.name : '未知项目'}
            initialNote={editingProject ? editingProject.note : ''}
            onSave={async (pid: string, note: string) => {
              if (onUpdateNote) {
                await onUpdateNote(pid, note);
              }
              setCurrentView(previousView);
            }}
            onCancel={() => setCurrentView(previousView)}
          />
        </div>
      )}

      {currentView === 'settings' && (
        <SettingsView
          settings={getSnapshot().settings}
          onSaveSettings={async (newSettings: Settings) => {
            if (onSaveSettings) {
              await onSaveSettings(newSettings);
            }
          }}
          onExportTxt={async () => {
            if (onExportTxt) {
              await onExportTxt();
            }
          }}
          onResetDefaults={async () => {
            if (onResetDefaults) {
              await onResetDefaults();
            }
          }}
          onBackToStatus={() => setCurrentView('status')}
        />
      )}
    </div>
  );
};
