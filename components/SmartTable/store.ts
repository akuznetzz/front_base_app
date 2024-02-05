import Vue from 'vue';
import Vuex from 'vuex';
import common from './common';
import {getEntityPrimaryKey} from '~/common/settings';
import {
  CGridDataSourceCache,
  dataNeedsToReloaded,
  PerformRequestCallback,
  Row,
  ROWS_SELECTION_FIELD,
} from '~/components/SmartTable/CGridDataSourceCache';
import cheetahGrid from 'cheetah-grid';
import stringify from 'csv-stringify/lib/sync';
import {ListGridAPI} from 'cheetah-grid/ts-types/grid-engine';
import {CellRange} from 'cheetah-grid/ts-types/grid';
import {DataSourceParam} from 'cheetah-grid/data/DataSource';
import {getFieldSpec} from '~/common/domain-model';
import {Action} from 'cheetah-grid/columns/action/Action';
import {assertIsDefined} from '~/common/assertions';
import {error, warn, success} from '~/framework/messages';
import {IWorkspaceContext} from '~/framework/workspace-manager/workspace-manager-spec';
import {buildRawFilter, Filters} from '~/common/filters';
import {tryParseFilterValue} from '~/components/SmartTable/try-parse-filter-value';
import {
  performDRestAggregationRequest,
  buildDRestRequestWithEntitySpecQueryPart,
  performDRestSelect,
} from '~/common/drest-request';
import {SortDirection, Sorts} from '~/common/sorts';
import {
  ActionFunction,
  ColumnType,
  DEFAULT_COLUMN_WIDTH,
  SettingsColumn,
  SettingsColumns,
  SimpleColumns,
  TableColumn,
  TableColumns,
} from '~/components/SmartTable/columns-spec';
import {
  ColumnFilterPropsSet,
  ColumnSortPropsSet,
  ColumnViewProps,
  ColumnViewPropsSet,
  ColumnViewSettingsDialogPropsSet,
  TABLE_VIEW_PROPS_CURRENT_VERSION,
  TableViewProps,
} from '~/components/SmartTable/table-menu/view-settings';
import {FieldSpec, IDomainModel, IEntitySpec} from '~/framework/dbd/dbd-spec';
import {capitalizeFirstChar} from '~/framework/utils/capitalize-first-char';
import {
  Aggregation,
  Aggregations,
  AggregationsData,
  AggregationType,
  AggregationTypeNames,
  ALLOWED_FIELD_TYPES,
} from '~/common/aggregations';
import {ability} from '~/common/ability';
import {CachedDataSource} from 'cheetah-grid/data/CachedDataSource';
import {
  getIncludesExcludes,
  getViewAvailableFields,
  getViewIncludes,
  urlFieldReferenceHelper,
} from '~/components/SmartTable/smart-table-helper';
import {DREST_TO_XLSX_URL, DREST_TO_XLSX_QUERY_PARAM, DREST_TO_XLSX_COLUMNS_PARAM} from '~/common/constants';
import {httpPost} from '~/framework/httpRequest';
import {tryGetDefaultTableViewDescr} from '~/components/SmartTable/default-table-view';
import {getParentFieldName, isValueIsList} from '~/components/SmartTable/input-assistant/utils';
import {installEventHandler} from '~/framework/core/enhanced-delegation';
import {IncludesExcludes} from '~/common/includes';
import {fieldValueFromString} from '~/common/FieldValue';

Vue.use(Vuex);

type ColumnFilters = Map<string, string>;

export function getLocalStoragePathForTableSettings(apiModel: string, contextId?: string) {
  // @ts-ignore $nuxt
  const workspacePath: IWorkspaceContext[] = $nuxt.$workspaceManager.getPathContexts($nuxt.$router.currentRoute.path);
  const apiModelsPath =
    workspacePath && workspacePath.length > 0 ? workspacePath.map((item) => item.dynamicComponent.props.apiModel) : [];
  apiModelsPath.push(apiModel);
  if (contextId) {
    apiModelsPath.push(contextId);
  }
  const path = apiModelsPath.join('/');

  // @ts-ignore $nuxt
  return [$nuxt.$auth.user.email + $nuxt.$router.currentRoute.path, path].join('/');
}

function saveColumnsToLocalStorage(
  apiModel: string,
  columns: ReadonlyArray<TableColumn>,
  shownColumnNames: ReadonlyArray<string>,
  contextId?: string,
) {
  const columnsToSave = [];
  for (const shownColumnName of shownColumnNames) {
    const column = columns.find((column) => column.field === shownColumnName);
    assertIsDefined(column);
    const columnToSave: ColumnViewProps = {field: column.field};
    if (column.width !== DEFAULT_COLUMN_WIDTH) {
      columnToSave.width = column.width as number;
    }
    columnsToSave.push(columnToSave);
  }
  const tableSettings = loadTableSettings(apiModel, contextId);
  if (columnsToSave.length > 0) {
    tableSettings.columns = columnsToSave;
  } else {
    delete tableSettings.columns;
  }
  saveTableSettings(apiModel, tableSettings, contextId);
}

