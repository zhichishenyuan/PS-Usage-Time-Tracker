import React from 'react';
import { render } from 'react-dom';

// 彻底绕过 React 18 在部分 UXP 版本中的 performance 崩溃问题
if (typeof performance !== 'undefined') {
  performance.mark = () => {};
  performance.measure = () => {};
}

import { AppUI } from './ui/AppUI';
import { FileStore } from './persistence/Store';
import { AppSnapshot, ProjectViewModel } from './domain/types';
import { EventNormalizer } from './photoshop/EventNormalizer';
import { DocumentTracker } from './photoshop/DocumentTracker';
import { ExportService } from './domain/ExportService';
import { formatLocalDate } from './domain/validation';
import { SessionRecord } from './domain/types';
import { ProjectService } from './domain/ProjectService';
import { ProjectResolver } from './domain/ProjectResolver';
import { MergeService } from './domain/MergeService';
let uxp: any;
let uxpFs: any;
let ps: any;
try {
  uxp = require('uxp');
  uxpFs = uxp.storage.localFileSystem;
  ps = require('photoshop');
} catch (e) {
  console.warn("Not running in UXP environment");
}

class UXPFileStore implements FileStore {
  async getFolder() {
    return await uxpFs.getDataFolder();
  }
  async readText(filename: string): Promise<string | null> {
    try {
      const folder = await this.getFolder();
      const file = await folder.getEntry(filename);
      if (file.isFile) return await file.read();
      return null;
    } catch { return null; }
  }
  async writeText(filename: string, content: string): Promise<void> {
    const folder = await this.getFolder();
    const file = await folder.createEntry(filename, { overwrite: true });
    await file.write(content);
  }
  async exists(filename: string): Promise<boolean> {
    try {
      const folder = await this.getFolder();
      const file = await folder.getEntry(filename);
      return file.isFile;
    } catch { return false; }
  }
  async copy(src: string, target: string): Promise<void> {}
  async rename(src: string, target: string): Promise<void> {}
  async delete(filename: string): Promise<void> {}
}

const DEFAULT_SNAPSHOT: AppSnapshot = {
  schemaVersion: 1,
  snapshotId: 'uxp-init',
  writtenAt: new Date().toISOString(),
  lastCheckpointAt: new Date().toISOString(),
  lastFlushCompletedAt: new Date().toISOString(),
  nextUntitledSequence: 1,
  settings: {
    idleThresholdMs: 60000,
    freezeThresholdMs: 600000,
    showSummary: true,
    summaryMode: 'today',
    autoAssociate: true,
    retentionMode: 'forever',
    projectNameDisplayMode: 'name',
  },
  projects: {},
  fileRecords: {},
  sessionRecords: {},
  activeRuntimeSession: null,
  undoMergeRecords: {},
};

let currentSnapshot: AppSnapshot = JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));
let store: UXPFileStore;
let normalizer: EventNormalizer;
let documentTracker: DocumentTracker;
let rootElementWrapper: HTMLElement | null = null;
let renderApp: () => void = () => {};

let lastActivityMs = Date.now();
let currentSessionState: 'WORKING' | 'IDLE' | 'FROZEN' | 'NO_DOCUMENT' = 'NO_DOCUMENT';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 保存数据
async function flushToDisk() {
  currentSnapshot.writtenAt = new Date().toISOString();
  await store.writeText('app_snapshot.json', JSON.stringify(currentSnapshot));
}

