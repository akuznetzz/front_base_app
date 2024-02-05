<template>
  <v-form v-if="dataSource" ref="form" lazy-validation>
    <v-card tabindex="0" @focusout="handleFocusOut">
      <edit-frame ref="editFrame" :field="editField" />
    </v-card>
  </v-form>
</template>

<script lang="ts">
import {ContinueBlockEdit} from './block-edit-spec';
import {DataSource} from '~/framework/data-source';
import EditFrame from '~/framework/edit-frame/edit-frame.vue';
import {saveCardFrameDataEventId, SaveCardFrameDataParameters} from '~/framework/edit-card/standard-edit-card-frame.ts';
import {sendEvent} from '~/framework/core/enhanced-delegation';
import {getEntityPrimaryKey} from '~/common/settings';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';

export default defineComponent({
  name: 'BlockEditCard',

  components: {
    EditFrame,
  },

  props: {
    smartTable: {
      type: Object as any,
      required: true,
    },
    tableGrid: {
      type: Object as any,
    },
    dataSource: {
      type: Object as PropType<DataSource>,
    },
    fieldName: {
      type: String,
      required: true,
    },
  },

  setup(props, {emit}) {
    const form = ref<any>(null);
    const editFrame = ref<any>(null);
    let continueEdit = ContinueBlockEdit.None;
    let cardClosed = false;
    let leftCell = false;
    const editField = computed(() => (props.dataSource ? props.dataSource.fieldByName(props.fieldName) : undefined));

    function handleFocusOut() {
      if (!cardClosed) {
        leftCell = true;
        closeCard(false);
      }
    }

    function onKeyDown(e: any) {
      if (e.key === 'Enter') {
        e.preventDefault();
        continueEdit = ContinueBlockEdit.None;
        saveAndClose();
      } else if (e.key === 'Tab') {
        continueEdit = e.shiftKey ? ContinueBlockEdit.PrevField : ContinueBlockEdit.NextField;
        cardClosed = true;
        setTimeout(() => {
          saveAndClose();
        }, 0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        continueEdit = ContinueBlockEdit.None;
        closeCard(false);
      }
    }

    onMounted(() => {
      window.addEventListener('keydown', onKeyDown);
      setTimeout(() => {
        const elemets = editFrame.value.$el.getElementsByTagName('input');
        if (elemets.length > 0) {
          elemets[0].focus();
        } else {
          editFrame.value.$el.focus();
        }
      }, 0);
    });

    onUnmounted(() => {
      window.removeEventListener('keydown', onKeyDown);
    });

    function closeCard(accept = false) {
      cardClosed = true;
      const primaryKeyField = props.dataSource!.fieldByName(getEntityPrimaryKey(props.dataSource!.entityName));
      const primaryKey = primaryKeyField.hasValue ? primaryKeyField.asNumber() : null;
      const payload =
        accept && continueEdit ? {primaryKey, continueEdit} : leftCell ? {primaryKey, leftCell} : {primaryKey};
      emit('closeCard', {modalResult: accept ? ModalResult.Accepted : ModalResult.Denied, payload});
    }

    async function defaultSaveCardFrameData() {
      if (props.dataSource && props.dataSource.changed) {
        await props.dataSource.save();
      }
    }

    async function saveData() {
      const parameters: SaveCardFrameDataParameters = {};
      await sendEvent(props.smartTable.instance, saveCardFrameDataEventId, parameters, defaultSaveCardFrameData);
    }

    async function saveAndClose() {
      if (form.value!.validate() && props.dataSource!.validate()) {
        await saveData();
        closeCard(true);
      }
    }

    return {
      form,
      editFrame,
      editField,
      handleFocusOut,
    };
  },
});
</script>

<style scoped></style>
