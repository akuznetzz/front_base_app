import assert from 'assert';
import {HTTP_200_OK, httpGet, httpPost} from '~/framework/httpRequest';
import common from '~/components/SmartTable/common';
import {buildDRestResponse} from '~/components/SmartTable/DRestResponse';
import {contentTypeToApiModelMap} from '~/common/dispatcher';
import {openTableCard} from '~/framework/open-edit-card';
import {IDomainModel, IEntitySpec} from '~/framework/dbd/dbd-spec';
import {SettingsColumn, SettingsColumns, TableColumns, TableIncludes} from '~/components/SmartTable/columns-spec';
import {
  BaseViewField,
  BaseViewFields,
  BaseViewSettings, ContextViewParams,
  getFreshBaseViewSettings, getFreshContextViewParams,
  localeCacheBaseViewSettingsKey, localeCacheContextViewParamsKey,
  updateLocaleCacheBaseViewSettings, updateLocaleCacheContextViewParams,
} from '~/components/AdminBaseTable/base-table-view';
import {dateTimeStringToDTime, nowDateTime} from '~/common/date-conversion';
import {performDRestRequest, getModelByPrimaryKeyValue} from '~/common/drest-request';
import {buildSimpleFilter, Condition} from '~/common/filters';
import {fieldValueFromNumber} from '~/common/FieldValue';
import {warn} from '~/framework/messages';
import {DONT_HAVE_PERMISSION_TO_OPEN, AUTH_SIGN_URL} from '~/common/constants';
import {getAPIPath} from '~/common/urlUtils';
import {IncludesExcludes} from '~/common/includes';
import {AVAILABLE_ALL_BRANDS_ACTION_NAME, getAvailableAllBrands} from '~/common/all_brands_ability';
import {isRhuxCabinetUser} from '~/common/user-roles';

export function genericForeignKeyReferenceHelper(
  modelName: string,
  primaryKeyName: string,
  projectName?: string,
  refIdKeyName?: string,
  refContentTypeName?: string,
) {
  async function getGenericForeignKey(row: any) {
    if (!refIdKeyName || !refContentTypeName) {
      return {foreignTableName: null, foreignPrimaryKey: null};
    }
    const primaryKeyValue = Number(row[primaryKeyName]);
    const response = await httpGet(
      common.createUrlWithIncludes(`${projectName}/${modelName}/${primaryKeyValue}`, [refContentTypeName]),
    );
    const dRestResponse = buildDRestResponse(response.data, `${projectName}`);
    assert.ok(dRestResponse.mainModels.length === 1);
    const tableModel = dRestResponse.mainModels[0];
    const foreignTableTypeModel = dRestResponse.relatedModels
      .checkedGet('contenttypes')
      .checkedGet(tableModel[refContentTypeName!]);
    return {
      foreignTableName: contentTypeToApiModelMap.get(foreignTableTypeModel['model']),
      foreignPrimaryKey: tableModel[refIdKeyName],
    };
  }

  async function onCellReferenceMarkEvent(row: any, event?: any) {
    let tableName;
    let primaryKeyValue;
    if (!refIdKeyName || !refContentTypeName) {
      tableName = modelName;
      primaryKeyValue = row[primaryKeyName];
    } else {
      ({foreignTableName: tableName, foreignPrimaryKey: primaryKeyValue} = await getGenericForeignKey(row));
    }
    if (tableName && primaryKeyValue) {
      await openTableCard(tableName, primaryKeyValue, undefined, event || false);
    }
  }

  return onCellReferenceMarkEvent;
}

export function primaryKeyReferenceHelper(modelName: string, primaryKeyName: string) {
  async function onCellReferenceMarkEvent(row: any, event?: any) {
    if (!Number(row[primaryKeyName])) {
      return
    }
    await openTableCard(modelName, Number(row[primaryKeyName]), undefined, event || false);
  }

  return onCellReferenceMarkEvent;
}

export function primaryKeyReferenceHelperWithPermission(
  modelName: string,
  primaryKeyName: string,
  permissionModel: string,
  permissionPK: string,
  permissionField: string,
  props?: object,
) {
  async function onCellReferenceMarkEvent(row: any, event?: any) {
    try {
      const dRestResponse = await getModelByPrimaryKeyValue(
        // @ts-ignore $domainModel
        window.$nuxt.$domainModel,
        permissionModel,
        Number(row[permissionPK]),
      );
      if (dRestResponse[permissionField]) {
        await openTableCard(modelName, Number(row[primaryKeyName]), props, event || false);
      } else {
        warn(DONT_HAVE_PERMISSION_TO_OPEN);
      }
    } catch {
      warn(DONT_HAVE_PERMISSION_TO_OPEN);
    }
  }

  return onCellReferenceMarkEvent;
}

