export type StringCallback = () => string;

class AssertionError implements Error {
  message: string;
  name: string;

  constructor(message?: string | StringCallback, defaultMessage: string = 'AssertionError') {
    this.name = 'AssertionError';
    let messageWithDefault;
    if (message) {
      messageWithDefault = typeof message === 'function' ? message() : message;
    } else {
      messageWithDefault = defaultMessage;
    }
    this.message = messageWithDefault;
  }
}

export function assert(condition: boolean, message?: string | StringCallback): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function assertIsDefined<T>(value: T, message?: string | StringCallback): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new AssertionError(message, `Expected 'value' to be defined, but received ${value}`);
  }
}
