import {Filters} from '~/common/filters';

export type FiltersMap = Map<string, Filters>;

export interface FiltersObject {
  [filterArrayName: string]: Filters;
}
