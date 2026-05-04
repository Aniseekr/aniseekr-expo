// Minimal helpers for inspecting React element trees without a real renderer.
// We don't have react-test-renderer in this project, so the tests render
// component functions directly by calling them and walking the returned tree.

import type { ReactElement, ReactNode } from 'react';

export interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: RenderedNode[];
}

const FALSY = (v: unknown): boolean => v === null || v === undefined || v === false || v === true;

function describeType(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function')
    return (
      (type as { displayName?: string; name?: string }).displayName ||
      (type as { name?: string }).name ||
      'Component'
    );
  // forwardRef objects expose a $$typeof + render signature.
  if (type && typeof type === 'object') {
    const inner = (type as { render?: unknown }).render;
    if (typeof inner === 'function') {
      return (
        (inner as { displayName?: string; name?: string }).displayName ||
        (inner as { name?: string }).name ||
        'ForwardRef'
      );
    }
    const name =
      (type as { displayName?: string; name?: string }).displayName ||
      (type as { name?: string }).name;
    if (name) return name;
  }
  return 'Unknown';
}

function evaluate(node: ReactNode): RenderedNode | RenderedNode[] | string | null {
  if (FALSY(node)) return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const out: RenderedNode[] = [];
    for (const child of node) {
      const r = evaluate(child);
      if (r === null) continue;
      if (Array.isArray(r)) out.push(...r);
      else if (typeof r === 'string')
        out.push({ type: '#text', props: { value: r }, children: [] });
      else out.push(r);
    }
    return out;
  }

  const element = node as ReactElement;
  const type = element.type;
  const props = (element.props ?? {}) as Record<string, unknown>;

  // If functional component, render it.
  if (typeof type === 'function') {
    const result = (type as (p: typeof props) => ReactNode)(props);
    return evaluate(result);
  }
  // forwardRef: render its `.render` with props
  if (type && typeof type === 'object') {
    const fr = type as { render?: (props: Record<string, unknown>, ref: unknown) => ReactNode };
    if (typeof fr.render === 'function') {
      const result = fr.render(props, null);
      // Wrap it in a host node so we can still see the type label.
      const inner = evaluate(result);
      const children: RenderedNode[] = [];
      if (Array.isArray(inner)) children.push(...inner);
      else if (inner && typeof inner !== 'string') children.push(inner);
      else if (typeof inner === 'string')
        children.push({ type: '#text', props: { value: inner }, children: [] });
      return { type: describeType(type), props, children };
    }
  }

  const childrenNode = props.children as ReactNode | undefined;
  let renderedChildren: RenderedNode[] = [];
  if (childrenNode !== undefined) {
    const r = evaluate(childrenNode);
    if (r === null) renderedChildren = [];
    else if (Array.isArray(r)) renderedChildren = r;
    else if (typeof r === 'string')
      renderedChildren = [{ type: '#text', props: { value: r }, children: [] }];
    else renderedChildren = [r];
  }

  return {
    type: describeType(type),
    props,
    children: renderedChildren,
  };
}

/**
 * Render a function component into an inspectable tree.
 * Pressable/View/Text and friends are kept as host strings (e.g. "View").
 */
export function render<TProps>(
  Component: (props: TProps) => ReactElement | null,
  props: TProps
): RenderedNode {
  const element = Component(props);
  const result = evaluate(element);
  if (result === null) return { type: '#null', props: {}, children: [] };
  if (typeof result === 'string') return { type: '#text', props: { value: result }, children: [] };
  if (Array.isArray(result)) return { type: '#fragment', props: {}, children: result };
  return result;
}

/** Walk the tree and collect every node where predicate returns true. */
export function findAll(
  root: RenderedNode,
  predicate: (n: RenderedNode) => boolean
): RenderedNode[] {
  const out: RenderedNode[] = [];
  const visit = (n: RenderedNode) => {
    if (predicate(n)) out.push(n);
    for (const c of n.children) visit(c);
  };
  visit(root);
  return out;
}

/** Concatenate every text node's value in document order. */
export function getAllText(root: RenderedNode): string[] {
  return findAll(root, (n) => n.type === '#text').map((n) =>
    String((n.props as { value?: unknown }).value ?? '')
  );
}
