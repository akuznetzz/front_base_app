<template lang="html">
  <div v-if="column.type !== 'field'" @keydown.ctrl.space="ctrlSpaceHandler">
    <div v-if="column.type === 'boolean'">
      <v-btn-toggle color="primary" mandatory :value="1">
        <v-btn small @click="inputChange(true, 0)">
          <v-icon>mdi-checkbox-marked-outline</v-icon>
        </v-btn>
        <v-btn small @click="inputChange(null, 0)">
          <v-icon>mdi-minus-box-outline</v-icon>
        </v-btn>
        <v-btn small @click="inputChange(false, 0)">
          <v-icon>mdi-checkbox-blank-outline</v-icon>
        </v-btn>
      </v-btn-toggle>
    </div>
    <v-text-field
      v-else
      ref="textField"
      :style="getFilterStyle()"
      outlined
      class="input"
      height="28"
      solo
      flat
      dense
      clearable
      elevation="0"
      :value="value"
      :prepend-icon="showIcon()"
      :error="error"
      :placeholder="showPlaceholder()"
      @click:clear="inputChange(null, 0)"
      @click:prepend="showDatePicker = !showDatePicker"
      @keyup.ctrl.space="showDatePicker = !showDatePicker"
      @keyup="keyupFilter"
      @keyup.enter="forceFilter"
      @click="keyupFilter"
      v-click-outside="emit('hide-filter')"
      @keydown.esc="emit('hide-filter')"
    />
    <v-dialog v-if="isDateType()" v-model="showDatePicker" max-width="320">
      <v-date-picker v-model="dateRange" locale="ru-ru" color="primary" range :first-day-of-week="1">
        <v-spacer />
        <v-btn text color="primary" @click="setDate()"> Ок </v-btn>
        <v-btn text color="primary" @click="hidePicker()"> Отмена </v-btn>
      </v-date-picker>
    </v-dialog>
    <v-menu v-model="isMenuShow" absolute offset-y :position-x="menuPositionLeft" :position-y="menuPositionTop">
      <v-list>
        <select-related
          v-show="isSelectRelatedApplicable"
          :entity-spec="entitySpec"
          :column="column"
          :value="value"
          @input="inputChange"
          @applicability-changed="handleApplicabilityChange"
        />
        <v-list-item v-if="!isSelectRelatedApplicable">
          {{ LIST_IS_EMPTY }}
        </v-list-item>
        <v-list-item :disabled="!value" role="menuitem" style="cursor: pointer; user-select: none">
          <v-list-item-content>
            <v-list-item-title @click="saveFilterInfo">Сохранить как</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
        <v-divider aria-orientation="horizontal" />
        <v-list-item
          v-for="filterInfo in relatedFiltersList"
          :key="filterInfo.id"
          role="menuitem"
          style="cursor: pointer; user-select: none"
        >
          <v-list-item-content>
            <v-list-item-title @click="applyRelatedFilter(filterInfo.id)">
              {{ filterInfo.name }}
            </v-list-item-title>
          </v-list-item-content>
          <v-list-item-action class="ml-0">
            <v-tooltip top>
              <template #activator="{on}">
                <v-btn icon v-on="on">
                  <v-icon color="grey lighten-1" @click="renameFilterInfo(filterInfo)"> mdi-pencil-outline</v-icon>
                </v-btn>
              </template>
              {{ `${$t('common.rename')} ${filterInfo.name}` }}
            </v-tooltip>
          </v-list-item-action>
          <v-list-item-action class="ml-0">
            <v-tooltip top>
              <template #activator="{on}">
                <v-btn icon v-on="on">
                  <v-icon color="grey lighten-1" @click="deleteFilterInfo(filterInfo)"> mdi-trash-can-outline</v-icon>
                </v-btn>
              </template>
              {{ `${$t('common.delete')} ${filterInfo.name}` }}
            </v-tooltip>
          </v-list-item-action>
        </v-list-item>
      </v-list>
    </v-menu>
    <string-edit-dialog
      :on-close-dialog="onCloseDialog"
      :show-dialog="showFilterNameDialog"
      :str-value="valueFilterName"
      :input-mode="inputNameMode"
    />
  </div>
