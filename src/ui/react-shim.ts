/**
 * 轻量化零外部依赖 React Shim / JSX Engine
 * 支持标准 TSX、React Hooks 生命期、只读 ViewModel 绑定与组件挂载/卸载管理
 */

export type ReactNode = any;
export type Element = VNode;
export type ComponentType<P = any> = (props: P) => VNode | null;
export type FC<P = {}> = (props: P) => VNode | null;

export interface VNode {
  type: any;
  props: Record<string, any>;
  children: (VNode | string | number | null | undefined)[];
  key?: any;
}

export const Fragment = 'REACT_FRAGMENT';

// 全局 Hook 执行上下文
interface EffectRecord {
  deps?: any[];
  cleanup?: () => void;
}

interface MemoRecord {
  deps?: any[];
  value: any;
}

export class ComponentInstance {
  public stateSlots: any[] = [];
  public effectSlots: EffectRecord[] = [];
  public memoSlots: MemoRecord[] = [];
  public refSlots: Array<{ current: any }> = [];
  public isUnmounted = false;
  public isRendering = false;
  public lastVNode: VNode | null = null;
  public onRenderCallbacks: Array<() => void> = [];

  constructor(
    public readonly Component: ComponentType<any>,
    public props: any = {}
  ) {}

  public render(): VNode | null {
    if (this.isUnmounted || this.isRendering) return this.lastVNode;
    this.isRendering = true;
    currentInstance = this;
    currentHookIndex = 0;
    try {
      this.lastVNode = this.Component(this.props);
      this.runEffects();
      for (const cb of this.onRenderCallbacks) {
        cb();
      }
      return this.lastVNode;
    } finally {
      this.isRendering = false;
      currentInstance = null;
    }
  }

  public setProps(newProps: any): VNode | null {
    this.props = { ...this.props, ...newProps };
    return this.render();
  }

  private runEffects(): void {
    // 渲染完成后，在下一个 tick/同步运行未执行的 effect
    for (let i = 0; i < pendingEffects.length; i++) {
      const { instance, index, effect, deps } = pendingEffects[i];
      if (instance !== this || instance.isUnmounted) continue;

      const prevEffect = instance.effectSlots[index];
      let shouldRun = false;
      if (!prevEffect || !prevEffect.deps || !deps) {
        shouldRun = true;
      } else {
        shouldRun = deps.some((d, idx) => d !== prevEffect.deps![idx]);
      }

      if (shouldRun) {
        if (prevEffect && typeof prevEffect.cleanup === 'function') {
          try {
            prevEffect.cleanup();
          } catch (e) {
            console.error('Error in effect cleanup:', e);
          }
        }
        const cleanup = effect();
        instance.effectSlots[index] = {
          deps,
          cleanup: typeof cleanup === 'function' ? cleanup : undefined,
        };
      }
    }
    pendingEffects = pendingEffects.filter((e) => e.instance !== this);
  }

  public unmount(): void {
    if (this.isUnmounted) return;
    this.isUnmounted = true;
    for (const slot of this.effectSlots) {
      if (slot && typeof slot.cleanup === 'function') {
        try {
          slot.cleanup();
        } catch (e) {
          console.error('Error in unmount cleanup:', e);
        }
      }
    }
    this.effectSlots = [];
  }
}

let currentInstance: ComponentInstance | null = null;
let currentHookIndex = 0;
let pendingEffects: Array<{
  instance: ComponentInstance;
  index: number;
  effect: () => void | (() => void);
  deps?: any[];
}> = [];

