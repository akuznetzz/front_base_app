<template>
  <v-chip class="mr-1 mb-1" close small @click:close="emit('remove-from-selection')">
    {{ verboseName }}
  </v-chip>
</template>

<script lang="ts">
import {IEntitySpec} from '~/framework/dbd/dbd-spec';
import {CGridDataSourceCache} from '~/components/SmartTable/CGridDataSourceCache';
import common from '../common';

export default defineComponent({
  name: 'SelectedRowsChip',

  props: {
    primaryKeyValue: {
      type: Number,
      required: true,
    },
    dataSourceParam: {
      type: Object as PropType<CGridDataSourceCache>,
      required: true,
    },
    entitySpec: {
      type: Object as PropType<IEntitySpec>,
      required: true,
    },
    smartTableIncludes: {
      type: Array,
      default: () => [],
    },
  },

  setup(props, {emit}) {
    const POSSIBLE_FIELDS = ['name', 'short_name', 'full_name'];
    const verboseName = ref('');

    async function getRowVerboseName(primaryKeyValue: number) {
      let result = String(primaryKeyValue);
      // try get from cache
      let row = props.dataSourceParam.getRowByPrimaryKey(primaryKeyValue);
      // fetch
      if (!row) {
        const url = common.createUrlWithIncludes(
          `${props.entitySpec.url}/${primaryKeyValue}`,
          props.smartTableIncludes,
        );
        row = await props.dataSourceParam.fetchRow(url);
      }
      if (!row) {
        return result;
      }
      POSSIBLE_FIELDS.forEach((possibleField) => {
        // if (row!.hasOwnProperty(possibleField)) {
        if (possibleField in row!) {
          result = row![possibleField];
        }
      });
      return result;
    }

    onMounted(async () => {
      verboseName.value = await getRowVerboseName(props.primaryKeyValue);
    });

    return {
      emit,
      verboseName,
    };
  },
});
</script>
