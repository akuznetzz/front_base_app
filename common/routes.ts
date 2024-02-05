import {type CheckedReadonlyMap, CheckedReadonlyMapImpl} from '~/common/CheckedReadonlyMap';
import {assert} from '~/common/assertions';

export interface RouteItem {
  readonly path: string;
  readonly title: string;
  readonly group?: boolean;
  readonly parent?: string;
}

export const RHCAB_CASES_ROUTE_NAME = 'rh-cabinet-cases';

const START_ROUTE_ITEMS = [
  {name: 'index', body: {path: '/', title: 'Главная страница'}},
  {name: 'login', body: {path: '/login', title: 'Вход'}},
] as const;

const COMMON_ROUTE_NAMES = [
    'login',
    'users',
    'test-group',
    'test-item-1',
] as const;


const ROUTE_NAMES = [
  ...START_ROUTE_ITEMS.map((item: any) => item.name),
  ...COMMON_ROUTE_NAMES,
] as const;

type RouteNamesTuple = typeof ROUTE_NAMES;
type RouteNames = RouteNamesTuple[number];

export function ROUTES(): CheckedReadonlyMap<RouteNames, RouteItem> {
  return new CheckedReadonlyMapImpl([
    ['users', {path: '/users', title: 'Пользователи', group: false}],
    ['test-group', {path: '/test-group', title: 'Тестовая группа', group: true}],
    ['test-item-1', {path: '/test-item-1', title: 'Тестовый пункт 1', parent: 'test-group'}],
    ['test-item-2', {path: '/test-item-2', title: 'Тестовый пункт 2', parent: 'test-group'}],
  ]);
}

export function isRouteName(value: string): boolean {
  // @ts-ignore string and route names are incompatible
  return ROUTE_NAMES.includes(value);
}
