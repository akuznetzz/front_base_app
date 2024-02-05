<template>
  <div>
    <v-menu close-delay="500" left offset-y open-delay="500" open-on-hover>
      <template #activator="{on}">
        <v-btn :color="'primary'" class="mr-1" small v-on="on">
          <v-icon>mdi-cog-outline</v-icon>
        </v-btn>
      </template>
      <v-sheet rounded="true" style="overflow: hidden">
        <v-toolbar height="56px" style="padding-right: 20px" width="550px">
          <v-toolbar-title>{{ $t('smartTable.conf.view') }}</v-toolbar-title>
          <v-spacer />
          <v-tooltip v-if="editViewSettingsButton" top>
            <template #activator="{on}">
              <v-btn icon v-on="on">
                <v-icon @click="editViewSettings"> mdi-table-cog</v-icon>
              </v-btn>
            </template>
            {{ $t('smartTable.conf.customizeView') }}
          </v-tooltip>
          <v-tooltip v-if="autoWidthButton" top>
            <template #activator="{on}">
              <v-btn icon v-on="on">
                <v-icon @click="recalcColumnsWidth"> mdi-arrow-expand-horizontal</v-icon>
              </v-btn>
            </template>
            {{ $t('smartTable.conf.autoColumnWidth') }}
          </v-tooltip>
          <v-tooltip top>
            <template #activator="{on}">
              <v-btn icon v-on="on">
                <v-icon @click="saveUserView(currView ? currView.id : undefined)"> mdi-content-save-outline</v-icon>
              </v-btn>
            </template>
            {{ $t('common.save') + ' ' + (currView ? currView.name : $t('common.as')) }}
          </v-tooltip>
          <v-tooltip top>
            <template #activator="{on}">
              <v-btn icon v-on="on">
                <v-icon @click="applyDefaultView()"> mdi-auto-download </v-icon>
              </v-btn>
            </template>
            {{ $t('smartTable.conf.viewDefault') }}
          </v-tooltip>
        </v-toolbar>
        <v-divider aria-orientation="horizontal" />
        <v-responsive max-height="475px" min-height="250px" style="overflow-y: scroll">
          <v-list-item
            v-for="viewInfo in userViewsList"
            :key="viewInfo.id"
            role="menuitem"
            style="cursor: pointer; user-select: none"
          >
            <v-list-item-content>
              <v-list-item-title @click="applyUserView(viewInfo.id)">
                {{ viewInfo.name }}
              </v-list-item-title>
            </v-list-item-content>
            <v-list-item-action class="ml-0">
              <v-tooltip top>
                <template #activator="{on}">
                  <v-btn icon v-on="on">
                    <v-icon color="grey lighten-1" @click="saveUserView(viewInfo.id)">
                      mdi-content-save-outline
                    </v-icon>
                  </v-btn>
                </template>
                {{ `${$t('common.save')} ${viewInfo.name}` }}
              </v-tooltip>
            </v-list-item-action>
            <v-list-item-action class="ml-0">
              <v-tooltip top>
                <template #activator="{on}">
                  <v-btn icon v-on="on">
                    <v-icon color="grey lighten-1" @click="renameUserView(viewInfo.id)"> mdi-pencil-outline</v-icon>
                  </v-btn>
                </template>
                {{ `${$t('common.rename')} ${viewInfo.name}` }}
              </v-tooltip>
            </v-list-item-action>
            <v-list-item-action class="ml-0">
              <v-tooltip top>
                <template #activator="{on}">
                  <v-btn icon v-on="on">
                    <v-icon color="grey lighten-1" @click="delUserView(viewInfo)"> mdi-trash-can-outline</v-icon>
                  </v-btn>
                </template>
                {{ `${$t('common.delete')} ${viewInfo.name}` }}
              </v-tooltip>
            </v-list-item-action>
          </v-list-item>
        </v-responsive>
      </v-sheet>
    </v-menu>
    <string-edit-dialog :on-close-dialog="onCloseDialog" :show-dialog="showViewNameDialog" :str-value="valueViewName" />
    <view-settings-dialog
      :show-dialog="showViewSettingsDialog"
      :on-close-dialog="onCloseDialog"
      :table-name="smartTable.apiModel"
      :smart-table="smartTable"
    />
    <view-save-dialog
      :dialog-params="viewSaveDialogParams"
      :on-close-dialog="onCloseDialog"
      :show-dialog="showViewSaveDialog"
    />
  </div>