export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prev: T) => T)) => void] {
  if (!currentInstance) {
    // 允许孤立测试或非 ComponentInstance 渲染 fallback
    const val = typeof initialState === 'function' ? (initialState as any)() : initialState;
    return [val, () => {}];
  }

  const inst = currentInstance;
  const index = currentHookIndex++;

  if (inst.stateSlots.length <= index) {
    const initVal = typeof initialState === 'function' ? (initialState as any)() : initialState;
    inst.stateSlots.push(initVal);
  }

  const state = inst.stateSlots[index];
  const setState = (newState: T | ((prev: T) => T)) => {
    if (inst.isUnmounted) return;
    const nextVal = typeof newState === 'function' ? (newState as any)(inst.stateSlots[index]) : newState;
    if (inst.stateSlots[index] !== nextVal) {
      inst.stateSlots[index] = nextVal;
      inst.render();
    }
  };

  return [state, setState];
}

export function useEffect(effect: () => void | (() => void), deps?: any[]): void {
  if (!currentInstance) {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanup();
    return;
  }

  const inst = currentInstance;
  const index = currentHookIndex++;

  pendingEffects.push({
    instance: inst,
    index,
    effect,
    deps,
  });
}

export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T {
  return useMemo(() => callback, deps);
}

export function useMemo<T>(factory: () => T, deps: any[]): T {
  if (!currentInstance) return factory();

  const inst = currentInstance;
  const index = currentHookIndex++;
  const prevMemo = inst.memoSlots[index];

  let shouldRecalculate = false;
  if (!prevMemo || !prevMemo.deps) {
    shouldRecalculate = true;
  } else {
    shouldRecalculate = deps.some((d, idx) => d !== prevMemo.deps![idx]);
  }

  if (shouldRecalculate) {
    const val = factory();
    inst.memoSlots[index] = { deps, value: val };
    return val;
  }

  return prevMemo.value;
}

export function useRef<T>(initialValue: T): { current: T } {
  if (!currentInstance) return { current: initialValue };

  const inst = currentInstance;
  const index = currentHookIndex++;

  if (inst.refSlots.length <= index) {
    inst.refSlots.push({ current: initialValue });
  }

  return inst.refSlots[index];
}

export function createElement(type: any, props?: any, ...children: any[]): VNode {
  const normalizedProps = { ...(props || {}) };
  const rawChildren = children.length > 0 ? children : normalizedProps.children;
  
  let flatChildren: any[] = [];
  if (Array.isArray(rawChildren)) {
    flatChildren = rawChildren.flat(Infinity);
  } else if (rawChildren !== undefined && rawChildren !== null) {
    flatChildren = [rawChildren];
  }

  delete normalizedProps.children;

  const key = normalizedProps.key;
  delete normalizedProps.key;

  return {
    type,
    props: normalizedProps,
    children: flatChildren,
    key,
  };
}

export function jsx(type: any, props?: any, key?: any): VNode {
  return createElement(type, { ...props, key });
}

export function jsxs(type: any, props?: any, key?: any): VNode {
  return createElement(type, { ...props, key });
}

export function jsxDEV(type: any, props?: any, key?: any, isStatic?: boolean, source?: any, self?: any): VNode {
  return createElement(type, { ...props, key });
}

// 供单元测试渲染与挂载 UI 组件的真实 Helper
export interface RenderResult {
  instance: ComponentInstance;
  container: {
    getTree: () => VNode | null;
    getText: () => string;
    find: (predicate: (vnode: VNode) => boolean) => VNode | null;
    findAll: (predicate: (vnode: VNode) => boolean) => VNode[];
    findByText: (text: string | RegExp) => VNode | null;
    findByTestId: (testId: string) => VNode | null;
    click: (target: VNode | string) => void;
    clickAsync: (target: VNode | string) => Promise<void>;
    changeInput: (target: VNode | string, newValue: string) => void;
  };
  unmount: () => void;
  rerender: (newProps?: any) => void;
}

