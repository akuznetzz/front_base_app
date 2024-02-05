<template lang="html">
  <v-card ref="smartTable" class="smart-table d-flex flex-column" :style="`${cardStyle ? cardStyle : ''}`">
    <h2 v-if="tableName" class="ml-2 mr-2 mt-2">
      {{ tableName }}
    </h2>
    <div class="d-flex align-center justify-space-between">
      <div class="d-flex scroll-service-panel pa-2">
        <service-panel-button
          v-if="templateConf.multipleChoiceMode || multipleChoiceMode"
          class="mr-1"
          icon-name="mdi-arrow-left"
          color="outline"
          tooltip="Отмена"
          @click="handleMultipleChoiceBack"
        />
        <service-panel-button
          v-if="templateConf.multipleChoiceMode || multipleChoiceMode"
          class="mr-1"
          icon-name="mdi-check"
          color="accent"
          tooltip="Продолжить"
          @click="handleMultipleChoiceOk"
        />
        <user-view-settings
          v-if="templateConf.column"
          :auto-width-button="templateConf.auto_width_button"
          :edit-view-settings-button="templateConf.column"
          :sort-settings-button="templateConf.sort"
        />
        <service-panel-button
          v-if="templateConf.filter && filtering"
          :depressed="showFilter"
          class="mr-1"
          icon-name="mdi-filter"
          :tooltip="$t('smartTable.showFilter')"
          @click="toggleFilter"
        />
        <service-panel-button
          v-if="templateConf.filter && filtering"
          class="mr-1"
          icon-name="mdi-filter-off"
          :tooltip="$t('smartTable.clearFilter')"
          @click="clearFilter"
        />
        <service-panel-button
          v-if="templateConf.export_tables_button"
          class="mr-1"
          icon-name="mdi-content-copy"
          :tooltip="$t('smartTable.copyContent')"
          @click="onCopyToClipboardClick"
        />
        <service-panel-button
          v-if="templateConf.adding_button && addingAllowed"
          class="mr-1"
          color="secondary"
          icon-name="mdi-plus"
          tooltip="Добавить запись"
          @click="onAddRecordClick"
        />
        <service-panel-button
          v-if="templateConf.deleting_button && deletingAllowed"
          :disabled="deletingDisabled"
          class="mr-1"
          color="secondary"
          icon-name="mdi-delete"
          tooltip="Удалить запись"
          @click="onDeleteRecordClick"
        />
        <service-panel-button
          v-if="templateConf.aggregation_button && $can('view-aggregations', 'users')"
          :depressed="showAggregationsInHeader"
          class="mr-1"
          icon-name="mdi-calculator"
          :tooltip="$t('smartTable.aggregation.show')"
          @click="toggleAggregations"
        />
        <service-panel-button
          v-if="templateConf.export_excel_button && $can('export-excel', 'users')"
          class="mr-1"
          icon-name="mdi-file-excel"
          tooltip="Выгрузить excel"
          @click="$localStore.dispatch('sendDrestToXlsxRequest')"
        />
        <slot name="servicePanel" />
        <v-spacer />
        <div class="pl-2" style="white-space: nowrap">
          {{ recordsText }}
        </div>
      </div>
    </div>
    <div v-if="showClipboardCopyingProgress" class="d-flex align-center">
      <v-progress-linear :value="clipboardCopyingProgress" buffer-value="100" color="primary" />
      <v-btn color="primary" icon @click="cancelClipboardCopying">
        <v-icon>mdi-cancel</v-icon>
      </v-btn>
    </div>
    <div
      class="ml-2 mr-2"
      style="height: 100%; position: relative"
      @keydown.alt.118.prevent="clearFilter"
      @keydown.ctrl.83.prevent="toggleFilter"
    >
      <template-filters
        v-if="selectedColumn"
        v-show="showFilter"
        ref="filter"
        :column="selectedColumn"
        :entity-spec="entitySpec"
        :style="{left: filterLeft + 'px', top: filterTop + 'px'}"
        :value="getFilterValueByField(selectedColumn.field)"
        style="position: absolute; z-index: 1"
        @filter-value-changed="
          $localStore.dispatch('setColumnFilter', {field: $event.field, value: $event.value, grid: $refs.grid})
        "
        @hide-filter="$localStore.commit('hideFilter')"
      />
      <template-aggregations
        v-if="selectedColumn"
        v-show="showAggSelect"
        ref="aggSelect"
        :style="{left: aggSelectLeft + 'px', top: aggSelectTop + 'px'}"
        :value="getAggregationTypeByField(selectedColumn.field)"
        style="position: absolute; z-index: 1"
        @hide-agg-select="$localStore.commit('hideAggSelect')"
        @agg-value-changed="$localStore.dispatch('setAggType', {field: selectedColumn.field, value: $event})"
      />
      <block-input-editor
        v-show="$refs.blockInputEditor && $refs.blockInputEditor.showEditor"
        ref="blockInputEditor"
        :table-grid="$refs.grid"
        :table-name="apiModel"
      />
      <v-progress-linear v-show="isLoading" :indeterminate="true" color="primary" />
      <slot name="progress-bar" />
      <c-grid
        ref="grid"
        :data="dataSource"
        :default-row-height="defaultRowHeight"
        :frozen-col-count="templateConf.selections || selections ? 2 : 1"
        :theme="theme"
        @keydown="onCGridKeyDown"
        @click-cell="onClickCell($event)"
        @dblclick-cell="onDblClickCell($event)"
        @selected-cell="onSelectedCell($event)"
      >
        <template slot="layout-header">
          <c-grid-layout-row>
            <c-grid-header
              v-if="templateConf.selections || selections"
              :header-field="rowsSelectionField"
              header-action="check"
              header-type="check"
              @changed-header-value="onRowsSelection"
            />
            <c-grid-header
              v-for="column in tableNeedColumns"
              :key="column.field"
              :caption="column.title"
              :header-style="{textAlign: 'center', font: 'bold 0.8em sans-serif'}"
              :sort="getColumnSortProp(column.field)"
            />
          </c-grid-layout-row>
          <c-grid-layout-row v-if="showFilterInHeader">
            <c-grid-header v-if="templateConf.selections || selections" :key="rowsSelectionField" />
            <c-grid-header v-for="column in tableNeedColumns" :key="column.field">
              {{ getFilterValueByField(column.field) }}
            </c-grid-header>
          </c-grid-layout-row>
          <c-grid-layout-row v-if="showAggregationsInHeader">
            <c-grid-header v-if="templateConf.selections || selections" :key="rowsSelectionField" />
            <c-grid-header
              v-for="column in tableNeedColumns"
              :key="column.field"
              :header-style="{position: 'absolute', bottom: '0px'}"
            >
              {{ getAggregationValueByField(column.field) }}
            </c-grid-header>
          </c-grid-layout-row>
        </template>
        <template slot="layout-body">
          <c-grid-layout-row>
            <c-grid-column
              v-if="templateConf.selections || selections"
              :field="rowsSelectionField"
              :width="50"
              action="check"
              column-type="check"
              @changed-value="onRowSelection"
            />
            <smart-table-columns :displayed-columns="tableNeedColumns" />
          </c-grid-layout-row>
        </template>
      </c-grid>
    </div>
    <div
      v-if="multipleChoiceMode && selectedRows && isDataSourceReady"
      class="mb-2 ml-2 mr-2 multi-choice-selected-items"
    >
      <selected-rows-chip
        v-for="id in selectedRows"
        :key="id"
        :primary-key-value="id"
        :data-source-param="dataSourceParam"
        :entity-spec="entitySpec"
        :smart-table-includes="smartTableIncludes"
        @remove-from-selection="handleSelectedRowChipClose(id)"
      />
    </div>
  </v-card>
