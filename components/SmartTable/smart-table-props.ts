export interface ISmartTableConf {
  adding_button?: boolean;
  deleting_button?: boolean;
  auto_width_button?: boolean;
  export_tables_button?: boolean;
  column?: boolean;
  filter?: boolean;
  sort?: boolean;
  selections?: boolean;
  aggregation_button?: boolean;
  export_excel_button?: boolean;
}

export const DEFAULT_SMART_TABLE_CONF: ISmartTableConf = {
  adding_button: true,
  deleting_button: true,
  auto_width_button: true,
  export_tables_button: true,
  column: true,
  filter: true,
  sort: true,
  selections: false,
  aggregation_button: true,
  export_excel_button: true,
};

export function smartTableProps() {
  return {
    // Название таблицы отображается над таблицей
    tableName: {default: ''},
    // Показать нумерацию строк
    showLineNumbers: {type: Boolean, default: false},
    //  путь api например: 'purchases/purchases'
    apiUrl: {default: ''},
    // apiUrl.OPTIONS.resource_name_plural
    apiModel: '',
    // идентификатор контекста для сохранения/восстановления настроек в LocalStorage
    contextId: {type: String, default: undefined},
    // Количество строк на странице
    perPage: {default: 10},
    // функция вызываемая при клике на ячейку в таблице
    onCellClick: {
      default() {
        return () => {};
      },
    },
    onMouseEnterCell: null,
    onMouseLeaveCell: null,
    shownColumnNames: {
      type: Array,
      default() {
        return [];
      },
    },
    allColumns: {
      type: Array,
      default() {
        return [];
      },
    },
    //
    includes: {
      type: Array,
      default() {
        return [];
      },
    },
    extraParams: {
      type: Object,
      default() {
        return undefined;
      },
    },
    /**
     * @deprecated use separate flags instead
     */
    conf: {
      // fixme: remove and adapt usages
      type: Object,
      default() {},
    },
    filtering: {
      type: Boolean,
      default() {
        return true;
      },
    },
    selections: {
      type: Boolean,
      default() {
        return false;
      },
    },
    inputSelectedRows: {
      type: Set,
      default() {
        return new Set();
      },
    },
    //  внешний фильтр применяемый при первой загрузке данных
    externalFilters: {
      type: Object,
      default() {
        return {};
      },
    },
    // callback for checking whether record selection allowed or not
    checkSelection: {
      type: Function,
      default: () => true,
    },
    maxHeight: {
      type: String,
      default: '',
    },
    noWrapMode: {
      type: Boolean,
      default: true,
    },
    defaultRowHeight: undefined,
    onPrimaryKeyClick: null,
    onDoubleClick: null,
    onClick: null,
    choiceMode: {
      type: Boolean,
      default: false,
    },
    multipleChoiceMode: {
      type: Boolean,
      default: false,
    },
    cardStyle: {
      type: String,
      default: '',
    },
  };
}