</template>

<script lang="ts">
import {tryParseFilterValue} from '~/components/SmartTable/try-parse-filter-value';
import {ColumnType} from '~/components/SmartTable/columns-spec';
import SelectRelated from '~/components/SmartTable/input-assistant/select-related.vue';
import {getRect} from '~/common/ui-utils';
import {IEntitySpec} from '~/framework/dbd/dbd-spec';
import {LIST_IS_EMPTY} from '~/common/constants';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';
import StringEditDialog from '~/components/SmartTable/table-menu/string-edit-dialog.vue';
import {filterInfoHelper, RelatedFilterInfo} from '~/components/SmartTable/input-assistant/filter-info-helper';

export interface FilterColumn {
  field: string;
  type: ColumnType;
  nullable: boolean;
  extra?: any;
}

const DummyOnCloseDialog = () => {};

export default defineComponent({
  components: {
    SelectRelated,
    StringEditDialog,
  },

  props: {
    column: {
      type: Object as PropType<FilterColumn>,
      required: true,
    },
    value: String,
    entitySpec: {
      type: Object as PropType<IEntitySpec>,
      required: true,
    },
  },

  setup(props, {emit}) {
    const root = getCurrentInstance().proxy;
    const relatedFiltersList: Ref<any[]> = ref([]);
    const showFilterNameDialog = ref(false);
    const valueFilterName = ref();
    const onCloseDialog: Ref<(e: any) => any> = ref(DummyOnCloseDialog);
    const inputNameMode = ref(false);
    const dateRange = ref([]);

    const {buildFieldFiltersList, saveNamedFilterInfoRec, deleteNamedFilterInfoRec, addFieldFilterInfoRec} =
      filterInfoHelper(props.entitySpec, <number>root.$nuxt.$auth.user?.id);

    onMounted(async () => {
      relatedFiltersList.value = await buildFieldFiltersList(props.column.field);
    });

    watch(
      () => props.column,
      async (column) => {
        relatedFiltersList.value = await buildFieldFiltersList(column.field);
      },
    );

    function applyRelatedFilter(id: number) {
      const filterInfo = relatedFiltersList.value.find((element: any) => {
        return element.id === id;
      });
      if (filterInfo?.body) {
        inputChange(filterInfo.body);
      }
    }

    async function execDialog(showFunc: (on: boolean) => void): Promise<any> {
      return await new Promise((resolve) => {
        showFunc(true);
        onCloseDialog.value = (e: any) => {
          showFunc(false);
          onCloseDialog.value = DummyOnCloseDialog;
          resolve(e);
        };
      });
    }

    async function inputNameStr(name?: string) {
      valueFilterName.value = name;
      const result: any = await execDialog((on: boolean) => (showFilterNameDialog.value = on));
      return result && result.modalResult === ModalResult.Accepted && result.payload
        ? result.payload.strValue
        : undefined;
    }

    async function renameFilterInfo(filterInfo: RelatedFilterInfo) {
      inputNameMode.value = false;
      const name = await inputNameStr(filterInfo.name);
      if (name) {
        await saveNamedFilterInfoRec(filterInfo.id, undefined, name);
        relatedFiltersList.value = await buildFieldFiltersList(props.column.field);
      }
    }

    async function deleteFilterInfo(filterInfo: RelatedFilterInfo) {
      await deleteNamedFilterInfoRec(filterInfo.id);
      relatedFiltersList.value = await buildFieldFiltersList(props.column.field);
    }

    async function saveFilterInfo() {
      if (!props.value) {
        return;
      }
      let dlgName: string = props.value;
      if (dlgName.startsWith('[') && dlgName.endsWith(']')) {
        dlgName = dlgName.slice(1, -1);
        const numList = dlgName.split(',');
        if (numList.length > 3) {
          numList[3] = '...';
          dlgName = numList.slice(0, 4).join(',');
        }
      } else if (dlgName.length > 30) {
        dlgName = dlgName.slice(0, 30) + '...';
      }
      inputNameMode.value = true;
      const name = await inputNameStr(dlgName);
      if (name) {
        await addFieldFilterInfoRec(props.column.field, name, props.value);
        relatedFiltersList.value = await buildFieldFiltersList(props.column.field);
      }
    }

    function getFilterStyle() {
      const style: any = {};
      style.minWidth = '80px';
      if (isDateType()) {
        style.minWidth = '160px';
      }
      return style;
    }

    function isDateType() {
      return ['date', 'datetime', 'datetime without tz'].includes(props.column.type);
    }

    function showIcon() {
      if (isDateType()) {
        return 'mdi-calendar';
      }
    }

    function showPlaceholder() {
      if (isDateType()) {
        return 'ДД.ММ.ГГГГ';
      }
    }

    function setDate() {
      inputChange(`["${dateRange.value[0]}", "${dateRange.value[1]}"]`, 0);
      showDatePicker.value = false;
    }

    function hidePicker() {
      showDatePicker.value = false;
    }

    function inputChange(value: string | boolean | null | string[], delay: number = defaultDelay) {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        let filterValue: string;
        if (typeof value === 'string' && value !== '') {
          if (tryParseFilterValue(props.column.field, props.column.type, value, props.column.nullable)) {
            filterValue = value;
          } else {
            error.value = true;
            return;
          }
        } else if (value === null) {
          // if "null" option selected then we consider it as removing a filter (we don't search for null boolean
          // values, at least for now)
          filterValue = '';
        } else {
          filterValue = String(value);
        }
        error.value = false;
        emit('filter-value-changed', {field: props.column.field, value: filterValue});
      }, delay);
    }

    function handleApplicabilityChange(value: boolean) {
      isSelectRelatedApplicable.value = value;
    }

    function focus() {
      if (props.column.type === 'boolean') {
        // todo: do something for boolean type
      } else if (textField.value) {
        (textField.value as any).focus();
      }
    }

    function ctrlSpaceHandler(e: Event) {
      showInputAssistants(e.target as Element);
    }

    function showInputAssistants(elem: Element) {
      const rect = getRect(elem);
      menuPositionLeft.value = rect.left;
      menuPositionTop.value = rect.bottom;
      isMenuShow.value = !isMenuShow.value;
    }

    onUnmounted(() => {
      clearInterval(timer);
    });

    function forceFilter(event: any) {
      inputChange(event.target._value, 0);
    }

    function keyupFilter(event: any) {
      inputChange(event.target._value);
    }

    const showDatePicker = ref(false);
    const defaultDelay = 2500; // ms
    let timer = 0;
    const textField = ref(null);
    const error = ref(false);
    // menu
    const isMenuShow = ref(false);
    const menuPositionLeft = ref(0);
    const menuPositionTop = ref(0);
    // select related
    const isSelectRelatedApplicable = ref(true);

    return {
      showDatePicker,
      textField,
      isDateType,
      getFilterStyle,
      showIcon,
      showPlaceholder,
      setDate,
      hidePicker,
      inputChange,
      focus,
      error,
      emit,
      LIST_IS_EMPTY,
      ctrlSpaceHandler,
      isMenuShow,
      menuPositionLeft,
      menuPositionTop,
      isSelectRelatedApplicable,
      handleApplicabilityChange,

      relatedFiltersList,
      applyRelatedFilter,
      renameFilterInfo,
      deleteFilterInfo,
      saveFilterInfo,
      showFilterNameDialog,
      valueFilterName,
      inputNameMode,
      onCloseDialog,
      forceFilter,
      keyupFilter,
      dateRange,
    };
  },
});
</script>
