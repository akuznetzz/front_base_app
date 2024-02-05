<template>
  <div>
    <block-edit-card
      v-if="showEditor"
      ref="blockEditCard"
      :style="{left: editorLeft + 'px', top: editorTop + 'px', minWidth: '160px'}"
      style="position: absolute; z-index: 1"
      :smart-table="smartTable"
      :table-grid="tableGrid"
      :data-source="dataSource"
      :field-name="fieldName"
      @closeCard="onCloseCardFunc($event)"
    />
  </div>
</template>

<script lang="ts">
import BlockEditCard from './block-edit-card.vue';
import {DG_EVENT_TYPE} from '~/vendor/cheetah-grid/src/js/core/DG_EVENT_TYPE';
import {IDomainModel, IEntitySpec} from '~/framework/dbd/dbd-spec';
import {buildDataSource, DataSource} from '~/framework/data-source';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';
import {ContinueBlockEdit, KEY_F2, MouseMovement} from '~/components/SmartTable/block-edit-spec';
import {EDEvent, sendEvent} from '~/framework/core/enhanced-delegation';
import {
  smartTableEditRecordEventId,
  SmartTableEditRecordEventParameters,
} from '~/components/SmartTable/smart-table-events';

const MAX_MOUSE_MOVEMENT = 10;
const CLICK_CELL_EVENT_DELAY_MS = 333;

