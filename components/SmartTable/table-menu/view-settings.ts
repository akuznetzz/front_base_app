import {Aggregations} from '~/common/aggregations';
import {SortDirection} from '~/common/sorts';

export interface ColumnViewSettingsDialogProps {
  field: string;
  model?: string;
  title: string;
  shown: boolean;
}

export type ColumnViewSettingsDialogPropsSet = ColumnViewSettingsDialogProps[];

export interface ColumnViewProps {
  field: string;
  title?: string;
  width?: number;
}

export type ColumnViewPropsSet = ColumnViewProps[];

export interface ColumnFilterProps {
  field: string;
  value: string;
}

export type ColumnFilterPropsSet = ColumnFilterProps[];

export interface ColumnSortProps {
  field: string;
  order?: SortDirection;
}

export type ColumnSortPropsSet = ColumnSortProps[];

export const TABLE_VIEW_PROPS_CURRENT_VERSION = 1;

export interface TableViewProps {
  version?: number;
  columns?: ColumnViewPropsSet;
  sorts?: ColumnSortPropsSet;
  filters?: ColumnFilterPropsSet;
  aggregations?: Aggregations;
}
