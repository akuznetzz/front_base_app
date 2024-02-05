<template>
  <div>
    <c-grid-column
      v-for="(column, index) in displayedColumns"
      :key="index"
      :caption="column.title"
      :action="getColumnAction(column)"
      :column-style="column.gridColumnStyle"
      :column-type="column.gridColumnType"
      :field="column.field"
      :width="column.width"
    />
  </div>
</template>

<script lang="ts">
import * as cGridAll from '~/vendor/vue-cheetah-grid';
import {TableColumn} from '~/components/SmartTable/columns-spec';

export default defineComponent({
  name: 'SmartTableColumns',

  components: {
    ...cGridAll,
  },

  props: {
    displayedColumns: {
      type: Array,
    },
  },

  setup() {
    function getColumnAction(column: TableColumn) {
      return column.gridColumnAction;
    }

    return {
      getColumnAction,
    };
  },
});
</script>

<style scoped></style>