export function multiTableReferenceHelper(parentModelName: string, primaryKeyName: string) {
  async function getMultiTableName(primaryKeyValue: number) {
    if (!primaryKeyValue) {
      return null;
    }
    const res = await httpPost('get-multi-table-heir-name/', {id: primaryKeyValue, parent_model_name: parentModelName});
    if (res.status !== HTTP_200_OK) {
      return null;
    }
    return res.data;
  }

  async function onCellReferenceMarkEvent(row: any, event?: any) {
    const primaryKeyValue = +row[primaryKeyName];
    const tableName = await getMultiTableName(primaryKeyValue);
    if (tableName && primaryKeyValue) {
      await openTableCard(tableName, primaryKeyValue, undefined, event || false);
    }
  }

  return onCellReferenceMarkEvent;
}

export function urlReferenceHelper(tableName: string, urlFieldName: string, primaryKeyName: string = 'id') {
  async function onCellReferenceMarkEvent(row: any) {
    const dRestResponse = await performDRestRequest(
      // @ts-ignore $domainModel
      window.$nuxt.$domainModel,
      tableName,
      {
        filters: [buildSimpleFilter(primaryKeyName, Condition.Equals, fieldValueFromNumber(row[primaryKeyName]))],
      },
    );
    const url_str = dRestResponse.mainModels.length > 0 ? dRestResponse.mainModels[0][urlFieldName] : undefined;
    if (url_str) {
      window.open(url_str, '_blank');
    } else {
      warn('Url не указан.');
    }
  }

  return onCellReferenceMarkEvent;
}

export function urlFieldReferenceHelper(urlFieldName: string) {
  function onCellReferenceMarkEvent(row: any) {
    const url_str = row[urlFieldName];
    if (url_str) {
      window.open(url_str, '_blank');
    }
  }
  return onCellReferenceMarkEvent;
}

export function genericForeignKeyHelper(
  modelName: string,
  primaryKeyName: string,
  refInclude: string,
  refModelName: string,
) {
  async function onCellReferenceMarkEvent(row: any, event?: any) {
    const dRestResponse = await performDRestRequest(
      // @ts-ignore $domainModel
      window.$nuxt.$domainModel,
      modelName,
      {
        includes: [refInclude],
        filters: [buildSimpleFilter(primaryKeyName, Condition.Equals, fieldValueFromNumber(row[primaryKeyName]))],
      },
    );
    if (!dRestResponse.relatedModels.has(refModelName)) return;
    const primaryKeyValue = dRestResponse.relatedModels.checkedGet(refModelName).entries().next().value[0];
    await openTableCard(refModelName, primaryKeyValue, undefined, event || false);
  }

  return onCellReferenceMarkEvent;
}

async function doBuildColumns(
  domainModel: IDomainModel,
  columns: SettingsColumns,
  includes: TableIncludes,
  entitySpec: IEntitySpec,
  parentFieldName: string = '',
): Promise<void> {
  for (const [fieldName, fieldSpec] of entitySpec.fieldSpecs.entries()) {
    if (fieldSpec.type == 'many' || fieldSpec.type == 'file upload') {
      continue;
    }
    const column = {field: parentFieldName ? parentFieldName + '.' + fieldName : fieldName};
    columns.push(column);
    if (fieldSpec.related_to && includes.includes(column.field)) {
      await doBuildColumns(
        domainModel,
        columns,
        includes,
        await domainModel.getEntitySpec(fieldSpec.related_to),
        column.field,
      );
    }
  }
}

async function buildColumns(
  domainModel: IDomainModel,
  tableName: string,
  includes: TableIncludes,
): Promise<SettingsColumns> {
  const columns: SettingsColumns = [];
  await doBuildColumns(domainModel, columns, includes, await domainModel.getEntitySpec(tableName));
  return columns;
}

function emptyArray(tstArray: Array<any> = []) {
  return tstArray.length === 0;
}

interface CacheBaseView {
  update_dtime: string;
  base_view: BaseViewSettings;
}

interface CacheContextViewParams {
  update_dtime: string;
  view_params: ContextViewParams;
}

