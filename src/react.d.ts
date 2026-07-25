declare module 'react' {
  export = React;
  export as namespace React;
  namespace React {
    type ReactNode = any;
    type FC<P={}> = (props: P) => any;
    function useState<T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
    function useEffect(effect: () => void | (() => void), deps?: any[]): void;
    function useMemo<T>(factory: () => T, deps?: any[]): T;
    function useCallback<T>(callback: T, deps?: any[]): T;
    function useRef<T>(initial: T): { current: T };
  }
}
declare module 'react-dom/client' {
  export function createRoot(container: any): any;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