</template>

<script>
import localStore, {loadTableSettings} from './store';
import SmartTableColumns from './smart-table-columns';
import {
  getSmartTableMouseEnterCellId,
  getSmartTableMouseLeaveCellId,
  smartTableCollectPresetsEventId,
  smartTableDeleteRecordsEventId,
  smartTableEditRecordEventId,
} from './smart-table-events';
import BlockInputEditor from './block-input-editor.vue';
import UserViewSettings from './table-menu/user-view-settings.vue';
import {DEFAULT_SMART_TABLE_CONF, smartTableProps} from '@/components/SmartTable/smart-table-props';
import * as cGridAll from '~/vendor/vue-cheetah-grid';
import {DG_EVENT_TYPE} from '~/vendor/cheetah-grid/src/js/core/DG_EVENT_TYPE';
import {getEntityPrimaryKey} from '~/common/settings';
import TemplateFilters from '~/components/SmartTable/filters';
import TemplatePagination from '~/components/SmartTable/pagination';
import SMART_TABLE_THEME from '~/components/SmartTable/SMART_TABLE_THEME';
import {ROWS_SELECTION_FIELD} from '~/components/SmartTable/CGridDataSourceCache';
import {confirm, info, success} from '~/framework/messages';
import ServicePanelButton from '~/components/SmartTable/ServicePanelButton';
import {httpDelete} from '~/framework/httpRequest';
import {CREATE, DELETE, FORM} from '~/common/ability';
import {executeEditCard, openTableCard} from '~/framework/open-edit-card';
import {collectPresetsFromFiltersMap} from '~/framework/presets-from-filters';
import TemplateAggregations from '~/components/SmartTable/aggregations';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';
import {SortDirection} from '~/common/sorts';
import {sendEvent} from '~/framework/core/enhanced-delegation';
import {COLUMN_AUTO_WIDTH} from '~/components/SmartTable/columns-spec';
import SelectedRowsChip from '~/components/SmartTable/input-assistant/selected-rows-chip.vue';

