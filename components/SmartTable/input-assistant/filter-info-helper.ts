import {IEntitySpec} from '~/framework/dbd/dbd-spec';
import {buildDataSource} from '~/framework/data-source';
import {fieldValueFromNumber, fieldValueFromString} from '~/common/FieldValue';
import {performDelete, performDRestRequest} from '~/common/drest-request';
import {buildSimpleFilter, Condition} from '~/common/filters';
import {SortDirection} from '~/common/sorts';

const flterInfoTableName = 'namedfilters';
const nameUserField = 'user';
const nameTableTypeField = 'table_type';
const nameContextField = 'context';
const nameFilterNameField = 'name';
const nameFilterBodyField = 'view_text';

export interface RelatedFilterInfo {
  id: number;
  name: string;
  body?: string;
}

export function filterInfoHelper(ownTableSpec: IEntitySpec, user_id?: number) {
  const root = getCurrentInstance().proxy;
  const domainModel = (root as any).$domainModel;
  let filterInfoTableSpec: IEntitySpec;
  const ownTableContentTypeId = ownTableSpec.options!.content_type_id;

  onMounted(async () => {
    filterInfoTableSpec = await domainModel.getEntitySpec(flterInfoTableName);
  });

  async function loadRelatedFilterInfoList(context?: string) {
    const resFilterInfoRequest = await performDRestRequest(domainModel, flterInfoTableName, {
      filters: [
        buildSimpleFilter(nameUserField, Condition.Equals, fieldValueFromNumber(user_id || 0)),
        buildSimpleFilter(nameTableTypeField, Condition.Equals, fieldValueFromNumber(ownTableContentTypeId)),
        buildSimpleFilter(nameContextField, Condition.Equals, fieldValueFromString(context || '')),
      ],
      sorts: [{field: nameFilterNameField, direction: SortDirection.Ascending}],
    });

    return resFilterInfoRequest.mainModels.map((model) => {
      return {
        id: model['id'],
        name: model[nameFilterNameField],
        body: model[nameFilterBodyField],
      };
    });
  }

  async function buildFieldFiltersList(fieldName: string) {
    const res = await loadRelatedFilterInfoList(fieldName);
    res.forEach((filterInfo) => {
      if (filterInfo.body) {
        const jsonBody = JSON.parse(filterInfo.body);
        if (jsonBody instanceof Array) {
          const fieldFilter = jsonBody.find((filterItem) => filterItem.field === fieldName);
          if (fieldFilter) {
            filterInfo.body = fieldFilter.value;
          } else {
            filterInfo.body = '';
          }
        } else {
          filterInfo.body = jsonBody.value;
        }
      }
    });
    return res;
  }

  async function saveNamedFilterInfoRec(id?: number, context?: string, name?: string, body?: string) {
    const dataSource = await buildDataSource(filterInfoTableSpec, id);
    if (!id) {
      if (user_id) {
        dataSource.fieldByName(nameUserField).value = fieldValueFromNumber(user_id);
      }
      dataSource.fieldByName(nameTableTypeField).value = fieldValueFromNumber(ownTableContentTypeId);
    }
    if (context) {
      dataSource.fieldByName(nameContextField).value = fieldValueFromString(context);
    }
    if (name) {
      dataSource.fieldByName(nameFilterNameField).value = fieldValueFromString(name);
    }
    if (body) {
      dataSource.fieldByName(nameFilterBodyField).value = fieldValueFromString(body);
    }
    await dataSource.save();
  }

  async function deleteNamedFilterInfoRec(id: number) {
    await performDelete(domainModel, flterInfoTableName, id);
  }

  async function addFieldFilterInfoRec(fieldName: string, name: string, filterValue: string) {
    const body = JSON.stringify({field: fieldName, value: filterValue});
    await saveNamedFilterInfoRec(undefined, fieldName, name, body);
  }

  return {buildFieldFiltersList, saveNamedFilterInfoRec, deleteNamedFilterInfoRec, addFieldFilterInfoRec};
}