export default defineComponent({
  name: 'BlockInputEditor',

  components: {
    BlockEditCard,
  },

  props: {
    tableName: {
      type: String,
      required: true,
    },
    tableGrid: {
      type: Object as any,
    },
  },

  setup(props) {
    const root = getCurrentInstance().proxy;
    const smartTable = root.$parent.$parent;
    const blockEditCard = ref();
    const domainModel = (root as any).$domainModel as IDomainModel;
    let tableSpec: IEntitySpec;
    const tableGrid = computed(() => props.tableGrid);
    const primaryKeyName = smartTable.primaryKey;
    const rowsSelection = smartTable.rowsSelection;
    let continueEdit = ContinueBlockEdit.None;

    const showEditor: Ref<Boolean> = ref(false);
    const dataSource: Ref<DataSource | undefined> = ref();
    const fieldName: Ref<String | undefined> = ref();
    const editorLeft: Ref<Number> = ref(0);
    const editorTop: Ref<Number> = ref(0);
    const onCloseCardFunc: Ref<(e: any) => void> = ref(() => {});

    let gridColumnNumber: number;
    let gridRowNumber: number;
    let mouseMovement: MouseMovement | undefined;

    onMounted(async () => {
      tableSpec = await domainModel.getEntitySpec(props.tableName);
      continueEdit = ContinueBlockEdit.None;
    });

    function editableColumn(gridColNum: number): boolean | undefined {
      const column = gridColNum >= 0 ? smartTable.getTableColumnByColumnNumber(gridColNum) : undefined;
      return !!column && !column?.readOnlyColumn && column.field.split('.').length === 1 && column.field !== 'id';
    }

    function getFindParams() {
      function forCurrRowNextCond(val: number) {
        return val < tableGrid.value.rawGrid.colCount;
      }

      function hasOtherRowNextCond(currRow: number) {
        return currRow < tableGrid.value.rawGrid.rowCount - 1;
      }

      function forOtherRowNextCond(val: number) {
        return val <= gridColumnNumber;
      }

      function forCurrRowPrevCond(val: number) {
        return val >= 0;
      }

      function hasOtherRowPrevCond(currRow: number) {
        return currRow > tableGrid.value.rawGrid.frozenRowCount;
      }

      function forOtherRowPrevCond(val: number) {
        return val >= gridColumnNumber;
      }

      if (continueEdit === ContinueBlockEdit.NextField) {
        return {
          forCurrRowCond: forCurrRowNextCond,
          forStep: 1,
          hasOtherRowCond: hasOtherRowNextCond,
          forOtherRowBegVal: 0,
          forOtherRowCond: forOtherRowNextCond,
        };
      }
      return {
        forCurrRowCond: forCurrRowPrevCond,
        forStep: -1,
        hasOtherRowCond: hasOtherRowPrevCond,
        forOtherRowBegVal: tableGrid.value.rawGrid.colCount - 1,
        forOtherRowCond: forOtherRowPrevCond,
      };
    }

    function findContinueCell() {
      let findColNum = -1;
      const {forCurrRowCond, forStep, hasOtherRowCond, forOtherRowBegVal, forOtherRowCond} = getFindParams();

      for (let colNum = gridColumnNumber + forStep; forCurrRowCond(colNum); colNum += forStep) {
        if ((!rowsSelection || colNum !== 0) && editableColumn(colNum)) {
          findColNum = colNum;
          break;
        }
      }
      if (findColNum < 0 && hasOtherRowCond(gridRowNumber)) {
        gridRowNumber += forStep;
        for (let colNum = forOtherRowBegVal; forOtherRowCond(colNum); colNum += forStep) {
          if ((!rowsSelection || colNum !== 0) && editableColumn(colNum)) {
            findColNum = colNum;
            break;
          }
        }
      }

      gridColumnNumber = findColNum;
    }

    async function defaultBlockEdit(event: EDEvent) {
      const params = event.parameters as SmartTableEditRecordEventParameters;
      dataSource.value = await buildDataSource(tableSpec, params.primaryKeyValue);
      fieldName.value = params.fieldName;
      showEditor.value = true;

      (event.parameters as SmartTableEditRecordEventParameters).result = await new Promise((resolve) => {
        onCloseCardFunc.value = (e: any) => resolve(e);
      });

      showEditor.value = false;
      dataSource.value = undefined;
      onCloseCardFunc.value = () => {};
    }

    async function editGridCell() {
      if (continueEdit) {
        findContinueCell();
        continueEdit = ContinueBlockEdit.None;
      } else {
        const focusCol = tableGrid.value.rawGrid.selection.focus.col;
        gridColumnNumber = editableColumn(focusCol) ? focusCol : -1;
        gridRowNumber = tableGrid.value.rawGrid.selection.focus.row;
      }
      if (gridColumnNumber < 0 || gridRowNumber <= 0) {
        return;
      }
      const gridField = tableGrid.value.rawGrid.getField(gridColumnNumber, gridRowNumber);
      if (!gridField) {
        return;
      }
      tableGrid.value.rawGrid.makeVisibleCell(gridColumnNumber, gridRowNumber);
      tableGrid.value.rawGrid.focusGridCell(gridField, gridRowNumber - tableGrid.value.rawGrid.frozenRowCount);

      setTimeout(() => {
        const cellRect = tableGrid.value.rawGrid.getCellRelativeRect(gridColumnNumber, gridRowNumber);
        editorLeft.value = cellRect.left;
        editorTop.value = cellRect.top;
      }, 0);

      const selectedRecord = await smartTable.dataSourceParam.get(
        gridRowNumber - tableGrid.value.rawGrid.frozenRowCount,
      );
      const params: SmartTableEditRecordEventParameters = {
        tableName: props.tableName,
        fieldName: smartTable.getTableColumnByColumnNumber(gridColumnNumber).field,
        primaryKeyValue: Number(selectedRecord[primaryKeyName]),
        result: undefined,
      };
      await sendEvent(smartTable.instance, smartTableEditRecordEventId, params, defaultBlockEdit);

      if (params.result?.payload?.primaryKey && params.result?.modalResult === ModalResult.Accepted) {
        smartTable.reflect(params.result.payload.primaryKey);
      }

      continueEdit = params.result?.payload?.continueEdit ? params.result.payload.continueEdit : ContinueBlockEdit.None;
      if (continueEdit) {
        await root.$nextTick();
        editGridCell();
      } else if (!params.result?.payload?.leftCell) {
        const gridField = tableGrid.value.rawGrid.getField(gridColumnNumber, gridRowNumber);
        if (gridField) {
          tableGrid.value.rawGrid.focusGridCell(gridField, gridRowNumber - tableGrid.value.rawGrid.frozenRowCount);
        }
      }
    }

    function onMouseMove(event: any) {
      if (mouseMovement) {
        mouseMovement.movementX += event.movementX;
        mouseMovement.movementY += event.movementY;
      }
    }

    function onClickCellEvent(event: any) {
      const column = smartTable.getTableColumnByColumnNumber(event.col);
      const recordIndex = tableGrid.value.rawGrid.getRecordIndexByRow(event.row);
      if (recordIndex >= 0 && !column?.readOnlyColumn) {
        mouseMovement = {movementX: 0, movementY: 0};
        window.addEventListener('mousemove', onMouseMove);
        setTimeout(() => {
          if (
            mouseMovement &&
            Math.abs(mouseMovement.movementX) + Math.abs(mouseMovement.movementY) < MAX_MOUSE_MOVEMENT
          ) {
            editGridCell();
          }
          window.removeEventListener('mousemove', onMouseMove);
          mouseMovement = undefined;
        }, CLICK_CELL_EVENT_DELAY_MS);
      }
    }

    watch(tableGrid, (grid: any | undefined) => {
      if (grid) {
        grid.rawGrid.listen(DG_EVENT_TYPE.CLICK_CELL, (event: any) => onClickCellEvent(event));

        grid.rawGrid.listen(DG_EVENT_TYPE.KEYDOWN, (keyCode: any) => {
          if (keyCode === KEY_F2 && !showEditor.value) {
            editGridCell();
          }
        });
      }
    });

    return {
      blockEditCard,
      onCloseCardFunc,
      editorLeft,
      editorTop,
      showEditor,
      dataSource,
      fieldName,
      smartTable,
    };
  },
});
</script>

<style scoped></style>