</template>

<script lang="ts">
import StringEditDialog from './string-edit-dialog.vue';
import ViewSaveDialog from './view-save-dialog.vue';
import {performDelete, performDRestRequest} from '~/common/drest-request';
import {buildSimpleFilter, Condition} from '~/common/filters';
import {fieldValueFromNumber, fieldValueFromString} from '~/common/FieldValue';
import {SortDirection} from '~/common/sorts';
import {DRestResponse} from '~/components/SmartTable/DRestResponse';
import {loadTableSettings} from '~/components/SmartTable/store';
import {buildDataSource} from '~/framework/data-source';
import {ModalResult} from '~/framework/workspace-manager/workspace-manager-spec';
import {tryGetDefaultTableViewDescr} from '~/components/SmartTable/default-table-view';
import ViewSettingsDialog from '~/components/AdminBaseTable/ViewSettings/view-settings-dialog.vue';

const userViewTableName = 'namedviews';
const nameUserField = 'user';
const nameTableTypeField = 'table_type';
const nameViewNameField = 'name';
const nameViewBodyField = 'view_text';
const GET_VIEWS_INFO_INTERVAL_MS = 30 * 1000;

const DummyOnCloseDialog = () => {};

export default defineComponent({
  name: 'UserViewSettings',

  components: {
    StringEditDialog,
    ViewSettingsDialog,
    ViewSaveDialog,
  },

  props: {
    editViewSettingsButton: {
      type: Boolean,
      default: true,
    },
    autoWidthButton: {
      type: Boolean,
      default: true,
    },
    sortSettingsButton: {
      type: Boolean,
      default: true,
    },
  },

  setup(props) {
    const root = getCurrentInstance().proxy;
    const smartTable = root.$parent.$parent;

    const domainModel = (window.$nuxt as any).$domainModel;
    const tableContentTypeId = ref(0);
    const userViewsList: Ref<any[]> = ref([]);
    const currView: any = ref();
    const showViewNameDialog = ref(false);
    const valueViewName = ref();
    const onCloseDialog: Ref<(e: any) => any> = ref(DummyOnCloseDialog);
    let intervalId: any;
    const showViewSettingsDialog = ref(false);
    const showViewSaveDialog = ref(false);
    const viewSaveDialogParams = ref();
    async function applyDefaultView() {
      const defaultView = await tryGetDefaultTableViewDescr(domainModel, smartTable.apiModel);
      if (defaultView && defaultView.columns) {
        smartTable.applyTableViewProps(defaultView, true);
      }
    }
    function applyUserView(id: number) {
      const viewInfo = userViewsList.value.find((element: any) => {
        return element.id === id;
      });
      if (viewInfo) {
        const viewJson = JSON.parse(viewInfo.body);
        smartTable.applyTableViewProps(viewJson);
        currView.value = viewInfo;
      }
    }
    async function saveUserViewRec(id?: number, name?: string, body?: string) {
      const dataSource = await buildDataSource(await domainModel.getEntitySpec(userViewTableName), id);
      if (!id) {
        dataSource.fieldByName(nameUserField).value = fieldValueFromNumber(<number>root.$nuxt.$auth.user?.id);
        dataSource.fieldByName(nameTableTypeField).value = fieldValueFromNumber(tableContentTypeId.value);
      }
      if (name) {
        dataSource.fieldByName(nameViewNameField).value = fieldValueFromString(name);
      }
      if (body) {
        dataSource.fieldByName(nameViewBodyField).value = fieldValueFromString(body);
      }
      await dataSource.save();
    }
    async function renameUserView(id: number) {
      const viewInfo = userViewsList.value.find((element: any) => {
        return element.id === id;
      });
      if (viewInfo) {
        const name = await getNameStr(viewInfo.name);
        if (name) {
          await saveUserViewRec(id, name);
          getUserViewsInfo();
        }
      }
    }
    function delUserView(viewInfo: any) {
      (root as any).$awn.confirm(
        `${root.$t('smartTable.conf.deleteView')} "${viewInfo.name}"?`,
        async () => {
          if (currView.value && currView.value.id === viewInfo.id) {
            currView.value = undefined;
          }
          await performDelete(domainModel, userViewTableName, viewInfo.id);
          getUserViewsInfo();
        },
        true,
        {
          labels: {
            confirmOk: root.$t('common.yes'),
            confirmCancel: root.$t('common.no'),
            confirm: root.$t('common.requireConfirmation'),
          },
        },
      );
    }
    async function getUserViewsInfo() {
      async function requestUserViews() {
        return await performDRestRequest(domainModel, userViewTableName, {
          filters: [
            buildSimpleFilter(nameUserField, Condition.Equals, fieldValueFromNumber(<number>root.$nuxt.$auth.user?.id)),
            buildSimpleFilter('table_type', Condition.Equals, fieldValueFromNumber(tableContentTypeId.value)),
          ],
          sorts: [{field: 'name', direction: SortDirection.Ascending}],
        });
      }
      function formUserViewsList(reqResponse: DRestResponse) {
        function formViewInfo(model: any) {
          return {
            id: model['id'],
            name: model['name'],
            body: model['view_text'],
          };
        }
        return reqResponse.mainModels.map((model) => formViewInfo(model));
      }
      userViewsList.value = formUserViewsList(await requestUserViews());
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
    function isViewNameDialogAccepted(result: any): boolean {
      return result && result.modalResult === ModalResult.Accepted && result.payload;
    }
    async function getNameStr(name?: string) {
      valueViewName.value = name;
      const result: any = await execDialog((on: boolean) => (showViewNameDialog.value = on));
      return isViewNameDialogAccepted(result) ? result.payload.strValue : undefined;
    }
    onMounted(async () => {
      const tableSpec = await domainModel.getEntitySpec(smartTable.apiModel);
      tableContentTypeId.value = tableSpec.options!.content_type_id;
      getUserViewsInfo();
      intervalId = setInterval(async () => {
        await getUserViewsInfo();
      }, GET_VIEWS_INFO_INTERVAL_MS);
    });
    onUnmounted(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    });
    async function editViewSettings() {
      const result: any = await new Promise((resolve) => {
        showViewSettingsDialog.value = true;
        onCloseDialog.value = (e: any) => {
          showViewSettingsDialog.value = false;
          resolve(e);
        };
      });
      onCloseDialog.value = DummyOnCloseDialog;
      if (result && result.modalResult === ModalResult.Accepted && result.payload?.tableViewSettings) {
        smartTable.applyUserTableViewProps(result.payload.tableViewSettings);
      }
    }
    async function saveUserView(id?: number) {
      viewSaveDialogParams.value = {viewName: undefined, saveFilters: false, saveSorts: true};
      if (id) {
        const viewInfo = userViewsList.value.find((element: any) => element.id === id);
        if (viewInfo) {
          viewSaveDialogParams.value.viewName = viewInfo.name;
        }
      }
      const result: any = await execDialog((on: boolean) => (showViewSaveDialog.value = on));
      if (isViewNameDialogAccepted(result) && result.payload.viewName) {
        async function execSave() {
          const viewJson = loadTableSettings(smartTable.apiModel, smartTable.contextId);
          if (viewJson) {
            if (!result.payload.saveFilters) {
              delete viewJson.filters;
            }
            if (!result.payload.saveSorts) {
              delete viewJson.sorts;
            }
            await saveUserViewRec(saveId, result.payload.viewName, JSON.stringify(viewJson));
            await getUserViewsInfo();
          }
        }
        const saveId: number | undefined =
          result.payload.viewName === viewSaveDialogParams.value.viewName ? id : undefined;
        if (id && result.payload.viewName === viewSaveDialogParams.value.viewName) {
          (root as any).$awn.confirm(`Заменить представление "${result.payload.viewName}"?`, execSave);
        } else {
          await execSave();
        }
      }
      viewSaveDialogParams.value = undefined;
    }
    function recalcColumnsWidth() {
      smartTable.onRecalcColumnsWidthClick();
    }
    return {
      tableContentTypeId,
      userViewsList,
      currView,
      delUserView,
      renameUserView,
      saveUserView,
      applyDefaultView,
      applyUserView,
      showViewNameDialog,
      valueViewName,
      onCloseDialog,
      editViewSettings,
      showViewSettingsDialog,
      showViewSaveDialog,
      viewSaveDialogParams,
      recalcColumnsWidth,
      smartTable,
    };
  },
});
</script>

<style scoped></style>
