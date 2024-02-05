<template>
  <v-list-item link @click="openTable">
    <v-icon> mdi-dots-horizontal-circle-outline</v-icon>
    &nbsp;
    <v-list-item-title v-text="title"></v-list-item-title>
  </v-list-item>
</template>

<script lang="ts">
import {IEntitySpec, FieldSpec} from '~/framework/dbd/dbd-spec';
import {FilterColumn} from '~/components/SmartTable/filters.vue';
import {CHOOSE, CHOOSE_VALUES_FOR_FILTER} from '~/common/constants';
import {IWorkspaceManager, ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';
import {executeComponent} from '~/framework/execute-component/execute-component';
import {getParentFieldName} from '~/components/SmartTable/input-assistant/utils.ts';
import {sendCollectSelectRelatedTableFilters} from '~/components/SmartTable/input-assistant/collect-related-table-filters-helper';

export default defineComponent({
  name: 'SelectRelated',

  props: {
    entitySpec: {
      type: Object as PropType<IEntitySpec>,
      required: true,
    },
    column: {
      type: Object as PropType<FilterColumn>,
      required: true,
    },
    value: {
      type: String,
      required: false,
    },
  },

  setup(props, {emit}) {
    const root = getCurrentInstance().proxy;
    const workspaceManager = (root as any).$workspaceManager as IWorkspaceManager;
    const options = ref(Object());
    const title = ref('');
    const filterFieldName = ref('');

    async function getProperties(fieldName: string, entitySpec: IEntitySpec): Promise<FieldSpec> {
      if (fieldName.includes('.')) {
        const nextFieldName = fieldName.substring(fieldName.indexOf('.') + 1); // full without parent
        const childFieldName = fieldName.substring(0, fieldName.indexOf('.')); // only first
        const properties = entitySpec.options!.properties[childFieldName];
        const nextEntitySpec = await (root.$nuxt as any).$domainModel.getEntitySpec(properties.related_to);
        return getProperties(nextFieldName, nextEntitySpec);
      } else {
        return entitySpec.options!.properties[fieldName];
      }
    }

    async function handleColumnChanged(column: FilterColumn, entitySpec: IEntitySpec) {
      if (column.type === 'choice') {
        options.value = await getProperties(column.field, entitySpec);
        title.value = `${CHOOSE} "${options.value.label}"`;
        emit('applicability-changed', true);
        return;
      }
      filterFieldName.value = getParentFieldName(column.field);
      const properties = await getProperties(filterFieldName.value, entitySpec);
      const isApplicable = properties ? properties.type === 'one' : false;
      if (isApplicable) {
        options.value = properties;
        title.value = `${CHOOSE} "${options.value.label}"`;
      }
      emit('applicability-changed', isApplicable);
    }

    async function collectExternalFilters() {
      const propsExternalFilters: any = props.column.extra?.multiSelectTableFilter;
      const collectEventFilters = await sendCollectSelectRelatedTableFilters(props.entitySpec, filterFieldName.value);
      if (collectEventFilters.length === 0) {
        return propsExternalFilters;
      }
      if (!propsExternalFilters) {
        return {filter: collectEventFilters};
      }
      if (propsExternalFilters.filter) {
        collectEventFilters.push(...propsExternalFilters.filter);
      }
      return Object.assign({}, propsExternalFilters, {filter: collectEventFilters});
    }

    async function openTable() {
      function parseValue(value: string | undefined) {
        if (!value) {
          return new Set();
        }
        let parsed = null;
        try {
          parsed = JSON.parse(value);
        } catch (e) {
          return new Set();
        }
        if (parsed instanceof Array) {
          return new Set(parsed);
        }
        return new Set();
      }
      if (options.value.type === 'choice') {
        const executeProps: any = {values: Array.from(parseValue(props.value)), options: options, title: title.value};
        const result = await executeComponent('choice-filter-picker-card', executeProps, undefined, title.value);
        if (result && result.modalResult === ModalResult.Accepted && result.payload) {
          emit('input', JSON.stringify(result.payload), 0);
        }
        return;
      }

      const executeProps: any = {
        apiModel: options.value.related_to,
        selections: true,
        multipleChoiceMode: true,
        inputSelectedRows: parseValue(props.value),
        tableName: CHOOSE_VALUES_FOR_FILTER,
        conf: {
          column: true,
          filter: true,
          sort: true,
          adding_button: false,
          deleting_button: false,
          auto_width_button: false,
          export_tables_button: false,
          aggregation_button: false,
          export_excel_button: false,
        },
        externalFilters: await collectExternalFilters(),
      };
      const result = await executeComponent('smart-table', executeProps, workspaceManager, title.value);
      if (result && result.modalResult === ModalResult.Accepted && result.payload) {
        emit('input', `[${result.payload.join(',')}]`, 0);
      }
    }

    watch(
      () => props.column,
      (column) => handleColumnChanged(column, props.entitySpec),
    );

    // first init
    handleColumnChanged(props.column, props.entitySpec);

    return {
      openTable,
      title,
    };
  },
});
</script>
