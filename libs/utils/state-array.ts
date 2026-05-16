export function sameArrayBy<T>(
  current: readonly T[],
  next: readonly T[],
  signature: (item: T) => readonly unknown[]
): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;

  for (let i = 0; i < current.length; i += 1) {
    const left = signature(current[i]);
    const right = signature(next[i]);
    if (left.length !== right.length) return false;

    for (let j = 0; j < left.length; j += 1) {
      if (!Object.is(left[j], right[j])) return false;
    }
  }

  return true;
}
