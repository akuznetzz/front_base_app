import * as assert from 'assert';
import {DataSourceParam} from 'cheetah-grid/data/DataSource';
import {
  buildDRestResponse,
  DRestResponse,
  FieldValue,
  Model,
  RelatedModels,
} from '~/components/SmartTable/DRestResponse';
import {getFieldSpec} from '~/common/domain-model';
import {HTTP_ERROR, httpGet} from '~/framework/httpRequest';
import {getEntityPrimaryKey} from '~/common/settings';
import {
  dateTimeToDateTimeString,
  dateToDateString,
  isoStringToDateTime,
  isoStringToDateTimeWithoutTZ,
} from '~/common/date-conversion';
import {IDomainModel} from '~/framework/dbd/dbd-spec';
import {error} from '~/framework/messages';
import {AbortAction} from '~/common/abort-action';
import {sendEvent} from '~/framework/core/enhanced-delegation';

export const ROWS_SELECTION_FIELD = '$rows_selection_field$';

export interface Row {
  [fieldName: string]: any;
}

class RowImpl implements Row {}

type Page = Array<Row>;

interface Column {
  field: string;
  type: string;
  value?(model: Model, relatedModels: RelatedModels): FieldValue;
}

type TotalRecordCountCallback = (totalRecordCount: number) => void;

export type PerformRequestCallback = (pageNumber: number, pageSize: number) => Promise<DRestResponse>;

interface PagesCache {
  get(pageNumber: number): Page | undefined;

  getAll(): Page[];

  set(pageNumber: number, page: Page): void;

  replaceRow(row: Row, primaryKeyFieldName: string): boolean;
}

type PageWithCounter = {page: Page; counter: number};

class PagesCacheImpl implements PagesCache {
  private readonly pageCount: number;
  private readonly pagesMap = new Map<number, PageWithCounter>();
  private readonly pageSize: number;

  constructor(pageCount: number, pageSize: number) {
    this.pageCount = pageCount;
    this.pageSize = pageSize;
  }

  get(pageNumber: number): Page | undefined {
    const pageWithCounter = this.pagesMap.get(pageNumber);
    if (pageWithCounter) {
      pageWithCounter.counter++;
      this.pagesMap.forEach((value, key) => {
        if (key !== pageNumber) {
          value.counter--;
        }
      });
    }
    return pageWithCounter?.page;
  }

  getAll(): Page[] {
    return Array.from(this.pagesMap.values()).map((pageWithCounter) => pageWithCounter.page);
  }

  set(pageNumber: number, page: Page): void {
    if (this.pagesMap.size === this.pageCount) {
      this.removeLeastRecentlyUsedPage();
    }
    this.pagesMap.set(pageNumber, {page, counter: 0});
  }

  private removeLeastRecentlyUsedPage() {
    const [key] = Array.from(this.pagesMap.entries()).reduce((previous, current) =>
      previous[1].counter < current[1].counter ? previous : current,
    );
    this.pagesMap.delete(key);
  }

  replaceRow(row: Row, primaryKeyFieldName: string): boolean {
    for (const value of this.pagesMap.values()) {
      const page = value.page;
      for (let i = 0; i < page.length; i++) {
        if (page[i][primaryKeyFieldName] === row[primaryKeyFieldName]) {
          page[i] = row;
          return true;
        }
      }
    }
    return false;
  }
}

type FieldValueSet = Set<FieldValue>;

/**
 * Searches the sorted array for the item
 *
 * @param array sorted array
 * @param item searched item
 * @return index of the searched item in the array if the item is found or index *before* the index where the searched
 * item should be
 */