async function setColumnProperties(
  domainModel: IDomainModel,
  apiModel: string,
  onPrimaryKeyClick: PrimaryKeyClickFunction | null,
  defaultPrimaryKeyClick: DefaultPrimaryKeyClickFunction,
  openFormAllowed: Boolean,
  savedColumns: ColumnViewPropsSet | undefined,
  column: SettingsColumn,
): Promise<TableColumn> {
  function isPrimaryKeyField() {
    return column.field === getEntityPrimaryKey(apiModel);
  }

  function getEntityOpenFormAllowedFlag(entitySpec: IEntitySpec): Boolean {
    return entitySpec.canEdit && openFormAllowed;
  }

  function isEntityBlockEdit(entitySpec: IEntitySpec): Boolean {
    return getEntityOpenFormAllowedFlag(entitySpec) && (entitySpec as any).canBlockEdit;
  }

  function columHasAction(columnDef: SettingsColumn): boolean {
    return !!columnDef.action || !!columnDef.extra?.onCellReferenceMark;
  }

  function getDefaultColumnStyle(column: TableColumn, entitySpec: IEntitySpec, hasAction: boolean) {
    const style: any = {};
    if (
      column.type &&
      ['integer', 'datetime', 'datetime without tz', 'date', 'one', 'many', 'decimal', 'float'].includes(column.type)
    ) {
      style.textAlign = 'right';
    }
    if (hasAction || (isPrimaryKeyField() && (onPrimaryKeyClick || getEntityOpenFormAllowedFlag(entitySpec)))) {
      style.color = 'blue';
    }
    if (column.type === 'image') {
      style.imageSizing = 'keep-aspect-ratio';
    }
    style.textOverflow = 'ellipsis';
    style.padding = [0, 5, 0, 5]; // top, right, bottom, left
    return column.extra && column.extra.style ? Object.assign(column.extra.style, style) : style;
  }

  function getGridColumnType(type: ColumnType) {
    let gridColumnType = type;
    if (type === 'boolean') {
      gridColumnType = 'check';
    } else if (['integer', 'decimal', 'float'].includes(type)) {
      const minimumFractionDigits = type === 'integer' ? 0 : 2;
      return new cheetahGrid.columns.type.NumberColumn({
        format: new Intl.NumberFormat(undefined, {minimumFractionDigits}),
      });
    }
    return gridColumnType;
  }

  function getGridColumnAction(
    column: TableColumn,
    entitySpec: IEntitySpec,
    defaultAction: ActionFunction | undefined,
  ): Action<Row> | undefined {
    const primaryKeyFieldName = getEntityPrimaryKey(apiModel);
    if (defaultAction) {
      return new cheetahGrid.columns.action.Action<Row>({
        action: (record: Row) => defaultAction(record[primaryKeyFieldName], record[column.field]),
      });
    }

    let action;
    if (column.field === primaryKeyFieldName && (onPrimaryKeyClick || (entitySpec.canEdit && openFormAllowed))) {
      action = onPrimaryKeyClick
        ? (record: Row) => onPrimaryKeyClick({row: record})
        : (record: Row) => defaultPrimaryKeyClick(Number(record[primaryKeyFieldName]));
    }
    return action ? new cheetahGrid.columns.action.Action<Row>({action}) : undefined;
  }

  function getSavedWidth(savedColumns: ColumnViewPropsSet | undefined, field: string) {
    if (savedColumns) {
      const savedColumn = savedColumns.find((savedColumn) => savedColumn.field === field);
      if (savedColumn) {
        return savedColumn.width;
      }
    }
  }

  function isColumnReadOnly(
    entitySpec: IEntitySpec,
    fieldSpec: FieldSpec,
    columnDef: SettingsColumn,
    gridColumnDef: TableColumn,
  ): boolean {
    // колонка Grid'а будет readOnly - без блочного редактирования, если:
    return (
      columnDef.readOnlyColumn || // readOnlyColumn явно задано в описании колонки
      fieldSpec.read_only || // поле сущности read_only
      !!columnDef.value || // колонка вычислимая
      !!gridColumnDef.gridColumnAction || // у колонки грида задан Action
      columHasAction(gridColumnDef) || // в описании колонки указано действие для колонки
      !isEntityBlockEdit(entitySpec) || // для сущности запрещено редактирование
      isPrimaryKeyField()
    ); // поле сущности - первичный ключ
  }

  const entitySpec = await domainModel.getEntitySpec(apiModel);
  const fieldSpec = await getFieldSpec(domainModel, apiModel, column.field);
  const result: any = {};
  result.field = column.field;
  result.value = column.value;
  result.nullable = column.nullable ?? fieldSpec.nullable;

  result.filter = column.filter
    ? column.filter
    : column.type === 'boolean' &&
      ['string', 'url', 'email', 'file upload', 'image upload', 'file direct upload'].includes(fieldSpec.type)
    ? (field: string, value: string) => {
        if (!value) {
          return [];
        }
        return [
          buildRawFilter(
            `empty-or-not-string-search__${field}`,
            fieldValueFromString(JSON.stringify({field, is_empty: value === 'false'})),
          ),
        ];
      }
    : undefined;

  result.title = column.title ?? capitalizeFirstChar(fieldSpec.label);
  result.type = column.type ?? fieldSpec.type;
  if (result.type === 'url' && !column.extra?.onCellReferenceMark) {
    result.extra = Object.assign({}, column.extra || {}, {onCellReferenceMark: urlFieldReferenceHelper(result.field)});
  } else {
    result.extra = column.extra;
  }
  result.width = getSavedWidth(savedColumns, result.field) ?? column.width ?? DEFAULT_COLUMN_WIDTH;

  result.gridColumnStyle = getDefaultColumnStyle(result, entitySpec, columHasAction(result));
  result.gridColumnType = getGridColumnType(result.type);
  result.gridColumnAction = getGridColumnAction(result, entitySpec, column.action);
  result.readOnlyColumn = isColumnReadOnly(entitySpec, fieldSpec, column, result);

  return result;
}

type PrimaryKeyClickFunction = (payload: any) => void;
type DefaultPrimaryKeyClickFunction = (primaryKeyValue: number) => void;

async function findFieldType(field: string, entitySpec: IEntitySpec, domainModel: IDomainModel): Promise<string> {
  if (field.includes('.')) {
    const fieldSpec = entitySpec.getFieldSpec(field.split('.')[0]);
    const newEntitySpec = await domainModel.getEntitySpec(fieldSpec.related_to!);
    return findFieldType(field.substring(field.indexOf('.') + 1), newEntitySpec, domainModel);
  } else {
    return entitySpec.getFieldSpec(field).type;
  }
}

async function aggregationIsValid(field: string, entitySpec: IEntitySpec, domainModel: IDomainModel) {
  const fieldType = await findFieldType(field, entitySpec, domainModel);
  if (!ALLOWED_FIELD_TYPES.includes(fieldType)) {
    warn(`Поле ${field} имеет тип ${fieldType}, который не поддерживает агрегацию.`);
    return false;
  }
  return true;
}