export default {
  name: 'SmartTable',
  components: {
    ...cGridAll,
    UserViewSettings,
    TemplatePagination,
    TemplateFilters,
    ServicePanelButton,
    TemplateAggregations,
    BlockInputEditor,
    SmartTableColumns,
    SelectedRowsChip,
  },
  props: smartTableProps(),
  data() {
    return {
      settings: false,
      componentDataSource: null,
      totalResults: 0,
      state: 0,
      loading: false,
      counter: 0,
      lastDraw: 0,
      sizeRefreshTimerId: 0,
      lastUpdateSize: undefined,
      theme: SMART_TABLE_THEME,
      instance: markRaw({}),
    };
  },
  computed: {
    recordsText() {
      const recordCount = this.dataSourceParam ? this.dataSourceParam.length : '?';
      if (this.selectedRowNumber > 0) {
        return `${this.$t('smartTable.record')} ${this.selectedRowNumber} ${this.$t('common.of')} ${recordCount}`;
      } else {
        return `${this.$t('smartTable.records')} ${recordCount}`;
      }
    },
    selectedColumn() {
      if (this.selectedColumnNumber >= 0) {
        return this.getTableColumnByColumnNumber(this.selectedColumnNumber);
      }
    },
    deletingDisabled() {
      let disabled;
      if (this.rowsSelection) {
        disabled = this.selectedRows.size === 0;
      } else {
        disabled = this.selectedRowNumber <= 0;
      }
      return disabled;
    },
    rowsSelection() {
      return this.$localStore.getters.getRowsSelection;
    },
    entitySpec() {
      return this.$localStore.getters.getEntitySpec;
    },
    addingAllowed() {
      return (this.entitySpec ? this.entitySpec.canAdd : false) && this.$can(CREATE, this.apiModel);
    },
    deletingAllowed() {
      return (this.entitySpec ? this.entitySpec.canDelete : false) && this.$can(DELETE, this.apiModel);
    },
    columnsForColumnsSettings() {
      // fixme: ugly code (to preserve order of shown columns)
      const columns = [
        ...this.tableNeedColumns,
        ...this.tableColumns.filter((column) => !this.tableShownColumnNames.includes(column.field)),
      ];
      return columns.map((column) => ({
        field: column.field,
        title: column.title,
        shown: this.tableShownColumnNames.includes(column.field),
      }));
    },
    rowsSelectionField() {
      return ROWS_SELECTION_FIELD;
    },
    dataSourceParam() {
      return this.$localStore.getters.getDataSourceParam;
    },
    showClipboardCopyingProgress() {
      return this.$localStore.getters.getShowClipboardCopyingProgress;
    },
    clipboardCopyingProgress() {
      return this.$localStore.getters.getClipboardCopyingProgress;
    },
    primaryKey() {
      return getEntityPrimaryKey(this.apiModel);
    },
    isLoading() {
      return this.$localStore.getters.isLoading;
    },
    tableColumns() {
      return this.$localStore.getters.getAllColumns;
    },
    tableNeedColumns() {
      return this.$localStore.getters.getShownColumns;
    },
    tableShownColumnNames() {
      return this.$localStore.getters.getShownColumnNames;
    },
    tableRows() {
      return this.$localStore.getters.getRows;
    },
    tableServerParams() {
      return this.$localStore.getters.getServerParams;
    },
    tableFilterTotal() {
      return this.$localStore.getters.getFilterTotal;
    },
    tableFilterPage() {
      return this.$localStore.getters.getFilterPage;
    },
    perPageNumber() {
      return parseInt(this.perPage, 10);
    },
    clickableTrs() {
      return this.$refs.smartTable.getElementsByClassName('clickable');
    },
    selectedRows() {
      return this.$localStore.getters.getSelectedRows;
    },
    isDataSourceReady() {
      return this.$localStore.getters.getIsDataSourceReady;
    },
    fixHeader() {
      if (this.maxHeight) {
        return 'vgt-table striped bordered custom-fixed-header';
      } else {
        return 'vgt-table striped bordered';
      }
    },
    dataSource() {
      return this.$localStore.getters.getDataSource;
    },
    selectedColumnNumber() {
      return this.$localStore.getters.getSelectedColumnNumber;
    },
    selectedRowNumber() {
      return this.$localStore.getters.getSelectedRowNumber;
    },
    showFilter() {
      return this.$localStore.getters.getShowFilter;
    },
    showFilterInHeader() {
      return this.$localStore.getters.getShowFilterInHeader;
    },
    filterLeft() {
      return this.$localStore.getters.getFilterLeft;
    },
    filterTop() {
      return this.$localStore.getters.getFilterTop;
    },
    templateConf() {
      return Object.assign({}, DEFAULT_SMART_TABLE_CONF, this.conf);
    },
    showAggregationsInHeader() {
      return this.$localStore.getters.getShowAggregationsInHeader;
    },
    aggSelectLeft() {
      return this.$localStore.getters.getAggSelectLeft;
    },
    aggSelectTop() {
      return this.$localStore.getters.getAggSelectTop;
    },
    showAggSelect() {
      return this.$localStore.getters.getShowAggSelect;
    },
    smartTableIncludes() {
      return this.$localStore.getters.getSmartTableIncludes;
    },
  },

  watch: {
    dataSource(newDataSource) {
      if (newDataSource) {
        // fixme: It would be better to set totalRecordCountCallback right after CGridDataSourceCache creation, but
        //  CGrid creates new DataSource, which wraps around our DataSource and we don't have access to "the real"
        //  DataSource to set up the length.
        newDataSource.source.setTotalRecordCountCallback((totalRecordCount) => {
          const grid = this.$refs.grid;
          if (grid && grid.rawGrid) {
            grid.rawGrid.dataSource.length = totalRecordCount;
          }
        });
      }
    },
    showFilter(value) {
      const rawGrid = this.$refs.grid.rawGrid;
      if (value) {
        if (rawGrid.selection.select.col < 0) {
          rawGrid.selection.select = {col: 0, row: 0};
        }
        if (this.$refs.filter) {
          this.$nextTick(() => this.$refs.filter.focus());
        } else {
          info(this.$t('smartTable.selectColumnFilter'));
        }
      } else {
        this.$nextTick(() => rawGrid.focus());
      }
    },
    showFilterInHeader(value) {
      function moveSelection(rawGrid, direction) {
        const range = rawGrid.selection.range;
        if (range.start.row === 0 && range.end.row === 0) {
          return; // no need to move selected cell if selection is on first row (filters is shown on second row)
        }
        if (direction) {
          range.start.row++;
          range.end.row++;
        } else {
          range.start.row--;
          range.end.row--;
        }
        rawGrid.selection.range = range;
      }

      moveSelection(this.$refs.grid.rawGrid, value);
      // change top for aggSelect
      if (value) {
        this.$localStore.commit('setAggSelectTop', this.$refs.grid.rawGrid.getCellRelativeRect(1, 2).top);
      } else {
        this.$localStore.commit('setAggSelectTop', this.$refs.grid.rawGrid.getCellRelativeRect(1, 1).top);
      }
    },
  },

  beforeCreate() {
    this.$localStore = localStore(this.$store);
    this.sizeRefreshTimerId = setInterval(() => this.invalidate(), 100);
  },

  beforeDestroy() {
    clearInterval(this.sizeRefreshTimerId);
  },

  created() {
    this.renderTable();
  },

  mounted() {
    this.$localStore.commit('setFilterTop', this.$refs.grid.rawGrid.getCellRelativeRect(1, 1).top);
    this.$localStore.commit('setAggSelectTop', this.$refs.grid.rawGrid.getCellRelativeRect(1, 1).top);
    if (!this.$can('export-tables', 'users')) {
      this.$refs.grid.rawGrid.getCopyRangeInternal = (range) => {
        return {
          start: {col: range.start.col, row: range.start.row},
          end: {col: range.start.col, row: range.start.row},
        };
      };
    }

    this.$refs.grid.rawGrid.listen(DG_EVENT_TYPE.CLICK_CELL, (event) => {
      this.onClickCellEvent(event);
    });

    this.$refs.grid.rawGrid.listen(DG_EVENT_TYPE.MOUSEDOWN_CELL, (event) => {
      this.onMouseDownEvent(event);
    });

    this.$refs.grid.rawGrid.listen(DG_EVENT_TYPE.RESIZE_COLUMN, (event) =>
      this.$localStore.dispatch('setColumnWidth', {
        col: this.rowsSelection ? event.col - 1 : event.col,
        width: this.$refs.grid.rawGrid.getColWidth(event.col),
      }),
    );
    this.$refs.grid.rawGrid.listen(DG_EVENT_TYPE.MOUSEENTER_CELL, (event) => {
      sendEvent(this.instance, getSmartTableMouseEnterCellId, event, (event) => {
        if (!this.onMouseEnterCell) {
          return;
        }
        const e = event.parameters;
        const record = this.$refs.grid.rawGrid.getRowRecord(e.row);
        const column = this.tableNeedColumns[Number(e.col) - (this.templateConf.selections ? 1 : 0)];
        this.onMouseEnterCell(record, column);
      });
    });
    this.$refs.grid.rawGrid.listen(DG_EVENT_TYPE.MOUSELEAVE_CELL, (event) => {
      sendEvent(this.instance, getSmartTableMouseLeaveCellId, event, (event) => {
        if (!this.onMouseLeaveCell) {
          return;
        }
        const e = event.parameters;
        const record = this.$refs.grid.rawGrid.getRowRecord(e.row);
        const column = this.tableNeedColumns[Number(e.col) - (this.templateConf.selections ? 1 : 0)];
        this.onMouseLeaveCell(record, column);
      });
    });
  },

  methods: {
    storeColumnsWidth() {
      const rawGrid = this.$refs?.grid?.rawGrid;
      if (!rawGrid) {
        return;
      }
      const rowsSelection = this.rowsSelection;
      const localStore = this.$localStore;
      this.tableNeedColumns.forEach(function (item, index) {
        if (item.width === COLUMN_AUTO_WIDTH) {
          localStore.dispatch('setColumnWidth', {
            col: index,
            width: rawGrid.getColWidth(rowsSelection ? index + 1 : index),
          });
        }
      });
    },

    async onClickCellEvent(event) {
      const column = this.getTableColumnByColumnNumber(event.col);
      if (column && column.extra && column.extra.onCellReferenceMark) {
        const rawGrid = this.$refs.grid.rawGrid;
        const recordIndex = rawGrid.getRecordIndexByRow(event.row);
        if (recordIndex >= 0) {
          event.event.preventDefault();
          const eventRecord = await this.dataSourceParam.get(recordIndex);
          await column.extra.onCellReferenceMark(eventRecord);
        }
      }
    },

    async onMouseDownEvent(event) {
      if (event.event.button === 1) {
        const rawGrid = this.$refs.grid.rawGrid;
        const recordIndex = rawGrid.getRecordIndexByRow(event.row);
        if (recordIndex >= 0) {
          const column = this.getTableColumnByColumnNumber(event.col);
          if (column.extra && column.extra.onCellReferenceMark) {
            event.event.preventDefault();
            const eventRecord = await this.dataSourceParam.get(recordIndex);
            await column.extra.onCellReferenceMark(eventRecord, event.event);
          } else if (column.field === this.primaryKey) {
            event.event.preventDefault();
            const eventRecord = await this.dataSourceParam.get(recordIndex);
            await openTableCard(this.apiModel, eventRecord[this.primaryKey], undefined, true);
          }
        }
      }
    },

    async onAddRecordClick() {
      const presetsParams = {
        tableName: this.apiModel,
        contextId: this.contextId,
        presets: [],
      };
      await sendEvent(this.instance, smartTableCollectPresetsEventId, presetsParams, this.defaultCollectPresets);

      const params = {
        tableName: this.apiModel,
        contextId: this.contextId,
        props: {presets: presetsParams.presets},
        workspaceManager: this.$store.$workspaceManager,
      };
      await sendEvent(this.instance, smartTableEditRecordEventId, params, this.defaultEditRecord);
    },

    onCGridKeyDown(_keyCode, event) {
      if (event.code === 'Delete') {
        event.preventDefault();
        this.onDeleteRecordClick();
      }
    },

    async defaultDeleteRecords(event) {
      const params = event.parameters;
      if (!params.deleteRecordsPKeys) {
        return;
      }
      await Promise.all(params.deleteRecordsPKeys.map((id) => httpDelete(`${this.entitySpec.url}/${id}`)));
      params.result = params.deleteRecordsPKeys;
    },

    onDeleteRecordClick() {
      if (this.deletingAllowed && !this.deletingDisabled) {
        let message;
        if (this.rowsSelection) {
          message = `Удалить ${this.selectedRows.size} записей?`;
        } else {
          message = 'Удалить запись?';
        }
        confirm(message, this.deleteRecord);
      }
    },

    async deleteRecord() {
      const params = {
        tableName: this.apiModel,
        contextId: this.contextId,
        deleteRecordsPKeys: this.rowsSelection
          ? [...Array.from(this.selectedRows.values())]
          : [Number((await this.dataSourceParam.get(this.selectedRowNumber - 1))[this.primaryKey])],
      };
      await sendEvent(this.instance, smartTableDeleteRecordsEventId, params, this.defaultDeleteRecords);
      if (params.result) {
        await this.reloadData();
        success(params.result.length > 1 ? 'Записи удалены' : 'Запись удалена');
      }
    },

    getTableColumnByColumnNumber(columnNumber) {
      return this.tableNeedColumns[this.rowsSelection ? columnNumber - 1 : columnNumber];
    },

    clearSelection() {
      this.onRowsSelection(false);
    },

    async onRowsSelection({value}) {
      const MAX_RECORD_COUNT_FOR_SELECTION = 1000;
      if (value) {
        const totalRecordCount = this.dataSourceParam.length;
        const recordCount = Math.min(totalRecordCount, MAX_RECORD_COUNT_FOR_SELECTION);
        try {
          this.$localStore.commit('setBatchRowsSelect', true);
          const newSelection = new Set();
          for (let i = 0; i < recordCount; i++) {
            if (!this.$localStore.getters.getBatchRowsSelect) {
              break;
            }
            const record = await this.dataSourceParam.get(i);
            newSelection.add(Number(record[this.primaryKey]));
          }
          if (this.$localStore.getters.getBatchRowsSelect) {
            this.$localStore.commit('setRowsSelection', newSelection);
            info(`Отмечено ${recordCount} записей из ${totalRecordCount}`);
          }
        } finally {
          this.$localStore.commit('setBatchRowsSelect', false);
        }
      } else {
        this.$localStore.commit('setBatchRowsSelect', false);
        this.$localStore.commit('clearSelection');
      }
      this.$localStore.dispatch('loadData');
    },

    onRowSelection({record, value}) {
      const primaryKeyValue = Number(record[this.primaryKey]);
      if (value) {
        if (this.checkSelection(record)) {
          this.$localStore.commit('addRowToSelection', primaryKeyValue);
        } else {
          record[ROWS_SELECTION_FIELD] = false;
          this.$localStore.commit('removeRowFromSelection', primaryKeyValue);
        }
      } else {
        this.$localStore.commit('removeRowFromSelection', primaryKeyValue);
      }
      this.$refs.grid.rawGrid.invalidate();
    },

    async onDblClickCell({row}) {
      if (this.choiceMode) {
        const record = await this.$refs.grid.rawGrid.getRowRecord(row);
        if (record) {
          this.$emit('closeContext', {
            modalResult: ModalResult.Accepted,
            payload: {primaryKey: record[this.primaryKey]},
          });
        } else {
          this.$emit('closeContext', {modalResult: ModalResult.Denied, payload: null});
        }
      }
      if (this.onDoubleClick) {
        const record = await this.$refs.grid.rawGrid.getRowRecord(row);
        if (record) {
          this.onDoubleClick(record);
        }
      }
    },

    // fixme: CGrid resize problems should be solved on CGrid level
    invalidate() {
      const smartTable = this.$refs.smartTable;
      if (smartTable) {
        if (
          !this.lastUpdateSize ||
          smartTable.$el.clientWidth !== this.lastUpdateSize.width ||
          smartTable.$el.clientHeight !== this.lastUpdateSize.height
        ) {
          this.lastUpdateSize = {width: smartTable.$el.clientWidth, height: smartTable.$el.clientHeight};
          this.$nextTick(() => {
            this.$refs.grid.rawGrid.updateSize();
            this.$refs.grid.rawGrid.invalidate();
          });
        }
      }
    },
    cancelClipboardCopying() {
      this.$localStore.commit('cancelClipboardCopying');
    },
    safeCopyText(text) {
      this.$copyText(text).catch(() => {
        this.$awn.confirm(this.$t('smartTable.copyContentCopied'), () => this.$copyText(text), false, {
          labels: {confirmOk: this.$t('common.continue'), confirm: this.$t('common.requireConfirmation')},
        });
      });
    },

    onRecalcColumnsWidthClick() {
      this.recalcColumnsWidth(this.$refs.grid.rawGrid);
    },

    onCopyToClipboardClick() {
      this.$localStore.dispatch('copyToClipboard', {copyFunction: this.safeCopyText, grid: this.$refs.grid.rawGrid});
    },
    toggleFilter(e) {
      if (e.ctrlKey) {
        const record = this.$refs.grid.rawGrid.getRowRecord(
          Number(this.selectedRowNumber) + (this.showFilterInHeader ? 1 : 0),
        );
        const column =
          this.tableNeedColumns[Number(this.selectedColumnNumber) - (this.templateConf.selections ? 1 : 0)];
        if (record && column) {
          this.$refs.filter.inputChange(
            column.type === 'boolean'
              ? !(record[column.field] === 'false' || !record[column.field])
              : record[column.field],
            0,
          );
        }
      }
      this.$localStore.commit('toggleFilter');
    },

    clearFilter() {
      this.$localStore.dispatch('clearFilter');
    },

    getFilterValueByField(field) {
      return this.$localStore.getters.getFilterValueByField(field);
    },

    getAggregationValueByField(field) {
      return this.$localStore.getters.getAggregationValueByField(field);
    },

    getAggregationTypeByField(field) {
      return this.$localStore.getters.getAggregationTypeByField(field);
    },

    toggleAggregations() {
      this.$localStore.commit('toggleAggregations');
    },

    defaultCollectPresets(event) {
      const params = event.parameters;
      const filterPresets = collectPresetsFromFiltersMap(this.getExternalFilters());
      params.presets = [
        ...params.presets.filter((preset) => !filterPresets.find((filter) => preset.field === filter.field)),
        ...filterPresets,
      ];
    },

    async defaultEditRecord(event) {
      const params = event.parameters;
      const result = await executeEditCard(
        params.tableName,
        params.primaryKeyValue,
        params.props,
        params.workspaceManager,
        params.contextTitle,
        params.contextId,
      );
      event.parameters.result = result;
      await this.reflect(result?.payload?.primaryKey ? result.payload.primaryKey : params.primaryKeyValue);
    },

    async defaultPrimaryKeyClick(primaryKeyValue) {
      const params = {
        tableName: this.apiModel,
        contextId: this.contextId,
        primaryKeyValue,
        workspaceManager: this.$store.$workspaceManager,
        result: undefined,
      };
      await sendEvent(this.instance, smartTableEditRecordEventId, params, this.defaultEditRecord);
    },

    renderTable() {
      this.update(async () => {
        const settings = {
          contextId: this.contextId,
          apiModel: this.apiModel,
          apiUrl: this.apiUrl,
          tableName: this.tableName,
          perPage: this.perPageNumber,
          allColumns: this.allColumns,
          shownColumnNames: this.shownColumnNames,
          includes: this.includes,
          extraParams: this.extraParams,
          onPrimaryKeyClick: this.onPrimaryKeyClick,
          defaultPrimaryKeyClick: this.defaultPrimaryKeyClick,
          openFormAllowed: FORM(this.apiModel),
          rowsSelection: this.templateConf.selections || this.selections,
          selectedRows: this.inputSelectedRows,
        };
        await this.$localStore.dispatch('initTable', settings);
        await this.$localStore.commit('setServerParamsProp', {
          name: 'per_page',
          value: this.$localStore.getters.getPerPage,
        });
        // add external filters add apply it without server request
        this.setExternalFilters();
        await this.applyExternalFilters();
        // sort on load
        await this.sortColumnsOnLoad(this.allColumns);
        await this.$localStore.dispatch('loadData');
        this.storeColumnsWidth();
        this.totalResults = this.$localStore.getters.getTotalResults;
      });
    },

    async recalcColumnsWidth(grid) {
      const ADD_COLUMN_WIDTH = 25;
      const columnsWidth = await this.$localStore.dispatch('recalcColumnsWidth', grid);
      for (const key in columnsWidth) {
        const index = this.tableShownColumnNames.indexOf(key);
        if (index >= 0) {
          this.$localStore.dispatch('setColumnWidth', {col: index, width: columnsWidth[key] + ADD_COLUMN_WIDTH});
        }
      }
    },

    changeColumns(columns) {
      this.$localStore.dispatch('changeColumns', columns);
      this.storeColumnsWidth();
    },

    async applyUserTableViewProps(viewProps) {
      await this.$localStore.dispatch('applyUserTableViewProps', {viewProps, grid: this.$refs.grid});
    },

    async applyTableViewSorts(columns) {
      await this.$localStore.dispatch('applyTableViewSorts', {tableViewSorts: columns, grid: this.$refs.grid});
    },

    async sortColumnsOnLoad(columns) {
      const viewJson = loadTableSettings(this.apiModel, this.contextId);
      let sorts = [];
      if (viewJson && viewJson.sorts) {
        sorts = viewJson.sorts;
      } else {
        columns.forEach((column) => {
          if (Object.prototype.hasOwnProperty.call(column, 'order')) {
            sorts.push({
              title: column.title,
              field: column.field,
              order: column.order ? SortDirection.Ascending : SortDirection.Descending,
            });
          }
        });
      }
      await this.applyTableViewSorts(sorts);
    },

    async sortColumnsByClick() {
      // all job is done inside cheetah-grid, the only thing left is to synchronize grid sort state and our sort columns
      const sortState = this.$refs.grid.rawGrid.sortState;
      const sorts = sortState.map((sortColumnState) => {
        const column = this.getTableColumnByColumnNumber(sortColumnState.col);
        return {
          title: column.title,
          field: column.field,
          order: sortColumnState.order === 'asc' ? SortDirection.Ascending : SortDirection.Descending,
        };
      });
      await this.applyTableViewSorts(sorts);
    },

    async applyTableViewProps(viewProps, useSettingsShownColumnNames = false) {
      await this.$localStore.dispatch('applyTableViewProps', {
        viewProps,
        grid: this.$refs.grid,
        settingsShownColumnNames: useSettingsShownColumnNames ? this.shownColumnNames : undefined,
      });
    },

    changePage(e) {
      this.$localStore.commit('setStateProp', {name: 'activeRow', value: null});
      this.$localStore.commit('setServerParamsProp', {name: 'page', value: e.currentPage});
      this.$localStore.commit('setServerParamsProp', {name: 'filterPage', value: e.currentPage});
      this.$localStore.dispatch('loadData');
    },

    changePerPage(e) {
      this.$localStore.commit('setStateProp', {name: 'activeRow', value: null});
      this.$localStore.commit('setServerParamsProp', {name: 'perPage', value: e.currentPerPage});
      this.perPage = e.currentPerPage;
      this.$localStore.dispatch('loadData');
    },
    clearRowBackground(selectedRow) {
      selectedRow.classList.remove('active_tr');
    },
    setClassRow(row) {
      if (row.active) {
        return 'active_tr';
      }
    },
    getActiveRow() {
      const rawGrid = this.$refs.grid.rawGrid;
      return rawGrid.getRowRecord(rawGrid.selection.select.row);
    },

    async reflect(pkeys) {
      if (!pkeys) return;
      const rawGrid = this.$refs.grid.rawGrid;
      const recordIndex = rawGrid.getRecordIndexByRow(rawGrid.selection.select.row);
      for (const pk of Array.isArray(pkeys) ? pkeys : [pkeys]) {
        if (pk) {
          await this.$localStore.dispatch('reflectById', {apiModelId: pk, currentRow: recordIndex});
        }
      }
      // todo: invalidate not the whole grid, but only affected by reflect areas
      rawGrid.invalidate();
    },

    // обновляет данные таблицы
    async reloadData() {
      await this.$localStore.dispatch('reloadData');
    },
    // возвращает внешние фильтры
    // @return Map
    getExternalFilters() {
      return this.$localStore.getters.getExternalFilters;
    },
    // добавляет внешние фильтры
    async setExternalFilters(filters = this.externalFilters, replace = false) {
      const stateExternalFilters = this.getExternalFilters();
      if (replace) {
        stateExternalFilters.clear();
      }
      for (const item in filters) {
        stateExternalFilters.set(item, filters[item]);
      }
      await this.applyExternalFilters();
    },
    // применяет внешние фильтры
    async applyExternalFilters() {
      await this.$localStore.dispatch('applyExternalFilters');
    },
    // накапливает вызовы к loadData
    async update(callback) {
      await this.$localStore.dispatch('beginUpdate');
      try {
        await callback();
      } finally {
        await this.$localStore.dispatch('endUpdate');
      }
    },
    onSelectedCell(event) {
      if (event.selected) {
        this.$localStore.commit('setSelectedCell', {event, grid: this.$refs.grid});
      }
      this.$refs.grid.rawGrid.invalidate();
    },
    async onClickCell(event) {
      if (this.onClick) {
        const recordIndex = this.$refs.grid.rawGrid.getRecordIndexByRow(event.row);
        let row;
        if (recordIndex >= 0) {
          row = await this.$localStore.getters.getDataSourceParam.get(recordIndex);
        }
        const column = this.getTableColumnByColumnNumber(event.col);
        this.onClick(column, row);
      }
    },

    getColumnSortProp(fldName) {
      const tableField = this.tableColumns.find((column) => column.field === fldName);
      if (!tableField || tableField.type === 'field' || tableField.extra?.disableSort) {
        return undefined;
      }
      return this.sortColumnsByClick;
    },

    handleMultipleChoiceBack() {
      this.$emit('closeContext', {modalResult: ModalResult.Denied, payload: null});
    },

    handleMultipleChoiceOk() {
      this.$emit('closeContext', {modalResult: ModalResult.Accepted, payload: this.selectedRows});
    },

    handleSelectedRowChipClose(primaryKeyValue) {
      const row = this.dataSourceParam.getRowByPrimaryKey(primaryKeyValue);
      if (row) {
        row[ROWS_SELECTION_FIELD] = false;
        this.$refs.grid.rawGrid.invalidate();
      }
      this.$localStore.commit('removeRowFromSelection', primaryKeyValue);
    },
  },
};
</script>
<style lang="scss">
.custom-fixed-header {
  thead th {
    position: sticky;
    top: 1px;
    z-index: 1;
    outline: 1px solid #dcdfe6;
  }

  thead th.vgt-checkbox-col {
    z-index: 2;
  }
}

table.vgt-table {
  min-width: 800px;

  & td {
    padding: 3px 5px 3px 5px;
  }

  & tr.active_tr {
    background: #92d7cd !important;
  }

  & th {
    font-size: 0.8em;
    text-align: center;
  }

  & th div {
    font-weight: bold !important;
  }
}

.cheetah-grid .grid-scrollable {
  overflow-y: auto !important;
  overflow-x: auto !important;
}

.scroll-service-panel {
  overflow-x: auto;
  overflow-y: hidden;
  width: 100%;
}

.smart-table {
  height: 500px;
  width: 800px;
}

.multi-choice-selected-items {
  max-height: calc(100vh - 505px - 60px);
  overflow: auto;
  position: absolute;
  top: 505px;
}
</style>
