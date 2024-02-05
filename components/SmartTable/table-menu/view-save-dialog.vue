<template>
  <v-dialog v-model="showDialog" max-width="550" persistent>
    <v-card
      @keydown.enter.prevent="onCloseDialog(getDialogResult(true))"
      @keydown.esc.prevent="onCloseDialog(getDialogResult(false))"
    >
      <v-card-title>
        <span class="headline">{{ $t('smartTable.conf.saveView') }}</span>
      </v-card-title>

      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-text-field
                ref="firstFocus"
                :rules="[(value) => !!value || $t('common.required')]"
                :value="viewName"
                :label="$t('common.name')"
                @change="onChangeNameValue"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="6">
              <v-checkbox
                :false-value="false"
                :true-value="true"
                :value="saveFilters"
                color="success"
                :label="$t('smartTable.conf.saveFilters')"
                @change="onChangeSaveFilters"
              />
            </v-col>
            <v-col cols="6">
              <v-checkbox
                :false-value="false"
                :true-value="true"
                :value="saveSorts"
                color="success"
                :label="$t('smartTable.conf.saveSorts')"
                @change="onChangeSaveSorts"
              />
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="green darken-1" text @click="onCloseDialog(getDialogResult(false))">{{
          $t('common.close')
        }}</v-btn>

        <v-btn
          color="green darken-1"
          text
          @click="onCloseDialog(getDialogResult(true))"
          @keydown.enter="onCloseDialog(getDialogResult(true))"
        >
          {{ $t('common.apply') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';

export interface ViewSaveDialogParams {
  viewName?: string;
  saveFilters: boolean;
  saveSorts: boolean;
}

const StdViewSaveDialogParams: ViewSaveDialogParams = {
  viewName: undefined,
  saveFilters: false,
  saveSorts: true,
};

export default defineComponent({
  name: 'ViewSaveDialog',

  props: {
    showDialog: {
      type: Boolean,
      default: false,
    },
    onCloseDialog: {
      type: Function,
      default: () => {},
    },
    dialogParams: {
      type: Object as PropType<ViewSaveDialogParams>,
      default: () => StdViewSaveDialogParams,
    },
  },

  setup(props) {
    const root = getCurrentInstance().proxy;
    const firstFocus = ref();
    const viewName = ref();
    const saveFilters = ref(false);
    const saveSorts = ref(false);

    watch(
      () => props.showDialog,
      (showDialog) => {
        if (showDialog) {
          viewName.value = props.dialogParams.viewName;
          saveFilters.value = props.dialogParams.saveFilters;
          saveSorts.value = props.dialogParams.saveSorts;

          root.$nextTick(() => {
            if (firstFocus.value) {
              firstFocus.value.focus();
            }
          });
        } else {
          viewName.value = undefined;
          saveFilters.value = false;
          saveSorts.value = false;
        }
      },
    );

    function onChangeNameValue(value: string) {
      viewName.value = value;
    }

    function onChangeSaveFilters() {
      saveFilters.value = !saveFilters.value;
    }

    function onChangeSaveSorts() {
      saveSorts.value = !saveSorts.value;
    }

    function getDialogResult(accept: boolean) {
      return {
        modalResult: accept ? ModalResult.Accepted : ModalResult.Denied,
        payload: {viewName: viewName.value, saveFilters: saveFilters.value, saveSorts: saveSorts.value},
      };
    }

    return {
      firstFocus,
      viewName,
      saveFilters,
      saveSorts,
      onChangeNameValue,
      onChangeSaveFilters,
      onChangeSaveSorts,
      getDialogResult,
    };
  },
});
</script>

<style scoped></style>