async function initAggregations(
  allColumns: TableColumns,
  entitySpec: IEntitySpec,
  domainModel: IDomainModel,
): Promise<Aggregations> {
  let result: Aggregations = [];
  for (const column of allColumns) {
    if (
      !!column.aggregation &&
      (await aggregationIsValid(column.field, entitySpec, domainModel)) &&
      result.findIndex((agg) => agg.field === column.field) === -1
    ) {
      const aggregation: Aggregation = {
        field: column.field,
        kind: column.aggregation,
      };
      result.push(aggregation);
    }
  }
  return result;
}

function getMissingAggregations(
  aggregations: Aggregations,
  aggregationsData: AggregationsData,
  shownColumnNames: string[],
): Aggregations {
  let result: Aggregations = [];
  for (const aggregation of aggregations) {
    if (shownColumnNames.includes(aggregation.field) && !aggregationsData.has(aggregation.field)) {
      result.push(aggregation);
    }
  }
  return result;
}

async function requestAggregationsData(
  aggregations: Aggregations,
  filters: any[],
  domainModel: IDomainModel,
  apiModel: string,
): Promise<AggregationsData> {
  const result = new Map();
  const response = await performDRestAggregationRequest(domainModel, apiModel, {aggregations, filters});
  for (const [aggField, value] of Object.entries(response)) {
    result.set(aggField.substring(0, aggField.lastIndexOf('__')), value);
  }
  return result;
}

function saveAggregationsToLocalStorage(apiModel: string, aggregations: Aggregations, contextId?: string) {
  let savedTableSettings = loadTableSettings(apiModel, contextId);
  if (aggregations.length > 0) {
    savedTableSettings.aggregations = aggregations;
  } else {
    delete savedTableSettings.aggregations;
  }
  saveTableSettings(apiModel, savedTableSettings, contextId);
}

async function tuneColumns(
  allColumns: SettingsColumns,
  domainModel: IDomainModel,
  apiModel: string,
  onPrimaryKeyClick: PrimaryKeyClickFunction | null,
  defaultPrimaryKeyClick: DefaultPrimaryKeyClickFunction,
  openFormAllowed: Boolean,
  savedColumns: ColumnViewPropsSet | undefined,
): Promise<TableColumns> {
  return Promise.all(
    allColumns.map((column) =>
      setColumnProperties(
        domainModel,
        apiModel,
        onPrimaryKeyClick,
        defaultPrimaryKeyClick,
        openFormAllowed,
        savedColumns,
        column,
      ),
    ),
  );
}

async function getShownColumnNames(
  domainModel: IDomainModel,
  apiModel: string,
  shownColumnNames: string[],
  savedColumns: ColumnViewPropsSet | undefined,
  allColumns: TableColumns,
) {
  if (savedColumns && savedColumns.length > 0) {
    return savedColumns.map((savedColumn) => savedColumn.field);
  }
  if (shownColumnNames.length > 0) {
    return shownColumnNames.filter((value) => allColumns.find((column) => column.field === value));
  }
  return allColumns.filter((column) => column.type !== 'url' && column.type !== 'one').map((column) => column.field);
}

function areColumnsValid(validateColumnsSet: any = [], allColumns: SettingsColumns): boolean {
  for (const validateColumn of validateColumnsSet) {
    if (!allColumns.find((column) => column.field === validateColumn.field)) {
      return false;
    }
  }
  return true;
}

const INVALID_COLUMNS_MESSAGE = `
Ранее сохранённое представление не может быть применено, поэтому восстановлено представление по-умолчанию.<br/>
В случае необходимости, выполните настройку представления заново.
`;

function validateTableViewProps(viewProps: TableViewProps = {}, allTableColumns: SimpleColumns) {
  let changeColumnsSet = false;
  if (viewProps.columns) {
    const viewColumns = viewProps.columns.filter((tstColumn) =>
      allTableColumns.some((allColumn) => allColumn.field === tstColumn.field),
    );
    if (viewColumns.length < viewProps.columns.length) {
      changeColumnsSet = true;
      viewProps.columns = viewColumns;
    }
  }
  if (viewProps.sorts) {
    const sortColumns = viewProps.sorts.filter((tstColumn) =>
      allTableColumns.some((allColumn) => allColumn.field === tstColumn.field),
    );
    if (sortColumns.length < viewProps.sorts.length) {
      changeColumnsSet = true;
      viewProps.sorts = sortColumns;
    }
  }
  if (viewProps.filters) {
    const filterColumns = viewProps.filters.filter((tstColumn) =>
      allTableColumns.some((allColumn) => allColumn.field === tstColumn.field),
    );
    if (filterColumns.length < viewProps.filters.length) {
      changeColumnsSet = true;
      viewProps.filters = filterColumns;
    }
  }
  // if (changeColumnsSet) {
  //   warn(`${window.$nuxt.$t('common.columnMissing')}`);
  // }

  if (
    areColumnsValid(viewProps.columns, allTableColumns) &&
    areColumnsValid(viewProps.sorts, allTableColumns) &&
    areColumnsValid(viewProps.filters, allTableColumns)
  ) {
    return true;
  }
  warn(INVALID_COLUMNS_MESSAGE);
}

function setPrimaryKeyFieldFirst(columnNames: string[], pkFieldName: string) {
  for (let i = 0; i < columnNames.length; i++) {
    const columnName = columnNames[i];
    if (columnName === pkFieldName) {
      if (i > 0) {
        columnNames.splice(i, 1);
        columnNames.unshift(columnName);
      }
      break;
    }
  }
}

export function loadTableSettings(apiModel: string, contextId?: string): TableViewProps {
  const tableSettingsJsonString = localStorage.getItem(getLocalStoragePathForTableSettings(apiModel, contextId));
  if (!tableSettingsJsonString) {
    return {};
  }
  const tableSettingsJson = JSON.parse(tableSettingsJsonString);
  if (Array.isArray(tableSettingsJson)) {
    // backward compatibility
    return {columns: tableSettingsJson};
  }
  return tableSettingsJson;
}

function saveTableSettings(apiModel: string, tableSettings: TableViewProps, contextId?: string) {
  tableSettings.version = TABLE_VIEW_PROPS_CURRENT_VERSION;
  const localStoragePathForTableSettings = getLocalStoragePathForTableSettings(apiModel, contextId);
  if (tableSettings.filters || tableSettings.columns || tableSettings.sorts) {
    localStorage.setItem(localStoragePathForTableSettings, JSON.stringify(tableSettings));
  } else {
    localStorage.removeItem(localStoragePathForTableSettings);
  }
}