async function tryGetBaseViewSettings(domainModel: IDomainModel, user_uid: string, tableName: string) {
  let freshBaseViewSettingsTxt;
  const localeCacheSettingsTxt = localStorage.getItem(localeCacheBaseViewSettingsKey(user_uid, tableName));
  if (localeCacheSettingsTxt) {
    const jsonLocaleCacheSettings = JSON.parse(localeCacheSettingsTxt) as CacheBaseView;
    const updateDTime = dateTimeStringToDTime(jsonLocaleCacheSettings.update_dtime);
    if (nowDateTime().diff(updateDTime) < 3600000) {
      return jsonLocaleCacheSettings.base_view;
    }
    freshBaseViewSettingsTxt = await getFreshBaseViewSettings(
      domainModel,
      tableName,
      jsonLocaleCacheSettings.update_dtime,
    );
    if (!freshBaseViewSettingsTxt) {
      updateLocaleCacheBaseViewSettings(user_uid, tableName, jsonLocaleCacheSettings.base_view);
      return jsonLocaleCacheSettings.base_view;
    }
  } else {
    freshBaseViewSettingsTxt = await getFreshBaseViewSettings(domainModel, tableName);
  }
  const resBaseViewSettings = freshBaseViewSettingsTxt ? JSON.parse(freshBaseViewSettingsTxt) : {available_fields: []};
  updateLocaleCacheBaseViewSettings(user_uid, tableName, resBaseViewSettings);
  return resBaseViewSettings;
}

async function tryGetContextViewParams(domainModel: IDomainModel, user_uid: string, tableName: string, context='') {
  let freshContextViewParamsTxt;
  const localeContextViewParamsTxt = localStorage.getItem(localeCacheContextViewParamsKey(user_uid, tableName, context));
  if (localeContextViewParamsTxt) {
    const jsonLocaleContextViewParams = JSON.parse(localeContextViewParamsTxt) as CacheContextViewParams;
    const updateDTime = dateTimeStringToDTime(jsonLocaleContextViewParams.update_dtime);
    if (nowDateTime().diff(updateDTime) < 3600000) {
      return jsonLocaleContextViewParams.view_params;
    }
    freshContextViewParamsTxt = await getFreshContextViewParams(
      domainModel,
      tableName,
      context,
      jsonLocaleContextViewParams.update_dtime,
    );
    if (!freshContextViewParamsTxt) {
      updateLocaleCacheContextViewParams(user_uid, tableName, context, jsonLocaleContextViewParams.view_params);
      return jsonLocaleContextViewParams.view_params;
    }
  } else {
    freshContextViewParamsTxt = await getFreshContextViewParams(domainModel, tableName, context);
  }
  const resContextViewParams = freshContextViewParamsTxt ? JSON.parse(freshContextViewParamsTxt) : {};
  updateLocaleCacheContextViewParams(user_uid, tableName, context, resContextViewParams);
  return resContextViewParams;
}

export async function getBaseViewAvailableFields(
  domainModel: IDomainModel,
  tableName: string,
  user: any,
  settingsColumns: SettingsColumns,
  includes: TableIncludes,
) {
  const baseAvailableFields = (await tryGetBaseViewSettings(domainModel, user.email, tableName))[
    'available_fields'
  ] as SettingsColumns;
  if (emptyArray(settingsColumns) && emptyArray(baseAvailableFields)) {
    return await buildColumns(domainModel, tableName, includes);
  }
  if (emptyArray(settingsColumns)) {
    return baseAvailableFields.filter((availableField) => availableField.kind !== 'manual');
  }
  if (emptyArray(baseAvailableFields)) {
    return settingsColumns;
  }

  let viewAvailableFields: SettingsColumns;
  const settingsIdColumn = settingsColumns.find((settingColumn) => settingColumn.field === 'id');
  if (settingsIdColumn) {
    if (settingsIdColumn.kind === 'only_from_code') {
      return settingsColumns;
    }
    viewAvailableFields = baseAvailableFields
      .filter((baseField) => settingsColumns.some((settingColumn) => settingColumn.field === baseField.field))
      .map((baseField) => {
        const settingColumn = settingsColumns.find((settingColumn) => settingColumn.field === baseField.field);
        return Object.assign({}, baseField, settingColumn ?? {});
      });
    viewAvailableFields = [
      ...viewAvailableFields,
      ...settingsColumns
        .filter((settingColumn) => viewAvailableFields.every((viewField) => viewField.field !== settingColumn.field))
        .filter((settingColumn) => !!settingColumn.value || !!settingColumn.action || !!settingColumn.extra),
    ];
  } else {
    viewAvailableFields = baseAvailableFields
      .filter(
        (baseField) =>
          baseField.kind !== 'manual' ||
          settingsColumns.find((settingColumn) => settingColumn.field === baseField.field),
      )
      .map((baseField) => {
        const settingColumn = settingsColumns.find((settingColumn) => settingColumn.field === baseField.field);
        return Object.assign({}, baseField, settingColumn ?? {});
      });
    if (!isRhuxCabinetUser()) {
      viewAvailableFields = [
        ...viewAvailableFields,
        ...settingsColumns.filter((settingColumn) =>
          viewAvailableFields.every((viewField) => viewField.field !== settingColumn.field),
        ),
      ];
    }
  }

  return viewAvailableFields.length > 0 ? viewAvailableFields : [{field: 'id'}];
}

