import React from "react";
import Reconciler from "react-reconciler";
import {DefaultEventPriority} from "react-reconciler/constants.js";

export type HostType = "sdd-screen" | "sdd-box" | "sdd-text";

export interface HostProps {
  style?: Record<string, unknown>;
  children?: React.ReactNode;
  text?: string;
}

export class HostNode {
  children: Array<HostNode | HostText> = [];

  constructor(
    public type: HostType,
    public props: HostProps,
  ) {}
}

export class HostText {
  constructor(public text: string) {}
}

export class HostRoot {
  children: Array<HostNode | HostText> = [];
}

const hostConfig = {
  now: Date.now,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (instance: HostNode | HostText) => instance,
  prepareForCommit: () => null,
  resetAfterCommit: () => undefined,
  createInstance: (type: HostType, props: HostProps) => new HostNode(type, props),
  createTextInstance: (text: string) => new HostText(text),
  appendInitialChild: appendChild,
  finalizeInitialChildren: () => false,
  prepareUpdate: () => true,
  shouldSetTextContent: () => false,
  clearContainer: (container: HostRoot) => {
    container.children = [];
    return false;
  },
  appendChild,
  appendChildToContainer: appendChild,
  insertBefore(parent: HostNode | HostRoot, child: HostNode | HostText, beforeChild: HostNode | HostText) {
    removeChild(parent, child);
    const index = parent.children.indexOf(beforeChild);
    if (index < 0) {
      parent.children.push(child);
      return;
    }
    parent.children.splice(index, 0, child);
  },
  insertInContainerBefore(parent: HostRoot, child: HostNode | HostText, beforeChild: HostNode | HostText) {
    hostConfig.insertBefore(parent, child, beforeChild);
  },
  removeChild,
  removeChildFromContainer: removeChild,
  commitUpdate(instance: HostNode, _updatePayload: unknown, _type: HostType, _oldProps: HostProps, newProps: HostProps) {
    instance.props = newProps;
  },
  commitTextUpdate(instance: HostText, _oldText: string, newText: string) {
    instance.text = newText;
  },
  resetTextContent: () => undefined,
  hideInstance: () => undefined,
  hideTextInstance: () => undefined,
  unhideInstance: () => undefined,
  unhideTextInstance: () => undefined,
  getCurrentEventPriority: () => DefaultEventPriority,
  setCurrentUpdatePriority(priority: number) {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => currentUpdatePriority || DefaultEventPriority,
  trackSchedulerEvent: () => undefined,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => performance.now(),
  beforeActiveInstanceBlur: () => undefined,
  afterActiveInstanceBlur: () => undefined,
  preparePortalMount: () => undefined,
  detachDeletedInstance: () => undefined,
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => undefined,
  suspendInstance: () => undefined,
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: {
    $$typeof: Symbol.for("react.context"),
    Provider: null,
    Consumer: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0,
  },
};

const renderer = Reconciler(hostConfig);
let currentUpdatePriority = DefaultEventPriority;

export function renderReactElement(element: React.ReactElement): HostRoot {
  const root = new HostRoot();
  const container = renderer.createContainer(root, 0, null, false, null, "", console.error, console.error, console.error, null);
  if (typeof renderer.updateContainerSync === "function") {
    renderer.updateContainerSync(element, container, null);
  } else {
    renderer.updateContainer(element, container, null, null);
  }
  renderer.flushSyncWork?.();
  return root;
}

function appendChild(parent: HostNode | HostRoot, child: HostNode | HostText): void {
  removeChild(parent, child);
  parent.children.push(child);
}

function removeChild(parent: HostNode | HostRoot, child: HostNode | HostText): void {
  const index = parent.children.indexOf(child);
  if (index >= 0) {
    parent.children.splice(index, 1);
  }
}
