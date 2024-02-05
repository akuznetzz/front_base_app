import {IEntitySpec} from '~/framework/dbd/dbd-spec';
import {Filters} from '~/common/filters';
import {sendEvent} from '~/framework/core/enhanced-delegation';
import {appEventList} from '~/framework/core/app-event-list';

export const collectSelectRelatedTableFiltersEventId = Symbol('collectSelectRelatedTableFiltersEventId');

export interface CollectSelectRelatedTableFiltersParameters {
  destTableSpec: IEntitySpec; // in
  filterFieldName: string; // in
  extraParams: any | undefined; // in
  filterList: Filters; // out
}

export async function sendCollectSelectRelatedTableFilters(
  destTableSpec: IEntitySpec,
  filterFieldName: string,
  extraParams?: any,
): Promise<Filters> {
  const collectSelectRelatedTableFiltersParameters: CollectSelectRelatedTableFiltersParameters = {
    destTableSpec,
    filterFieldName,
    extraParams,
    filterList: [],
  };
  await sendEvent(appEventList, collectSelectRelatedTableFiltersEventId, collectSelectRelatedTableFiltersParameters);
  return collectSelectRelatedTableFiltersParameters.filterList;
}
