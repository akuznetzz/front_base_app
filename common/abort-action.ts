import type {StringCallback} from './assertions';

export const AbortActionName = 'AbortAction';

export class AbortAction implements Error {
  message: string;
  name: string;

  constructor(message?: string | StringCallback, defaultMessage: string = AbortActionName) {
    this.name = AbortActionName;
    this.message = message ? (typeof message === 'function' ? message() : message) : defaultMessage;
  }
}