function saveFiltersToLocalStorage(apiModel: string, columnFilters: ColumnFilters, contextId?: string) {
  let savedTableSettings = loadTableSettings(apiModel, contextId);
  const filtersToStore = Array.from(columnFilters.entries()).map(([field, value]) => ({field, value}));
  if (filtersToStore.length > 0) {
    savedTableSettings.filters = filtersToStore;
  } else {
    delete savedTableSettings.filters;
  }
  saveTableSettings(apiModel, savedTableSettings, contextId);
}

async function columnFiltersToFilters(
  domainModel: IDomainModel,
  modelName: string,
  allColumns: TableColumns,
  columnFilters: ColumnFilters,
): Promise<Filters> {
  const filters = [];
  for (const [field, value] of columnFilters.entries()) {
    const column = allColumns.find((column) => column.field === field);
    if (column && column.filter) {
      const customFilters = column.filter(field, value);
      assertIsDefined(customFilters);
      filters.push(...customFilters);
    } else {
      let fieldName = field;
      // correct field name if value is list, ex. before "status.name" after "status"
      if (isValueIsList(value) && !['choice', 'date', 'datetime', 'datetime without tz'].includes(column.type)) {
        fieldName = getParentFieldName(fieldName);
      }
      const filter = tryParseFilterValue(
        fieldName,
        (await getFieldSpec(domainModel, modelName, fieldName)).type,
        value,
        (await getFieldSpec(domainModel, modelName, fieldName)).nullable!,
      );
      if (filter && Array.isArray(filter)) {
        filter.forEach((f) => {
          filters.push(f);
        });
      } else if (filter) {
        filters.push(filter);
      }
    }
  }
  return filters;
}

function savedFiltersToServerParamFilters(filters: ColumnFilterPropsSet) {
  return new Map(filters.map((filter) => [filter.field, filter.value]));
}

function externalFiltersToFilters(externalFilters: Map<string, Filters>): Filters {
  return Array.from(externalFilters.values()).flat();
}

function sortColumnsToSorts(sortColumns: any[] = [], primaryKeyName = 'id'): Sorts {
  let sortId = false;
  const resultSorts = sortColumns.map((item) => {
    sortId = sortId || item.field === primaryKeyName;
    return {field: item.field, direction: item.order};
  });
  if (!sortId) {
    resultSorts.push({field: primaryKeyName, direction: SortDirection.Descending});
  }
  return resultSorts;
}

function getGridFont(grid: any) {
  const propertySymbols = Object.getOwnPropertySymbols(grid);
  let fontStr;
  propertySymbols.forEach((propertySymbol) => {
    if (String(propertySymbol) === 'Symbol(protected)' && grid[propertySymbol].context) {
      fontStr = grid[propertySymbol].context.font;
    }
  });
  return fontStr;
}

function textWidthHelper(grid: any) {
  const fontStr = getGridFont(grid);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context!.font = fontStr ? fontStr : '16px sans-serif';

  function textWidth(text: string) {
    return Math.ceil(context!.measureText(text).width);
  }

  return textWidth;
}