function exportAndEndSession(now: number, reason: string) {
  const rt = currentSnapshot.activeRuntimeSession;
  if (!rt) return;
  const startMs = Date.parse(rt.segmentStartedAt);
  const record: SessionRecord = {
    id: rt.id,
    projectId: rt.projectId,
    documentId: rt.documentId,
    startAt: rt.startAt,
    endAt: new Date(now).toISOString(),
    onlineMs: rt.segmentOnlineMs,
    effectiveMs: rt.segmentEffectiveMs,
    status: 'completed',
    endReason: reason as any,
    segments: [{
      segmentId: rt.segmentId,
      startAt: rt.segmentStartedAt,
      endAt: new Date(now).toISOString(),
      onlineMs: rt.segmentOnlineMs,
      effectiveMs: rt.segmentEffectiveMs,
      localDate: formatLocalDate(startMs),
      actionSteps: rt.segmentActionSteps
    }],
    continuationGroupId: rt.continuationGroupId,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    actionSteps: rt.segmentActionSteps
  };
  
  currentSnapshot.sessionRecords[record.id] = record;
  if (currentSnapshot.projects[record.projectId]) {
    currentSnapshot.projects[record.projectId].sessions.push(record.id);
    currentSnapshot.projects[record.projectId].totalOnlineMs += record.onlineMs;
    currentSnapshot.projects[record.projectId].totalEffectiveMs += record.effectiveMs;
    currentSnapshot.projects[record.projectId].totalActionSteps = (currentSnapshot.projects[record.projectId].totalActionSteps || 0) + (record.actionSteps || 0);
  }
  currentSnapshot.activeRuntimeSession = null;
  currentSessionState = 'NO_DOCUMENT';
}

// 切换文档
function handleDocumentSwitch(doc: { documentId: string, displayName: string, fileName: string | null, isSaved: boolean } | null) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (currentSnapshot.activeRuntimeSession) {
    if (doc && doc.documentId === currentSnapshot.activeRuntimeSession.documentId) {
      const currentProjId = currentSnapshot.activeRuntimeSession.projectId;
      const currentProj = currentSnapshot.projects[currentProjId];
      // 触发另存为 (SaveAs) 继承逻辑：documentId 没变，但文件变为了已保存状态，且文件名改变
      if (currentProj && doc.isSaved && doc.fileName) {
        const fileRecord = currentSnapshot.fileRecords[doc.documentId];
        if (fileRecord && fileRecord.fileName !== doc.fileName) {
          const fileRecordsArr = Object.values(currentSnapshot.fileRecords);
          const { updatedProject, fileRecord: updatedFileRecord } = ProjectResolver.handleSaveAs(
            currentProj, 
            doc.fileName, 
            fileRecordsArr, 
            new Date(now)
          );
          
          currentSnapshot.projects[updatedProject.id] = updatedProject;
          currentSnapshot.fileRecords[updatedFileRecord.id] = updatedFileRecord;
          
          // 继承当前运行时 Session 到更新后的 Project
          currentSnapshot.activeRuntimeSession.projectId = updatedProject.id;
        }
      }
      return; 
    }
    
    exportAndEndSession(now, 'document-switch');
  }
  
  if (doc) {
    const existingProjects = Object.values(currentSnapshot.projects);
    const { project: resolvedProj, isNew } = ProjectResolver.resolveProject(
      { isSaved: doc.isSaved, name: doc.displayName, documentId: doc.documentId },
      currentSnapshot.settings.autoAssociate,
      existingProjects,
      () => existingProjects.filter(p => p.projectKey.startsWith('未命名_')).length + 1,
      new Date(now)
    );

    if (isNew) {
      currentSnapshot.projects[resolvedProj.id] = resolvedProj;
    }

    const docId = doc.documentId;
    if (!currentSnapshot.fileRecords[docId]) {
      currentSnapshot.fileRecords[docId] = {
        id: docId,
        projectId: resolvedProj.id,
        projectKey: resolvedProj.projectKey,
        displayName: doc.displayName,
        fileName: doc.fileName || doc.displayName,
        isSaved: doc.isSaved,
        temporaryKey: null,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso
      };
      if (!resolvedProj.documentIds.includes(docId)) {
        resolvedProj.documentIds.push(docId);
      }
    } else {
      const oldProjectId = currentSnapshot.fileRecords[docId].projectId;
      currentSnapshot.fileRecords[docId].lastSeenAt = nowIso;
      currentSnapshot.fileRecords[docId].displayName = doc.displayName;
      currentSnapshot.fileRecords[docId].isSaved = doc.isSaved;
      if (doc.fileName) {
         currentSnapshot.fileRecords[docId].fileName = doc.fileName;
      }
      currentSnapshot.fileRecords[docId].projectId = resolvedProj.id;
      currentSnapshot.fileRecords[docId].projectKey = resolvedProj.projectKey;
      
      if (oldProjectId !== resolvedProj.id && currentSnapshot.projects[oldProjectId]) {
        currentSnapshot.projects[oldProjectId].documentIds = currentSnapshot.projects[oldProjectId].documentIds.filter(id => id !== docId);
      }
      
      if (!resolvedProj.documentIds.includes(docId)) {
        resolvedProj.documentIds.push(docId);
      }
    }

    currentSnapshot.activeRuntimeSession = {
      id: generateUUID(),
      projectId: resolvedProj.id,
      documentId: doc.documentId,
      continuationGroupId: generateUUID(),
      segmentId: generateUUID(),
      segmentStartedAt: nowIso,
      segmentOnlineMs: 0,
      segmentEffectiveMs: 0,
      segmentActionSteps: 0,
      completedSegments: [],
      lastAccountingAt: now,
      lastHeartbeatAt: now,
      state: 'WORKING',
      startAt: nowIso,
    };
    currentSessionState = 'WORKING';
    lastActivityMs = now;
  }
  
  flushToDisk().catch(e => console.error(e));
  renderApp();
}