function binarySearch<T>(array: T[], item: T): number {
  let left = 0;
  let right = array.length - 1;
  while (left <= right) {
    const mid = Math.floor((right + left) / 2);
    if (array[mid] === item) {
      return mid;
    } else if (array[mid] < item) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return left < right ? left : right;
}

export const dataNeedsToReloaded = Symbol('dataNeedsToReloaded');

export class CGridDataSourceCache implements DataSourceParam<Promise<Row>> {
  private readonly PAGE_SIZE: number = 10;
  length: number;
  private readonly columns: ReadonlyArray<Column>;
  private readonly domainModel: IDomainModel;
  private readonly pagesCache: PagesCache = new PagesCacheImpl(10, this.PAGE_SIZE);
  private readonly modelName: string;
  private _totalRecordCountCallback?: TotalRecordCountCallback;
  private readonly _performRequestCallback: PerformRequestCallback;
  private readonly pagePromisesMap: Map<number, Promise<Page>> = new Map();
  private _selectedRows?: FieldValueSet;
  private addedRowsMap = new Map<number, Row>();
  private addedRowNumbers = new Array<number>();
  private awaitPagePromiseCount = 0;
  private pageNotFoundStatus = false;

  constructor(
    domainModel: IDomainModel,
    modelName: string,
    performRequestCallback: PerformRequestCallback,
    columns: ReadonlyArray<Column>,
    totalCount: number,
  ) {
    this.columns = columns;
    this.domainModel = domainModel;
    this.length = totalCount;
    this.modelName = modelName;
    this._performRequestCallback = performRequestCallback;
  }

  setSelectedRows(rows: FieldValueSet) {
    this._selectedRows = rows;
    for (const page of this.pagesCache.getAll()) {
      for (const row of page) {
        this.setRowSelectionField(row);
      }
    }
  }

  setTotalRecordCountCallback(totalRecordCountCallback: TotalRecordCountCallback) {
    this._totalRecordCountCallback = totalRecordCountCallback;
  }

  async get(index: number): Promise<Row> {
    if (this.pageNotFoundStatus) {
      return new RowImpl();
    }
    // we need to take into account added rows if any
    let addedRowsCountBeforeIndex = 0;
    const addedRow = this.addedRowsMap.get(index);
    if (addedRow) {
      return addedRow;
    } else if (this.addedRowsMap.size > 0) {
      addedRowsCountBeforeIndex = binarySearch(this.addedRowNumbers, index) + 1;
    }
    const indexWithoutAddedRows = index - addedRowsCountBeforeIndex;
    const pageNumber = Math.floor(indexWithoutAddedRows / this.PAGE_SIZE);
    let page = this.pagesCache.get(pageNumber);
    if (!page) {
      let pagePromise = this.pagePromisesMap.get(pageNumber);
      if (!pagePromise) {
        pagePromise = this.getPage(pageNumber);
        this.pagePromisesMap.set(pageNumber, pagePromise);
      }
      try {
        this.awaitPagePromiseCount += 1;
        page = await pagePromise;
      } catch (e) {
        this.pagesCache.set(pageNumber, new Array<Row>());
        if (e.name === HTTP_ERROR && e.responseCode === 404) {
          this.pageNotFoundStatus = true;
          if (this.awaitPagePromiseCount <= 1) {
            this.pageNotFoundStatus = false;
            sendEvent(this, dataNeedsToReloaded, e);
          }
          throw new AbortAction(e.message);
        }
        throw e;
      } finally {
        if (this.awaitPagePromiseCount > 0) {
          this.awaitPagePromiseCount -= 1;
        }
        this.pagePromisesMap.delete(pageNumber);
      }
      this.pagesCache.set(pageNumber, page);
    }
    if (this.pageNotFoundStatus && this.awaitPagePromiseCount <= 0) {
      this.pageNotFoundStatus = false;
      sendEvent(this, dataNeedsToReloaded, {});
      throw new AbortAction();
    }
    return page[indexWithoutAddedRows - pageNumber * this.PAGE_SIZE];
  }

  getRowByPrimaryKey(primaryKeyValue: Number): Row | null {
    const primaryKey = getEntityPrimaryKey(this.modelName);
    assert.ok(primaryKey);
    for (const page of this.pagesCache.getAll()) {
      for (const row of page) {
        if (Number(row[primaryKey]) === primaryKeyValue) {
          return row;
        }
      }
    }
    return null;
  }

  private async getPage(pageNumber: number): Promise<Page> {
    const dRestResponse = await this._performRequestCallback(pageNumber + 1, this.PAGE_SIZE);
    this.length = dRestResponse.meta.total_results;
    if (this._totalRecordCountCallback) {
      this._totalRecordCountCallback(this.length);
    }
    return await Promise.all(
      dRestResponse.mainModels.map((mainModel) => this.toRow(mainModel, dRestResponse.relatedModels)),
    );
  }

  private async toRow(mainModel: Model, relatedModels: RelatedModels): Promise<Row> {
    const row = new RowImpl();
    await this.modelToRow(row, mainModel, this.modelName, relatedModels);
    if (this._selectedRows && this._selectedRows.size > 0) {
      this.setRowSelectionField(row);
    }
    return row;
  }

  private setRowSelectionField(row: Row) {
    const primaryKey = getEntityPrimaryKey(this.modelName);
    assert.ok(primaryKey);
    const primaryKeyValue = Number(row[primaryKey]);
    assert.ok(primaryKeyValue);
    row[ROWS_SELECTION_FIELD] = this._selectedRows && this._selectedRows.has(primaryKeyValue);
  }

  private async modelToRow(row: Row, model: Model, modelName: string, relatedModels: RelatedModels) {
    // primary key is always needed, e.g. when choosing record from dictionary
    const primaryKey = getEntityPrimaryKey(modelName);
    row[primaryKey] = model[primaryKey];
    for (const column of this.columns) {
      const fullFieldName = column.field;
      let fieldValue: FieldValue;
      if (column.value) {
        try {
          fieldValue = await column.value(model, relatedModels);
        } catch (e) {
          fieldValue = '';
          const errStr = `Ошибка формирования поля ${fullFieldName} таблицы ${modelName}, запись ${model[primaryKey]}. Сообщите разработчику!`;
          error(errStr, {context: `ERR_COLUMN_VALUE_${modelName}_${fullFieldName}`});
          console.error(errStr);
          console.error(e);
        }
      } else {
        const fieldPath = fullFieldName.split('.');
        fieldValue = await this.getFieldValueByPath(model, modelName, relatedModels, fieldPath, modelName, column);
      }
      row[fullFieldName] = String(fieldValue); // cheetah-grid awaits strings
    }
  }

  private async getFieldValueByPath(
    model: Model,
    modelName: string,
    relatedModels: RelatedModels,
    fieldPath: ReadonlyArray<string>,
    mainModelName: string,
    column: Column,
  ): Promise<FieldValue> {
    const fieldName = fieldPath[0];
    // remove '+' if exist, '+' used if main model and related model same
    if (modelName.startsWith('+')) {
      modelName = modelName.slice(1);
    }
    let fieldValue = model[fieldName];
    // value can be array (for links one to many), so we taking the first element (as it was before)
    if (Array.isArray(fieldValue)) {
      fieldValue = fieldValue.length > 0 ? fieldValue[0] : undefined;
    }
    if (fieldPath.length > 1) {
      const fieldSpec = await getFieldSpec(this.domainModel, modelName, fieldName);
      let relatedModelName = fieldSpec.related_to!;
      // check main model name and related model, if they same than add '+'
      if (relatedModelName === mainModelName) {
        relatedModelName = `+${relatedModelName}`;
      }
      if (fieldValue) {
        const modelsById = relatedModels.checkedGet(relatedModelName);
        return this.getFieldValueByPath(
          modelsById.checkedGet(fieldValue),
          relatedModelName,
          relatedModels,
          fieldPath.slice(1),
          mainModelName,
          column,
        );
      }
    }
    if (fieldValue) {
      if (column.type === 'datetime') {
        fieldValue = dateTimeToDateTimeString(isoStringToDateTime(fieldValue));
      } else if (column.type === 'datetime without tz') {
        fieldValue = dateTimeToDateTimeString(isoStringToDateTimeWithoutTZ(fieldValue));
      } else if (column.type === 'date') {
        fieldValue = dateToDateString(isoStringToDateTime(fieldValue));
      }
    }
    if (['integer', 'decimal', 'float'].includes(column.type) && fieldValue === null) {
      // need to set symbol, because cheetahGrid replace empty string to zero
      fieldValue = '​'; // not empty string, there are hidden not empty symbol
    } else if (fieldValue === null || fieldValue === undefined) {
      // null and undefined looks ugly when grid values are copied in clipboard, so replacing them with empty string
      fieldValue = '';
    }
    return fieldValue;
  }

  async fetchRow(url: string): Promise<Row> {
    const response = await httpGet(url);
    const entitySpec = await this.domainModel.getEntitySpec(this.modelName);
    const dRestResponse = buildDRestResponse(response.data, entitySpec.options!.resource_name!);
    assert.ok(
      dRestResponse.mainModels.length === 1,
      `Expected exactly one model but ${dRestResponse.mainModels.length} found`,
    );
    return await this.toRow(dRestResponse.mainModels[0], dRestResponse.relatedModels);
  }

  async reflect(url: string, currentRow: number): Promise<boolean> {
    const row = await this.fetchRow(url);
    const namePK = getEntityPrimaryKey(this.modelName);
    for (const entry of this.addedRowsMap) {
      if (entry[1][namePK] === row[namePK]) {
        this.addedRowsMap.set(entry[0], row);
        return false;
      }
    }
    const replaced = this.pagesCache.replaceRow(row, namePK);
    if (!replaced) {
      const addedRowNumber = currentRow + 1;

      const formAddedRowsMap = new Map<number, Row>();
      // при вставке новой записи с номером addedRowNumber
      // у вставленных ранее записей с номерами >= addedRowNumber надо увеличить номер на единицу
      for (const entry of this.addedRowsMap) {
        if (entry[0] < addedRowNumber) {
          formAddedRowsMap.set(entry[0], entry[1]);
        } else {
          formAddedRowsMap.set(entry[0] + 1, entry[1]);
        }
      }
      this.addedRowsMap = formAddedRowsMap;
      this.addedRowsMap.set(addedRowNumber, row);

      // при вставке новой записи с номером addedRowNumber
      // у вставленных ранее записей с номерами >= addedRowNumber надо увеличить номер на единицу
      this.addedRowNumbers = this.addedRowNumbers.map((item: number) => (item < addedRowNumber ? item : item + 1));
      const index = binarySearch(this.addedRowNumbers, addedRowNumber);
      // binary searching the position to insert the new item gives us sorted array of row numbers
      this.addedRowNumbers.splice(index + 1, 0, addedRowNumber);
      return true;
    }
    return false;
  }
}
