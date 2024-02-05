<template lang="html">
  <div>
    <v-select
      v-model="selectValue"
      outlined
      height="28"
      solo
      flat
      dense
      clearable
      class="input"
      :items="items"
      @change="selectChange"
      @click:clear="selectChange('')"
      @blur="emit('hide-agg-select')"
      @keydown.esc="emit('hide-agg-select')"
    />
  </div>
</template>

<script lang="ts">
import {AggregationType, AggregationTypeNames} from '~/common/aggregations';

export default defineComponent({
  props: {
    value: Number as PropType<AggregationType>,
  },
  setup(props, {emit}) {
    const items: Array<any> = [];
    const selectValue = ref(null);

    // init defaults
    for (const [key, value] of Object.entries(AggregationTypeNames())) {
      const item: any = {
        text: value,
        value: key,
      };
      items.push(item);
    }

    watch(
      () => props.value,
      (value: any) => {
        selectValue.value = items.find((item) => Number(item.value) === value);
      },
    );

    function selectChange(payload: string) {
      emit('agg-value-changed', payload);
      emit('hide-agg-select');
    }

    return {
      emit,
      items,
      selectValue,
      selectChange,
    };
  },
});
</script>
