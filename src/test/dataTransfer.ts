/**
 * jsdom has no DataTransfer. This one keeps what `setData` stores and lists
 * the types while dragging, like a browser does, so one instance can be
 * passed to every event of a drag via `fireEvent.*(target, { dataTransfer })`.
 */
export function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  } as unknown as DataTransfer;
}
