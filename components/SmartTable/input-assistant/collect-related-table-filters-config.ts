import {EDEvent, installEventHandler} from '~/framework/core/enhanced-delegation';
import {appEventList} from '~/framework/core/app-event-list';
import {
  collectSelectRelatedTableFiltersEventId,
  CollectSelectRelatedTableFiltersParameters,
} from '~/components/SmartTable/input-assistant/collect-related-table-filters-helper';
import {buildSimpleFilter, Condition} from '~/common/filters';
import {fieldValueFromBoolean} from '~/common/FieldValue';

function defaultCollectRelatedTableFilters(event: EDEvent) {
  const params = event.parameters as CollectSelectRelatedTableFiltersParameters;
  if (
    params.filterFieldName === 'plaintiff_representative' ||
    params.filterFieldName.endsWith('.plaintiff_representative')
  ) {
    params.filterList.push(buildSimpleFilter('inactive', Condition.Equals, fieldValueFromBoolean(false)));
  }
}

export function setupCollectRelatedTableFiltersHandlers() {
  installEventHandler(appEventList, collectSelectRelatedTableFiltersEventId, defaultCollectRelatedTableFilters);
}
