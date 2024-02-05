<template>
  <v-card class="pa-4 ma-4">
    <v-card-title> {{ title }}: </v-card-title>
    <template v-for="(at, index) in fields">
      <v-checkbox
        v-if="at.display_name"
        :key="index"
        v-model="currentValues"
        multiple
        dense
        :value="at.value"
        :label="at.display_name"
      />
    </template>
    <v-card-actions>
      <service-panel-button
        class="mr-1"
        icon-name="mdi-check"
        color="accent"
        tooltip="Продолжить"
        @click="handleMultipleChoiceOk"
      />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import ServicePanelButton from '~/components/SmartTable/ServicePanelButton.vue';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';

export default defineComponent({
  name: 'ChoiceFilterPickerCard',
  components: {ServicePanelButton},
  props: {
    options: {
      type: Object,
      required: true,
    },
    values: {
      type: Array,
      default: () => {},
    },
    title: {
      type: String,
    },
  },
  setup(props, {emit}) {
    const currentValues = ref();

    const fields = computed(() => props.options?.choices || []);

    onMounted(() => {
      currentValues.value = props.values;
    });

    function handleMultipleChoiceOk() {
      emit('closeContext', {modalResult: ModalResult.Accepted, payload: currentValues.value});
    }

    return {
      currentValues,
      fields,
      handleMultipleChoiceOk,
    };
  },
});
</script>

<style scoped></style>
