import {assertIsDefined} from '~/common/assertions';

export interface CheckedReadonlyMap<K, V> extends ReadonlyMap<K, V> {
  checkedGet(key: K): V;
}

export class CheckedReadonlyMapImpl<K, V> extends Map<K, V> implements CheckedReadonlyMap<K, V> {
  checkedGet(key: K): V {
    const value = this.get(key);
    assertIsDefined(value, () => `Key "${String(key)}" is not found`);
    return value;
  }
}
