<template>
  <v-dialog
    v-model="showDialog"
    persistent
    max-width="490"
    @keydown.enter.prevent="onCloseDialog(getDialogResult(true))"
    @keydown.esc.prevent="onCloseDialog(getDialogResult(false))"
  >
    <v-card>
      <v-text-field
        ref="firstFocus"
        label="Значение"
        hint="Введите значение"
        type="number"
        validate-on-blur
        :value="strValue"
        @change="onChangeValue"
      />
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';

export default defineComponent({
  name: 'NumberEditDialog',

  props: {
    showDialog: {
      type: Boolean,
      default: false,
    },
    onCloseDialog: {
      type: Function,
      default: () => {},
    },
    initValue: {
      type: Number,
      required: false,
    },
  },

  setup(props) {
    const root = getCurrentInstance().proxy;
    const firstFocus = ref();
    let changeValue = false;
    const editValue = ref<number>();

    watch(
      () => props.showDialog,
      (showDialog) => {
        changeValue = false;
        editValue.value = showDialog ? props.initValue : undefined;
        if (showDialog) {
          root.$nextTick(() => {
            if (firstFocus.value) {
              firstFocus.value.focus();
            }
          });
        }
      },
    );

    const strValue = computed(() => {
      return editValue.value ? editValue.value.toFixed(2) : undefined;
    });

    function onChangeValue(value: string) {
      changeValue = true;
      editValue.value = Number(value);
    }

    function getDialogResult(accept: boolean) {
      return {
        modalResult: accept && changeValue && editValue.value !== undefined ? ModalResult.Accepted : ModalResult.Denied,
        payload: {editValue: editValue.value},
      };
    }

    return {
      firstFocus,
      strValue,
      onChangeValue,
      getDialogResult,
    };
  },
});
</script>

<style scoped></style>