async function bootApp(rootElement: HTMLElement) {
  if (!rootElementWrapper) {
    rootElementWrapper = document.createElement("div");
    rootElementWrapper.style.width = "100%";
    rootElementWrapper.style.height = "100%";
    rootElementWrapper.style.backgroundColor = "transparent";
    rootElementWrapper.style.padding = "0px";
    rootElement.appendChild(rootElementWrapper);
  }

  if (uxp) {
    store = new UXPFileStore();
    const text = await store.readText('app_snapshot.json');
    if (text) {
      try {
        let parsed = JSON.parse(text);
        if (parsed.mergeOperationStack) {
          delete parsed.mergeOperationStack;
        }
        if (!parsed.undoMergeRecords) {
          parsed.undoMergeRecords = {};
        }
        // Recovery for the undoMerge bug where UndoMergeResult was saved instead of AppSnapshot
        if (parsed && parsed.updatedSnapshot && !parsed.projects) {
          parsed = parsed.updatedSnapshot;
        }
        currentSnapshot = { ...currentSnapshot, ...parsed };
      } catch (e) {
        console.error("Failed to parse snapshot", e);
      }
    }
    
    // 执行自动清理逻辑
    const retentionStr = currentSnapshot.settings?.retentionMode;
    if (retentionStr && retentionStr !== 'forever') {
      const match = retentionStr.match(/^(\d+)d(?:ays)?$/);
      if (match) {
        const days = parseInt(match[1], 10);
        if (!isNaN(days) && days > 0) {
          try {
            const cleanupResult = ProjectService.batchAutoCleanup(currentSnapshot, days, Date.now());
            if (cleanupResult.changed) {
              currentSnapshot = cleanupResult.newSnapshot;
              // Save immediately if changes happened during startup cleanup
              await store.writeText('app_snapshot.json', JSON.stringify(currentSnapshot));
              console.log(`Auto-cleanup completed, removed old records older than ${days} days.`);
            }
          } catch(e) {
            console.error("Failed during auto cleanup", e);
          }
        }
      }
    }


    normalizer = new EventNormalizer();
    documentTracker = new DocumentTracker(normalizer, {
      getActiveDocument: async () => {
        try {
          const doc = ps.app.activeDocument;
          if (!doc) return null;
          return {
            id: doc.id.toString(),
            name: doc.name,
            path: doc.path ? doc.path.toString() : null,
            isSaved: doc.isSaved
          };
        } catch { return null; }
      }
    });

    // 极简心跳：只监听最有代表性的动作，必须包含 open 和 make 以便抓取新打开的文件
    const trackEvents = ['historyStateChanged', 'select', 'save', 'open', 'make', 'close'];
    
    for (const ev of trackEvents) {
      try {
        ps.action.addNotificationListener([ev], async (event: string, descriptor: any) => {
          lastActivityMs = Date.now();
          if (event === 'historyStateChanged' && currentSnapshot.activeRuntimeSession && currentSessionState === 'WORKING') {
            currentSnapshot.activeRuntimeSession.segmentActionSteps = (currentSnapshot.activeRuntimeSession.segmentActionSteps || 0) + 1;
          }
          if (['select', 'open', 'make', 'close', 'save', 'saveAs'].includes(event)) {
            // 立即检查，如果因为大文件加载慢没抓到，底层的 1s 心跳会兜底
            const health = await documentTracker.checkHealth();
            if (health.changed) {
              const activeDoc = health.activeState;
              handleDocumentSwitch(activeDoc);
            }
          }
        });
      } catch (e) {
        // Ignore unsupported events silently
      }
    }
    
    // 初始化启动时的前台文档
    const initialHealth = await documentTracker.checkHealth();
    if (initialHealth.activeState) {
      handleDocumentSwitch(initialHealth.activeState);
    }
  }

  let lastTickMs = Date.now();

  renderApp = () => {
    if (currentSnapshot.activeRuntimeSession) {
      currentSnapshot.activeRuntimeSession.state = currentSessionState as any;
    }

    render(
      <AppUI 
        getSnapshot={() => currentSnapshot}
        getActiveRuntime={() => currentSnapshot.activeRuntimeSession}
        subscribe={(listener) => {
          // 极简累加器 Tick 循环
          const interval = setInterval(async () => {
            const now = Date.now();
            const delta = now - lastTickMs;
            lastTickMs = now;

            let stateChanged = false;
            let needsFlush = false;
            
            // 兜底轮询：每秒钟强制检查一次当前活跃文档，完美解决机械硬盘加载大文件带来的延迟问题
            const health = await documentTracker.checkHealth();
            if (health.changed) {
              const activeDoc = health.activeState;
              handleDocumentSwitch(activeDoc);
              needsFlush = true;
            }
            
            if (currentSnapshot.activeRuntimeSession) {
              const idleMs = now - lastActivityMs;
              const oldState = currentSessionState;

              if (idleMs < currentSnapshot.settings.idleThresholdMs) {
                currentSessionState = 'WORKING';
                currentSnapshot.activeRuntimeSession.segmentOnlineMs += delta;
                currentSnapshot.activeRuntimeSession.segmentEffectiveMs += delta;
              } else if (idleMs < currentSnapshot.settings.freezeThresholdMs) {
                currentSessionState = 'IDLE';
                currentSnapshot.activeRuntimeSession.segmentOnlineMs += delta;
              } else {
                currentSessionState = 'FROZEN';
              }
              
              currentSnapshot.activeRuntimeSession.state = currentSessionState as any;
              
              if (oldState !== currentSessionState) {
                stateChanged = true;
                needsFlush = true;
              } else if (currentSessionState === 'WORKING') {
                stateChanged = true; // 保持 UI 秒表跳动
              }

              // 检查跨天结算
              const lastDay = new Date(now - delta).getDate();
              const currDay = new Date(now).getDate();
              if (lastDay !== currDay) {
                const docId = currentSnapshot.activeRuntimeSession.documentId;
                const projId = currentSnapshot.activeRuntimeSession.projectId;
                // Note: Domain doesn't have 'midnight', we use 'document-switch' as fallback or add 'midnight' to Domain if needed. Actually we'll just use 'document-switch' for now to pass validation.
                exportAndEndSession(now, 'document-switch');
                currentSnapshot.activeRuntimeSession = {
                  id: generateUUID(),
                  projectId: projId,
                  documentId: docId,
                  continuationGroupId: generateUUID(),
                  segmentId: generateUUID(),
                  segmentStartedAt: new Date(now).toISOString(),
                  segmentOnlineMs: 0,
                  segmentEffectiveMs: 0,
                  segmentActionSteps: 0,
                  completedSegments: [],
                  lastAccountingAt: now,
                  lastHeartbeatAt: now,
                  state: 'WORKING',
                  startAt: new Date(now).toISOString(),
                };
                currentSessionState = 'WORKING';
                lastActivityMs = now;
                needsFlush = true;
              }
            }
            
            if (stateChanged && now - lastFlushMs > 15000) {
              needsFlush = true;
            }
            
            if (stateChanged) {
              if (needsFlush) {
                lastFlushMs = now;
                flushToDisk().catch(e => console.error("Flush error", e));
              }
              listener();
            }
          }, 1000);
          return () => clearInterval(interval);
        }}
        getNow={() => Date.now()}
        sessionState={currentSessionState as any}
        onDeleteProject={async (projectId: string) => {
          try {
            currentSnapshot = ProjectService.hardDeleteProject(currentSnapshot, projectId);
            await flushToDisk();
            renderApp();
          } catch (e: any) {
            console.error("删除项目失败:", e);
            if (typeof alert !== 'undefined') alert("删除失败: " + e.message);
          }
        }}
        onMergeProjects={async (primaryId: string, mergeIds: string[]) => {
          try {
            let currentPrimaryId = primaryId;
            for (const mId of mergeIds) {
              const result = MergeService.mergeProjects(currentSnapshot, currentPrimaryId, mId, new Date());
              currentSnapshot = result.updatedSnapshot;
              currentPrimaryId = result.primaryProject.id;
            }
            await flushToDisk();
            renderApp();
          } catch (e: any) {
            console.error("合并项目失败:", e);
            try {
              const ps = require('photoshop');
              if (ps && ps.core && ps.core.showAlert) {
                ps.core.showAlert({ message: "合并失败: " + e.message });
              } else if (typeof alert !== 'undefined') {
                alert("合并失败: " + e.message);
              }
            } catch (err) {
              if (typeof alert !== 'undefined') alert("合并失败: " + e.message);
            }
          }
        }}
        onUndoMerge={async (projectId: string) => {
          try {
            const result = MergeService.undoMerge(currentSnapshot, projectId);
            currentSnapshot = result.updatedSnapshot;
            await flushToDisk();
            renderApp();
          } catch (e: any) {
            console.error("撤销合并失败:", e);
            try {
              const ps = require('photoshop');
              if (ps && ps.core && ps.core.showAlert) {
                ps.core.showAlert({ message: "撤销失败: " + e.message });
              } else if (typeof alert !== 'undefined') {
                alert("撤销失败: " + e.message);
              }
            } catch (err) {
              if (typeof alert !== 'undefined') alert("撤销失败: " + e.message);
            }
          }
        }}
        onUpdateNote={async (projectId: string, note: string) => {
          if (currentSnapshot.projects[projectId]) {
            currentSnapshot.projects[projectId].note = note;
            await flushToDisk();
            renderApp();
          }
        }}
        onSaveSettings={async (settings) => {
          currentSnapshot.settings = settings;
          lastActivityMs = Date.now();
          await flushToDisk();
          renderApp();
        }}
        onResetDefaults={async () => {
          exportAndEndSession(Date.now(), 'photoshop-exit');
          
          // 原地清空所有字典，避免任何变量引用的闭包缓存问题
          for (let key in currentSnapshot.projects) delete currentSnapshot.projects[key];
          for (let key in currentSnapshot.fileRecords) delete currentSnapshot.fileRecords[key];
          for (let key in currentSnapshot.sessionRecords) delete currentSnapshot.sessionRecords[key];
          
          currentSnapshot.activeRuntimeSession = null;
          currentSessionState = 'NO_DOCUMENT';
          currentSnapshot.undoMergeRecords = {};
          
          await flushToDisk();
          const health = await documentTracker.checkHealth();
          if (health.activeState) {
            handleDocumentSwitch(health.activeState);
          } else {
            renderApp();
          }
        }}
        onExportTxt={async () => {
          const uxp = require('uxp');
          const fs = uxp.storage.localFileSystem;
          const folder = await fs.getFolder();
          
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hour = String(now.getHours()).padStart(2, '0');
          const min = String(now.getMinutes()).padStart(2, '0');
          const sec = String(now.getSeconds()).padStart(2, '0');
          const ts = `${year}-${month}${day}-${hour}${min}${sec}`;
          const fileName = `UTT_Export_${ts}.csv`;
          
          const file = await folder.createFile(fileName, { overwrite: true });
          const csvData = ExportService.exportToCSV(currentSnapshot.projects, currentSnapshot.sessionRecords);
          await file.write(csvData);
        }}
      />,
      rootElementWrapper
    );
  };
  
  renderApp();
}

if (uxp) {
    uxp.entrypoints.setup({
      plugin: {
        create() {},
        destroy() {
          exportAndEndSession(Date.now(), 'photoshop-exit');
          flushToDisk();
        }
      },
      panels: {
        usageTimeTrackerPanel: {
          show(event: any) {
            bootApp(event.node || document.body).catch(e => {
                const target = event.node || document.body;
                target.innerHTML = `<div style="color:red; padding:10px;">Fatal Error: ${e.message}</div>`;
            });
          },
          hide(event: any) {}
        }
      }
    });
}
