import {getEntityPrimaryKey} from '~/common/settings';
import {CheckedReadonlyMap, CheckedReadonlyMapImpl} from '~/common/CheckedReadonlyMap';
import {assertIsDefined} from '~/common/assertions';

// the field value type is unknown right now, maybe it will be something richer in the future
export type FieldValue = any;

export interface Model {
  readonly [fieldName: string]: FieldValue;
}

export type Models = ReadonlyArray<Model>;

export interface DRestMeta {
  readonly total_results: number;
  readonly total_pages: number;
  readonly page: number;
  readonly per_page: number;
}

export type ModelsById = CheckedReadonlyMap<FieldValue, Model>;
export type RelatedModels = CheckedReadonlyMap<string, ModelsById>;

export interface DRestResponse {
  readonly mainModels: Models;
  readonly relatedModels: RelatedModels;
  readonly meta: DRestMeta;
}

export function buildDRestResponse(response: any, mainModelName: string): DRestResponse {
  return new DRestResponseImpl(response, mainModelName);
}

class DRestResponseImpl implements DRestResponse {
  readonly mainModels: Models;
  readonly meta: DRestMeta;
  readonly relatedModels = new CheckedReadonlyMapImpl<string, ModelsById>();

  constructor(response: any, mainModelName: string) {
    this.mainModels = response[mainModelName];
    assertIsDefined(this.mainModels, `No "${mainModelName}" key defined in DynamicREST response`);
    if (!Array.isArray(this.mainModels)) {
      // in case of single model response
      this.mainModels = [this.mainModels];
    }
    this.meta = response.meta;
    for (const key in response) {
      if (key !== mainModelName && key !== 'meta') {
        this.relatedModels.set(key, DRestResponseImpl.relatedModelsToMap(key, response[key]));
      }
    }
  }

  private static relatedModelsToMap(modelName: string, relatedModels: Models): ModelsById {
    const result = new CheckedReadonlyMapImpl<FieldValue, Model>();
    const primaryKeyName = getEntityPrimaryKey(modelName);
    for (const relatedModel of relatedModels) {
      result.set(relatedModel[primaryKeyName], relatedModel);
    }
    return result;
  }
}
