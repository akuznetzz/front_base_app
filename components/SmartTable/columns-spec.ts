import {Style} from 'cheetah-grid/columns/style';
import {Action} from 'cheetah-grid/columns/action/Action';
import {Filters} from '~/common/filters';
import {FieldValue, Model, RelatedModels} from '~/components/SmartTable/DRestResponse';
import {assert} from '~/common/assertions';
import {CheckedReadonlyMap} from '~/common/CheckedReadonlyMap';
import {Row} from '~/components/SmartTable/CGridDataSourceCache';
import {AggregationType} from '~/common/aggregations';

export const COLUMN_AUTO_WIDTH = 'auto';
export const DEFAULT_COLUMN_WIDTH = COLUMN_AUTO_WIDTH;

export type ColumnType = string;
export type AutoWidthType = typeof COLUMN_AUTO_WIDTH;
export type ValueFunction = (model: Model, relatedModels: RelatedModels) => unknown;
export type FilterFunction = (field: string, value: string) => Filters | undefined;
export type ActionFunction = (primaryKeyValue: any, cellValue: any) => void;

export interface SimpleColumn {
  field: string;
}

export type SimpleColumns = SimpleColumn[];

export interface SettingsColumn extends SimpleColumn {
  type?: ColumnType;
  title?: string;
  nullable?: boolean;
  width?: number | AutoWidthType;
  value?: ValueFunction;
  filter?: FilterFunction;
  action?: ActionFunction;
  readOnlyColumn?: boolean;
  extra?: any;
  kind?: string;
  notIncluding?: boolean;
}

export type SettingsColumns = SettingsColumn[];

/**
 * returns value of main or related model
 * @param model main model
 * @param relatedModels related models dict
 * @param fullFieldName field name to return, specified as `<main model field name>[.<related model name>.<related model field name>]`
 */
export function try_get_value(model: Model, relatedModels: RelatedModels, fullFieldName: string): unknown | undefined {
  const nameItems = fullFieldName.split('.');
  let value = model[nameItems[0]];
  if (nameItems.length > 1) {
    assert((nameItems.length - 1) % 2 === 0);
    for (let i = 1; i < nameItems.length - 1; i += 2) {
      const relatedModelsById: CheckedReadonlyMap<FieldValue, Model> = relatedModels.checkedGet(nameItems[i]);
      const relatedModel: Model = relatedModelsById.checkedGet(value);
      value = relatedModel[nameItems[i + 1]];
    }
  }
  return value;
}

export interface TableColumn {
  field: string;
  type: ColumnType;
  title: string;
  width: number | AutoWidthType;
  nullable: boolean;
  value?: ValueFunction;
  filter?: FilterFunction;
  readOnlyColumn?: boolean;
  gridColumnStyle: Style;
  gridColumnType: string;
  gridColumnAction?: Action<Row>;
  aggregation?: AggregationType;
  extra?: any;
}

export type TableColumns = TableColumn[];
export type TableIncludes = string[];