export function render(Component: ComponentType<any>, props: any = {}): RenderResult {
  const instance = new ComponentInstance(Component, props);
  instance.render();

  function evaluateVNodeTree(vnode: any): any {
    if (!vnode) return null;
    if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
    if (vnode.type === Fragment) {
      return (vnode.children || []).map(evaluateVNodeTree).filter(Boolean);
    }
    if (typeof vnode.type === 'function') {
      const childVNode = vnode.type({ ...vnode.props, children: vnode.children });
      return evaluateVNodeTree(childVNode);
    }
    return {
      type: vnode.type,
      props: vnode.props,
      children: (vnode.children || []).map(evaluateVNodeTree).filter((c: any) => c !== null && c !== undefined),
    };
  }

  function collectText(tree: any): string {
    if (!tree) return '';
    if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
    if (Array.isArray(tree)) return tree.map(collectText).join(' ');
    let text = '';
    if (tree.props && tree.props.value !== undefined && tree.props.value !== null) {
      text += String(tree.props.value) + ' ';
    }
    if (tree.children) {
      text += collectText(tree.children);
    }
    return text;
  }

  function flattenNodes(tree: any): VNode[] {
    if (!tree) return [];
    if (typeof tree === 'string' || typeof tree === 'number') return [];
    if (Array.isArray(tree)) return tree.flatMap(flattenNodes);

    const nodes: VNode[] = [tree];
    if (tree.children) {
      nodes.push(...flattenNodes(tree.children));
    }
    return nodes;
  }

  const container = {
    getTree: () => evaluateVNodeTree(instance.lastVNode),
    getText: () => collectText(container.getTree()),
    find: (predicate: (vnode: VNode) => boolean) => {
      const nodes = flattenNodes(container.getTree());
      return nodes.find(predicate) || null;
    },
    findAll: (predicate: (vnode: VNode) => boolean) => {
      const nodes = flattenNodes(container.getTree());
      return nodes.filter(predicate);
    },
    findByText: (text: string | RegExp) => {
      const nodes = flattenNodes(container.getTree());
      return nodes.find((node) => {
        const nodeText = collectText(node);
        if (typeof text === 'string') return nodeText.includes(text);
        return text.test(nodeText);
      }) || null;
    },
    findByTestId: (testId: string) => {
      return container.find((n) => n.props && (n.props['data-testid'] === testId || n.props.id === testId));
    },
    click: (target: VNode | string) => {
      let node: VNode | null = null;
      if (typeof target === 'string') {
        node = container.findByTestId(target) || container.findByText(target) || container.find((n) => n.type === target || (n.props && n.props.id === target));
      } else {
        node = target;
      }
      if (node && node.props) {
        if (node.props.disabled) {
          return;
        }

        if (node.props.type === 'checkbox') {
          const nextChecked = !node.props.checked;
          if (typeof node.props.onChange === 'function') {
            node.props.onChange({
              target: { checked: nextChecked, value: nextChecked },
              preventDefault: () => {},
              stopPropagation: () => {},
            });
          }
        }

        if (typeof node.props.onClick === 'function') {
          node.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
        }
      }
    },
    clickAsync: async (target: VNode | string) => {
      container.click(target);
      await Promise.resolve();
      await Promise.resolve();
    },
    changeInput: (target: VNode | string, newValue: string) => {
      let node: VNode | null = null;
      if (typeof target === 'string') {
        node = container.findByTestId(target) || container.find((n) => n.type === 'textarea' || n.type === 'input') || container.findByText(target);
      } else {
        node = target;
      }
      if (node && node.props && typeof node.props.onChange === 'function') {
        node.props.onChange({
          target: { value: newValue },
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      }
    },
  };

  return {
    instance,
    container,
    unmount: () => instance.unmount(),
    rerender: (newProps?: any) => instance.setProps(newProps),
  };
}

// React 模块全局/命名空间类型支持
declare global {
  namespace React {
    export type ReactNode = any;
    export type Element = VNode;
    export type ComponentType<P = any> = (props: P) => VNode | null;
    export type FC<P = {}> = (props: P) => VNode | null;
  }
  namespace JSX {
    interface Element extends VNode {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export default React;

