<template>
  <v-dialog v-model="showDialog" persistent max-width="490">
    <v-card
      @keydown.enter.prevent="onCloseDialog(getDialogResult(true))"
      @keydown.esc.prevent="onCloseDialog(getDialogResult(false))"
    >
      <v-card-title>
        <span class="headline"> {{ headerStr || $t('smartTable.conf.viewName') }} </span>
      </v-card-title>

      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-text-field
                ref="firstFocus"
                :label="$t('common.name')"
                :value="editValue"
                :rules="[(value) => !!value || $t('common.required')]"
                @change="onChangeValue"
              />
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="green darken-1" text @click="onCloseDialog(getDialogResult(false))">
          {{ $t('common.close') }}
        </v-btn>

        <v-btn color="green darken-1" text @click="onCloseDialog(getDialogResult(true))">
          {{ $t('common.apply') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';

export default defineComponent({
  name: 'StringEditDialog',

  props: {
    showDialog: {
      type: Boolean,
      default: false,
    },
    onCloseDialog: {
      type: Function,
      default: () => {},
    },
    strValue: {
      type: String,
      required: false,
    },
    headerStr: {
      type: String,
      required: false,
    },
    inputMode: {
      type: Boolean,
      default: false,
    },
  },

  setup(props) {
    const root = getCurrentInstance().proxy;
    const firstFocus = ref();
    let changeValue = false;
    const editValue = ref<string>();

    watch(
      () => props.showDialog,
      (showDialog) => {
        changeValue = false;
        editValue.value = showDialog ? props.strValue : undefined;
        if (showDialog) {
          root.$nextTick(() => {
            if (firstFocus.value) {
              firstFocus.value.focus();
            }
          });
        }
      },
    );

    function onChangeValue(value: string) {
      changeValue = true;
      editValue.value = value;
    }

    function getDialogResult(accept: boolean) {
      return {
        modalResult:
          accept && (changeValue || props.inputMode) && editValue.value ? ModalResult.Accepted : ModalResult.Denied,
        payload: {strValue: editValue.value},
      };
    }

    return {
      firstFocus,
      editValue,
      onChangeValue,
      getDialogResult,
    };
  },
});
</script>

<style scoped></style>