export default (globalStore: any) => {
  return new Vuex.Store({
    state: {
      loading: false,
      pending: false,
      interval: 0,
      apiUrl: '',
      apiModel: '',
      contextId: undefined,
      entitySpec: undefined,
      tableName: '',
      shownColumnNames: [],
      allColumns: [],
      rows: [],
      includes: [],
      extraParams: Object,
      selectedRows: new Set(),
      batchRowsSelect: false,
      externalFilters: new Map(),
      // столбцы для сортировка
      sortColumns: [],
      requestLock: {
        count: 0,
        requestNeed: false,
      },
      options: null,
      data: null,
      totalPages: 0,
      totalResults: 0,
      serverParams: {
        columnFilters: new Map<string, string>(),
        sort: [
          {
            field: '',
            type: '',
          },
        ],
        page: 1,
        perPage: 25,
        filterPage: 1,
      },
      dataSource: undefined,
      dataSourceParam: {length: 0},
      isDataSourceReady: false,
      selectedColumnNumber: undefined,
      selectedRowNumber: -1,
      showFilter: false,
      filterLeft: 0,
      filterTop: 0,
      showClipboardCopyingProgress: false,
      clipboardCopyingProgress: 0,
      cancelClipboardCopying: false,
      onPrimaryKeyClick: null,
      rowsSelection: false,
      aggregations: [],
      aggregationsData: new Map(),
      showAggregations: false,
      showAggSelect: false,
      aggSelectLeft: 0,
      aggSelectTop: 0,
    },
    mutations: {
      setPending(state, value: boolean) {
        state.pending = value;
      },

      setBatchRowsSelect(state, value: boolean) {
        state.batchRowsSelect = value;
      },

      clearSelection(state: any) {
        state.selectedRows = new Set();
        state.dataSourceParam.selectedRows = state.selectedRows;
      },

      setRowsSelection(state: any, newSelection: Set<number>) {
        state.selectedRows = newSelection;
        state.dataSourceParam.selectedRows = newSelection;
      },

      addRowToSelection(state: any, primaryKeyValue: number) {
        const newSelectedRows = new Set(state.selectedRows?.values());
        newSelectedRows.add(primaryKeyValue);
        state.selectedRows = newSelectedRows;
        state.dataSourceParam.selectedRows = state.selectedRows;
      },
      removeRowFromSelection(state: any, primaryKeyValue: number) {
        const newSelectedRows = new Set(state.selectedRows?.values());
        newSelectedRows.delete(primaryKeyValue);
        state.selectedRows = newSelectedRows;
        state.dataSourceParam.selectedRows = state.selectedRows;
      },

      setStateProp(state: any, prop: any) {
        state[prop.name] = prop.value;
      },

      setServerParamsProp(state: any, prop) {
        state.serverParams[prop.name] = prop.value;
      },
      setFilterTop(state, payload) {
        state.filterTop = payload;
      },
      setAggSelectTop(state, payload) {
        state.aggSelectTop = payload;
      },
      setSelectedCell(state, payload) {
        if (payload.event.selected) {
          state.selectedColumnNumber = payload.event.col;
          state.selectedRowNumber = payload.event.row;
          state.filterLeft = payload.grid.rawGrid.getCellRelativeRect(payload.event.col, 1).left;
          state.aggSelectLeft = payload.grid.rawGrid.getCellRelativeRect(payload.event.col, 2).left;
          if (!(state.rowsSelection && state.selectedColumnNumber === 0)) {
            if (payload.event.row === 1 && state.serverParams.columnFilters.size > 0) {
              state.showFilter = true;
            }
            const aggregationRow = state.showFilter || state.serverParams.columnFilters.size > 0 ? 2 : 1;
            state.showAggSelect = payload.event.row == aggregationRow && state.showAggregations;
          }
        }
      },
      toggleFilter(state) {
        if (state.rowsSelection && state.selectedColumnNumber === 0) {
          return;
        }
        state.showFilter = !state.showFilter;
      },
      hideFilter(state) {
        state.showFilter = false;
      },
      clearFilterValues(state) {
        state.serverParams.columnFilters.clear();
        saveFiltersToLocalStorage(state.apiModel, state.serverParams.columnFilters, state.contextId);
      },
      cancelClipboardCopying(state) {
        state.cancelClipboardCopying = true;
      },
      toggleAggregations(state) {
        state.showAggregations = !state.showAggregations;
      },
      hideAggSelect(state) {
        state.showAggSelect = false;
      },
      removeAggregation(state, payload) {
        const index = state.aggregations.findIndex((agg: any) => agg.field === payload);
        if (index !== -1) {
          state.aggregations.splice(index, 1);
          state.aggregationsData.delete(payload.replace('.', '__'));
        }
      },
      addAggregation(state, payload) {
        (state.aggregations as Aggregations).push(payload);
      },
      clearAggregationData(state) {
        state.aggregationsData.clear();
      },
    },
    actions: {
      async setColumnFilter({state, dispatch, commit}, {field, value, grid}) {
        if (value) {
          state.serverParams.columnFilters.set(field, value);
        } else {
          state.serverParams.columnFilters.delete(field);
        }
        commit('clearAggregationData');
        await dispatch('reloadData');
        if (grid.headerValues.set) {
          grid.headerValues.set(ROWS_SELECTION_FIELD, false);
        }
        saveFiltersToLocalStorage(state.apiModel, state.serverParams.columnFilters, state.contextId);
      },

      setColumnWidth({state, getters}, {col, width}) {
        if (col >= 0) {
          getters.getShownColumns[col].width = width;
          saveColumnsToLocalStorage(state.apiModel, state.allColumns, state.shownColumnNames, state.contextId);
        }
      },

      async recalcColumnsWidth({state, getters}, grid) {
        const RECALC_DATA_LENGTH = 50;
        const MIN_COLUMN_LENGTH = 3;
        const textWidth = textWidthHelper(grid);
        const dataSourceParam = state.dataSourceParam as DataSourceParam<Promise<Row>>;
        const columnsWidth: any = {};
        const maxWidth = textWidth('Щ'.repeat(35));
        let topRecordIndex = Math.max(0, grid.getRecordIndexByRow(grid.topRow));
        let recalcDataLength = Math.max(0, Math.min(RECALC_DATA_LENGTH, dataSourceParam.length - topRecordIndex));
        if (recalcDataLength < RECALC_DATA_LENGTH) {
          topRecordIndex = Math.max(0, topRecordIndex - (RECALC_DATA_LENGTH - recalcDataLength));
          recalcDataLength = Math.max(0, Math.min(RECALC_DATA_LENGTH, dataSourceParam.length - topRecordIndex));
        }

        for (let recordIndex = topRecordIndex; recordIndex < topRecordIndex + recalcDataLength; recordIndex++) {
          const record = await dataSourceParam.get(recordIndex);
          for (const key in record) {
            let columnWidth = Math.min(
              maxWidth,
              textWidth(record[key].length < MIN_COLUMN_LENGTH ? 'Щ'.repeat(MIN_COLUMN_LENGTH) : record[key]),
            );
            if (!columnsWidth[key] || columnsWidth[key] < columnWidth) {
              columnsWidth[key] = columnWidth;
            }
          }
        }

        const maxBooleanWidth = textWidth('false');
        const columns = getters.getShownColumns;
        columns.forEach((column: any) => {
          if (column.type === 'boolean') {
            columnsWidth[column.field] = maxBooleanWidth;
          }
        });

        return columnsWidth;
      },

      async changeColumns({state, commit}, columns: ColumnViewSettingsDialogPropsSet) {
        const shownColumnNames = [];
        for (const column of columns) {
          if (column.shown) {
            shownColumnNames.push(column.field);
          }
        }
        setPrimaryKeyFieldFirst(shownColumnNames, getEntityPrimaryKey(state.apiModel));

        await commit('setStateProp', {
          name: 'shownColumnNames',
          value: shownColumnNames,
        });
        await this.dispatch('loadData');
        saveColumnsToLocalStorage(state.apiModel, state.allColumns, state.shownColumnNames, state.contextId);
      },

      async setTableViewFilters({state, commit}, tableViewFilters: ColumnFilterPropsSet) {
        await commit('setServerParamsProp', {
          name: 'columnFilters',
          value: tableViewFilters ? savedFiltersToServerParamFilters(tableViewFilters) : new Map<string, string>(),
        });
      },

      async setTableViewColumns({state, commit}, tableViewColumns: ColumnViewPropsSet) {
        if (tableViewColumns) {
          const shownColumnNames = tableViewColumns.map((columnProps) => columnProps.field);
          setPrimaryKeyFieldFirst(shownColumnNames, getEntityPrimaryKey(state.apiModel));
          await commit('setStateProp', {name: 'shownColumnNames', value: shownColumnNames});
          tableViewColumns.forEach((viewColumnSettings) => {
            const gridColumn: any = state.allColumns.find(
              (gridColumn: any) => gridColumn.field === viewColumnSettings.field,
            );
            if (viewColumnSettings.width) {
              gridColumn.width = viewColumnSettings.width;
            } else if (gridColumn.width === DEFAULT_COLUMN_WIDTH) {
              gridColumn.width = 150;
              viewColumnSettings.width = gridColumn.width;
            } else {
              viewColumnSettings.width = gridColumn.width;
            }
          });
        }
      },

      async setTableViewSorts({state, commit, dispatch, getters}, payload) {
        function sortColumnsToSortState(columns: ColumnSortPropsSet) {
          if (!columns) {
            return [];
          }
          const sortState = [];
          const shownColumnNames = getters.getShownColumnNames;
          for (const column of columns) {
            const index = shownColumnNames.indexOf(column.field);
            if (index >= 0) {
              sortState.push({
                col: getters.getRowsSelection ? index + 1 : index,
                row: 0,
                order: column.order ? 'desc' : 'asc',
              });
            }
          }
          return sortState;
        }

        await commit('setStateProp', {name: 'sortColumns', value: payload.tableViewSorts});
        if (payload.grid) {
          payload.grid.rawGrid.sortState = sortColumnsToSortState(payload.tableViewSorts);
        }
      },

      async applyUserTableViewProps({state, commit, dispatch}, payload) {
        const tableSettings = loadTableSettings(state.apiModel, state.contextId);
        if (payload.viewProps.columns && payload.viewProps.columns.length > 0) {
          await dispatch('setTableViewColumns', payload.viewProps.columns);
          tableSettings.columns = payload.viewProps.columns;
        } else {
          delete tableSettings.columns;
        }
        if (payload.viewProps.sorts && payload.viewProps.sorts.length > 0) {
          tableSettings.sorts = payload.viewProps.sorts;
        } else {
          delete tableSettings.sorts;
        }
        if (tableSettings.filters && payload.viewProps.columns?.length > 0) {
          tableSettings.filters = tableSettings.filters.filter((ts) =>
            payload.viewProps.columns.some((vp) => ts.field === vp.field),
          );
        }
        saveTableSettings(state.apiModel, tableSettings, state.contextId);

        await dispatch('setTableViewSorts', {tableViewSorts: payload.viewProps.sorts, grid: payload.grid});
        await dispatch('setTableViewFilters', tableSettings.filters);
        await dispatch('loadData');
      },

      async applyTableViewSorts({state, commit, dispatch}, payload) {
        const tableSettings = loadTableSettings(state.apiModel, state.contextId);
        if (payload.tableViewSorts && payload.tableViewSorts.length > 0) {
          tableSettings.sorts = payload.tableViewSorts;
        } else {
          delete tableSettings.sorts;
        }
        saveTableSettings(state.apiModel, tableSettings, state.contextId);

        await dispatch('setTableViewSorts', payload);
        await dispatch('loadData');
      },

      async applyTableViewProps({state, commit, dispatch}, payload) {
        if (payload.settingsShownColumnNames && payload.settingsShownColumnNames.length > 0) {
          payload.viewProps.columns = payload.settingsShownColumnNames.map((columnName: string) => {
            return {field: columnName};
          });
        }
        if (!validateTableViewProps(payload.viewProps, state.allColumns)) {
          return;
        }
        await dispatch('setTableViewColumns', payload.viewProps.columns);
        saveTableSettings(state.apiModel, payload.viewProps, state.contextId);
        await dispatch('setTableViewFilters', payload.viewProps.filters);
        await dispatch('setTableViewSorts', {tableViewSorts: payload.viewProps.sorts, grid: payload.grid});
        await dispatch('loadData');
      },

      async copyToClipboard(
        {state, getters, commit},
        {copyFunction, grid}: {copyFunction: any; grid: ListGridAPI<any>},
      ) {
        function isCellRangeEmpty(range: CellRange) {
          return range.start.row === range.end.row && range.start.col === range.end.col;
        }

        function copyHeader(columns: TableColumns, startCol: number, endCol: number) {
          const header = [];
          for (let i = startCol; i <= endCol; i++) {
            header.push(columns[i].title);
          }
          return header;
        }

        async function copyRange(
          dataSourceParam: DataSourceParam<Promise<Row>>,
          columns: TableColumns,
          range: CellRange,
        ) {
          let rows = [copyHeader(columns, range.start.col, range.end.col)];
          for (let rowIndex = range.start.row; rowIndex <= range.end.row; rowIndex++) {
            const row = [];
            const recordIndex = grid.getRecordIndexByRow(rowIndex);
            if (recordIndex < 0) {
              continue; // skipping header because we already copied it
            }
            const record = await dataSourceParam.get(recordIndex);
            for (let colIndex = range.start.col; colIndex <= range.end.col; colIndex++) {
              row.push(record[columns[colIndex].field]);
            }
            rows.push(row);
            if (state.cancelClipboardCopying) {
              commit('setStateProp', {name: 'cancelClipboardCopying', value: false});
              break;
            }
            commit('setStateProp', {
              name: 'clipboardCopyingProgress',
              value: Math.floor((100 * (rowIndex - range.start.row)) / (range.end.row - range.start.row)),
            });
          }
          copyFunction(stringify(rows, {delimiter: '\t', quoted: true}));
        }

        commit('setStateProp', {name: 'clipboardCopyingProgress', value: 0});
        commit('setStateProp', {name: 'showClipboardCopyingProgress', value: true});
        try {
          const columns = getters.getShownColumns;
          const dataSourceParam = state.dataSourceParam as DataSourceParam<Promise<Row>>;
          let range = grid.selection.range;
          if (isCellRangeEmpty(grid.selection.range)) {
            // todo: add here some size constraints, otherwise we will use up all the memory
            let rowCount = dataSourceParam.length;
            if (getters.getShowFilterInHeader) {
              rowCount++;
            }
            range = {start: {col: 0, row: 0}, end: {col: columns.length - 1, row: rowCount}};
          } else if (state.rowsSelection) {
            range = {
              start: {col: range.start.col, row: range.start.row},
              end: {col: range.end.col, row: range.end.row},
            };
            if (range.end.col > 0) {
              range.end.col -= 1;
              if (range.start.col > 0) {
                range.start.col -= 1;
              }
            }
          }
          await copyRange(dataSourceParam, columns, range);
        } finally {
          commit('setStateProp', {name: 'showClipboardCopyingProgress', value: false});
        }
      },
      clearFilter({commit, dispatch}) {
        commit('clearFilterValues');
        commit('clearAggregationData');
        dispatch('loadData');
        commit('hideFilter');
      },

      // вместо конструктора
      async initTable({commit, state}, settings) {
        commit('setStateProp', {name: 'tableName', value: settings.tableName});
        let apiModelEntitySpec = await globalStore.$domainModel.getEntitySpec(settings.apiModel);
        commit('setStateProp', {name: 'entitySpec', value: apiModelEntitySpec});

        const allColumns = await getViewAvailableFields(
          globalStore.$domainModel,
          settings.apiModel,
          // @ts-ignore $nuxt
          $nuxt.$auth.user.email,
          settings.allColumns,
          settings.includes,
        );

        const viewIncludes = getViewIncludes(allColumns, settings.includes);

        let tableSettings = loadTableSettings(settings.apiModel, settings.contextId);
        if (!tableSettings || !tableSettings.columns) {
          if (settings.shownColumnNames && settings.shownColumnNames.length > 0) {
            tableSettings = {
              columns: settings.shownColumnNames.map((columnName: string) => {
                return {field: columnName};
              }),
            };
          } else {
            tableSettings = (await tryGetDefaultTableViewDescr(globalStore.$domainModel, settings.apiModel)) || {};
          }
          if (tableSettings && tableSettings.columns) {
            saveTableSettings(settings.apiModel, tableSettings, settings.contextId);
          }
        }
        if (!validateTableViewProps(tableSettings, allColumns)) {
          saveTableSettings(settings.apiModel, tableSettings, settings.contextId);
        }

        const savedColumns = tableSettings.columns || [];

        const tunedAllColumns = await tuneColumns(
          allColumns,
          globalStore.$domainModel,
          settings.apiModel,
          settings.onPrimaryKeyClick,
          settings.defaultPrimaryKeyClick,
          settings.openFormAllowed,
          savedColumns,
        );
        commit('setStateProp', {name: 'allColumns', value: tunedAllColumns});

        if (tableSettings.filters) {
          commit('setServerParamsProp', {
            name: 'columnFilters',
            value: savedFiltersToServerParamFilters(tableSettings.filters),
          });
        }

        commit('setStateProp', {
          name: 'shownColumnNames',
          value: await getShownColumnNames(
            globalStore.$domainModel,
            settings.apiModel,
            settings.shownColumnNames,
            savedColumns,
            state.allColumns,
          ),
        });
        commit('setStateProp', {name: 'includes', value: viewIncludes});
        commit('setStateProp', {name: 'extraParams', value: settings.extraParams});
        commit('setStateProp', {name: 'apiModel', value: settings.apiModel});
        commit('setStateProp', {name: 'contextId', value: settings.contextId});
        commit('setStateProp', {name: 'onPrimaryKeyClick', value: settings.onPrimaryKeyClick});
        commit('setServerParamsProp', {
          name: 'perPage',
          value: settings.perPage,
        });
        commit('setStateProp', {name: 'rowsSelection', value: settings.rowsSelection});
        commit('setStateProp', {name: 'selectedRows', value: settings.selectedRows});
        commit('setStateProp', {name: 'apiUrl', value: apiModelEntitySpec.url});
        if (tableSettings.aggregations) {
          commit('setStateProp', {
            name: 'aggregations',
            value: tableSettings.aggregations,
          });
        } else {
          commit('setStateProp', {
            name: 'aggregations',
            value: await initAggregations(settings.allColumns, apiModelEntitySpec, globalStore.$domainModel),
          });
        }
      },

      async reloadData({commit, dispatch, state}) {
        dispatch('loadData');
      },

      async loadData({state, commit, dispatch, getters}) {
        if (state.requestLock.count > 0) {
          state.requestLock.requestNeed = true;
        } else {
          if (state.loading) {
            if (state.pending) {
              return;
            }
            commit('setPending', true);
            state.interval = window.setInterval(async () => {
              if (!state.loading) {
                clearInterval(state.interval);
                commit('setPending', false);
                await dispatch('loadData');
              }
            }, 100);
            return;
          }
          const performRequestCallback: PerformRequestCallback = async (pageNumber, pageSize) => {
            commit('setStateProp', {name: 'loading', value: true});
            const includesExcludes: IncludesExcludes = getIncludesExcludes(state.shownColumnNames, state.allColumns);
            try {
              return await performDRestSelect(globalStore.$domainModel, state.apiModel, {
                excludes: includesExcludes.excludes,
                includes: includesExcludes.includes,
                filters: [
                  ...externalFiltersToFilters(state.externalFilters),
                  ...(await columnFiltersToFilters(
                    globalStore.$domainModel,
                    state.apiModel,
                    state.allColumns,
                    state.serverParams.columnFilters,
                  )),
                ],
                sorts: sortColumnsToSorts(state.sortColumns, getEntityPrimaryKey(state.apiModel)),
                pageNumber,
                pageSize,
                extraParams: state.extraParams,
              });
            } finally {
              commit('setStateProp', {name: 'loading', value: false});
            }
          };
          const dataSourceParam = new CGridDataSourceCache(
            globalStore.$domainModel,
            state.apiModel,
            performRequestCallback,
            getters.getShownColumns,
            1,
          );

          installEventHandler(dataSourceParam, dataNeedsToReloaded, async (event: any) => {
            await event.passEvent();
            warn('Выборка изменилась, перечитывается!');
            dispatch('reloadData');
          });

          dataSourceParam.setSelectedRows(state.selectedRows);
          const dataSource = new cheetahGrid.data.CachedDataSource(dataSourceParam);
          commit('setStateProp', {name: 'dataSource', value: dataSource});
          commit('setStateProp', {name: 'dataSourceParam', value: dataSourceParam});
          commit('setStateProp', {name: 'isDataSourceReady', value: !!dataSourceParam});
          dispatch('loadAggregations');
        }
      },

      async applyExternalFilters({state, commit, dispatch}) {
        // todo: remove `applyExternalFilters` and replace it with `loadData`
        // получаем новые данные
        await dispatch('loadData');
      },

      async reflectById({state}, {apiModelId, currentRow}) {
        let url = common.createUrlWithIncludes(state.apiUrl + '/' + apiModelId, state.includes);
        const dataSource: CachedDataSource<CGridDataSourceCache> = state.dataSource!;
        const added: boolean = await (state.dataSourceParam as CGridDataSourceCache).reflect(url, currentRow);
        if (added) {
          dataSource.length++;
          state.dataSourceParam.length++;
        }
        dataSource.clearCache();
      },

      beginUpdate({state}) {
        state.requestLock.count += 1;
      },

      async endUpdate({state, dispatch}) {
        state.requestLock.count -= 1;
        if (state.requestLock.count === 0 && state.requestLock.requestNeed) {
          state.requestLock.requestNeed = false;
          await dispatch('loadData');
        }
      },

      async loadAggregations({state, commit}) {
        if (!ability.can('view-aggregations', 'users')) {
          return;
        }
        let missingAggregations = getMissingAggregations(
          state.aggregations,
          state.aggregationsData,
          state.shownColumnNames,
        );
        if (missingAggregations.length) {
          const filters = [
            ...externalFiltersToFilters(state.externalFilters),
            ...(await columnFiltersToFilters(
              globalStore.$domainModel,
              state.apiModel,
              state.allColumns,
              state.serverParams.columnFilters,
            )),
          ];
          const aggregationsData: AggregationsData = await requestAggregationsData(
            missingAggregations,
            filters,
            globalStore.$domainModel,
            state.apiModel,
          );
          commit('setStateProp', {
            name: 'aggregationsData',
            value: new Map([...state.aggregationsData, ...aggregationsData]),
          });
        }
      },

      async setAggType({state, commit, dispatch}, payload: any) {
        commit('removeAggregation', payload.field);
        if (payload.value) {
          const agg: Aggregation = {
            field: payload.field,
            kind: Number(payload.value),
          };
          if (await aggregationIsValid(agg.field, state.entitySpec!, globalStore.$domainModel)) {
            commit('addAggregation', agg);
            dispatch('loadAggregations');
          }
        }
        saveAggregationsToLocalStorage(state.apiModel, state.aggregations, state.contextId);
      },

      async sendDrestToXlsxRequest({state, getters}) {
        const queryPart = buildDRestRequestWithEntitySpecQueryPart({
          includes: state.includes,
          filters: [
            ...externalFiltersToFilters(state.externalFilters),
            ...(await columnFiltersToFilters(
              globalStore.$domainModel,
              state.apiModel,
              state.allColumns,
              state.serverParams.columnFilters,
            )),
          ],
          sorts: sortColumnsToSorts(state.sortColumns, getEntityPrimaryKey(state.apiModel)),
          extraParams: state.extraParams,
        });
        const response = await httpPost(DREST_TO_XLSX_URL, {
          [DREST_TO_XLSX_COLUMNS_PARAM]: getters.getShownColumnNames,
          [DREST_TO_XLSX_QUERY_PARAM]: `${(state.entitySpec as any).url}?${queryPart}`,
        });
        if ('error' in response.data) {
          error(response.data.error);
        } else {
          success(response.data.success);
        }
      },
    },
    getters: {
      getAllColumns: (state) => state.allColumns,
      getShownColumnNames: (state) => state.shownColumnNames,
      getShownColumns: (state) =>
        state.shownColumnNames.map((field: string) =>
          state.allColumns.find((column: TableColumn) => column.field === field),
        ),
      getRows: (state) => state.rows,
      getServerParams: (state) => state.serverParams,
      getTotalResults: (state) => state.totalResults,
      getSortColumns: (state) => state.sortColumns,
      getPerPage: (state) => state.serverParams.perPage,
      getPage: (state) => state.serverParams.page,
      getSelectedRows: (state) => state.selectedRows,
      getExternalFilters: (state) => state.externalFilters,
      isLoading: (state) => state.loading,
      getDataSource: (state) => state.dataSource,
      getDataSourceParam: (state) => state.dataSourceParam,
      getIsDataSourceReady: (state) => state.isDataSourceReady,
      getSelectedColumnNumber: (state) => state.selectedColumnNumber,
      getSelectedRowNumber: (state, getters) => {
        let result = state.selectedRowNumber;
        if (getters.getShowFilterInHeader) {
          result -= 1;
        }
        if (getters.getShowAggregationsInHeader) {
          result -= 1;
        }
        return result;
      },
      getShowFilter: (state) => state.showFilter,
      getShowFilterInHeader: (state) => state.showFilter || state.serverParams.columnFilters.size > 0,
      getFilterValueByField: (state) => (field: string) => state.serverParams.columnFilters.get(field),
      getFilterLeft: (state) => state.filterLeft,
      getFilterTop: (state) => state.filterTop,
      getShowClipboardCopyingProgress: (state) => state.showClipboardCopyingProgress,
      getClipboardCopyingProgress: (state) => state.clipboardCopyingProgress,
      getEntitySpec: (state) => state.entitySpec,
      getRowsSelection: (state) => state.rowsSelection,
      getBatchRowsSelect: (state) => state.batchRowsSelect,
      getAggregationValueByField: (state, getters) => (field: string) => {
        const value: Number | undefined = state.aggregationsData.get(field.replaceAll('.', '__'));
        return value !== undefined
          ? `${
              AggregationTypeNames()[getters.getAggregationTypeByField(field) as AggregationType]
            }: ${value?.toLocaleString()}`
          : '';
      },
      getAggregationTypeByField: (state) => (field: string) => {
        const aggregation: any = state.aggregations.find((agg: Aggregation) => agg.field === field);
        return aggregation ? aggregation.kind : null;
      },
      getShowAggregationsInHeader: (state) => state.showAggregations,
      getShowAggSelect: (state) => state.showAggSelect,
      getAggSelectLeft: (state) => state.aggSelectLeft,
      getAggSelectTop: (state) => state.aggSelectTop,
      getSmartTableIncludes: (state) => state.includes,
    },
  });
};
