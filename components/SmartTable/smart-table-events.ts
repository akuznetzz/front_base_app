import {IWorkspaceManager} from '~/framework/workspace-manager/workspace-manager-spec';
import {Preset} from '~/framework/presets';

export const smartTableCollectPresetsEventId = Symbol('smartTableCollectPresetsEventId');

export interface SmartTableCollectPresetsEventParameters {
  tableName: string; // in
  contextId?: string; // in
  primaryKeyValue?: number; // in
  presets: Array<Preset>; // out
}

export const smartTableEditRecordEventId = Symbol('smartTableEditRecordEventId');

export interface SmartTableEditRecordEventParameters {
  tableName: string; // in
  contextId?: string; // in
  fieldName?: string; // in
  primaryKeyValue?: number; // in
  props?: Object; // in
  workspaceManager?: IWorkspaceManager; // in
  contextTitle?: string; // in
  result: any; // out
}

export const smartTableDeleteRecordsEventId = Symbol('smartTableDeleteRecordsEventId');

export interface SmartTableDeleteRecordsEventParameters {
  tableName: string; // in
  contextId?: string; // in
  deleteRecordsPKeys?: Array<number>; // in
  result: any; // out
}

export const getSmartTableMouseEnterCellId = Symbol('getSmartTableMouseEnterCellId');

export const getSmartTableMouseLeaveCellId = Symbol('getSmartTableMouseLeaveCellId');

export interface getSmartTableMouseParameters {
  row: number;
  col: number;
}