export async function applyContextsViewParams(
  domainModel: IDomainModel,
  tableName: string,
  user_uid: string,
  availableColumns: SettingsColumns,
) {
  let resAvailableColumns: SettingsColumns = availableColumns;
  if (!getAvailableAllBrands()) {
    const excludedFields = (await tryGetContextViewParams(domainModel, user_uid, tableName, `not_${AVAILABLE_ALL_BRANDS_ACTION_NAME}`))[
      'excluded_fields'
    ] as BaseViewFields;
    if (excludedFields && excludedFields.length > 0) {
      resAvailableColumns = resAvailableColumns.filter(
        (avColumn: SettingsColumn) => !excludedFields.find(
          (excludedField: BaseViewField) => avColumn.field === excludedField.field || avColumn.field.startsWith(`${excludedField.field}.`)
        )
      )
    }
  }
  return resAvailableColumns;
}

export async function getViewAvailableFields(
  domainModel: IDomainModel,
  tableName: string,
  user: any,
  settingsColumns: SettingsColumns,
  includes: TableIncludes,
) {
  let res = await getBaseViewAvailableFields(domainModel, tableName, user, settingsColumns, includes);
  res = await applyContextsViewParams(domainModel, tableName, user.email, res);
  return res;
}

export function getDefaultTableViewDescr() {}

export function getViewIncludes(viewAvailableFields: SettingsColumns, settingsIncludes: TableIncludes = []) {
  const includesSet: Set<string> = new Set();
  viewAvailableFields.forEach((viewField) => {
    if (!viewField.notIncluding) {
      const lastDotIdx = viewField.field.lastIndexOf('.');
      if (lastDotIdx > 0) {
        includesSet.add(viewField.field.substring(0, lastDotIdx));
      }
    }
  });
  settingsIncludes.forEach((includeName) => includesSet.add(includeName));

  return [...includesSet];
}

export function getIncludesExcludes(shownColumnNames: string[], allColumns: TableColumns): IncludesExcludes {
  let includesSet: Set<string> = new Set(['id']);
  let excludesSet: Set<string> = new Set();

  function addToIncludesSet(includeName: string) {
    if ([...includesSet].find((setName) => setName.startsWith(`${includeName}.`))) return;
    let columnNamePart = includeName;
    let lastDotIdx = includeName.lastIndexOf('.');
    while (lastDotIdx > 0) {
      columnNamePart = columnNamePart.substring(0, lastDotIdx);
      includesSet.delete(columnNamePart);
      lastDotIdx = columnNamePart.lastIndexOf('.');
    }
    includesSet.add(includeName);
  }

  function procColumnName(columnName: string) {
    addToIncludesSet(columnName);
    let columnNamePart = columnName;
    let lastDotIdx = columnName.lastIndexOf('.');
    while (lastDotIdx > 0) {
      columnNamePart = columnNamePart.substring(0, lastDotIdx);
      excludesSet.add(columnNamePart);
      addToIncludesSet(`${columnNamePart}.id`);
      lastDotIdx = columnNamePart.lastIndexOf('.');
    }
  }

  shownColumnNames.forEach((columnName) => {
    const tableColumn = allColumns.find((tableColumn) => tableColumn.field === columnName);
    const columnExtra = tableColumn?.extra;
    if (!columnExtra?.notIncluding) {
      procColumnName(columnName);
    }
    const dopIncludes: TableIncludes = columnExtra?.dopIncludes;
    if (dopIncludes) {
      dopIncludes.forEach((dopColumnName) => {
        procColumnName(dopColumnName);
      })
    }
  });

  return {includes: [...includesSet], excludes: [...excludesSet]};
}

export function openDirectLink(link: string, primaryKeyName: string, openInNewTab: boolean = true) {
  async function onCellReferenceMarkEvent(row: any) {
    const key: string = (await httpPost(AUTH_SIGN_URL, {url: `${link}/${row[primaryKeyName]}`})).data;
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = `${getAPIPath()}${link}/${row[primaryKeyName]}?key=${key}`;
    if (openInNewTab) {
      anchor.target = '_blank';
    }
    anchor.click();
  }

  return onCellReferenceMarkEvent;
}
