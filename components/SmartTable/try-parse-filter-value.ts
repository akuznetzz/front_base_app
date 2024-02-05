import {
  buildIsNotNullFilter,
  buildIsNullFilter,
  buildRangeFilter,
  buildSimpleFilter,
  buildInFilter,
  Condition,
  Filter,
  buildRawFilter,
} from '~/common/filters';
import {
  FieldValue,
  FieldType,
  fieldValueFromBoolean,
  fieldValueFromDate,
  fieldValueFromNumber,
  fieldValueFromString,
  fieldValueFromArray,
} from '~/common/FieldValue';
import {CheckedReadonlyMapImpl} from '~/common/CheckedReadonlyMap';
import {tryDateStringToDate} from '~/common/date-conversion';
import {ColumnType} from '~/components/SmartTable/columns-spec';
import {isValueIsList} from '~/components/SmartTable/input-assistant/utils';

const unaryOperatorToConditionMap = new CheckedReadonlyMapImpl<string, Condition>([
  ['=', Condition.Equals],
  ['!=', Condition.NotEquals],
  ['<', Condition.LesserThan],
  ['<=', Condition.LesserOrEquals],
  ['=<', Condition.LesserOrEquals],
  ['>', Condition.GreaterThan],
  ['>=', Condition.GreaterOrEquals],
  ['=>', Condition.GreaterOrEquals],
]);

const binaryOperators = ['..'];

const beginAdvancedIncrementalSearch = '~';
const delimAdvancedIncrementalSearch = '/';

export function tryParseFilterValue(
  field: string,
  type: ColumnType,
  value: string,
  nullable: boolean,
): Filter | Filter[] | undefined {
  function tryParseAdvancedIncrementalSearch(
    field: string,
    type: ColumnType,
    value: string,
  ): Filter | Filter[] | undefined {
    if (type !== 'string' || !value.startsWith(beginAdvancedIncrementalSearch)) {
      return;
    }

    const searchStrings = value.slice(1).split(delimAdvancedIncrementalSearch);
    const containsStrings = [];
    let containsPart = searchStrings[0].trim();
    if (containsPart) {
      const startPos = containsPart.startsWith('"') ? 1 : 0;
      const endPos = containsPart.endsWith('"') ? containsPart.length - 1 : containsPart.length;
      containsPart = containsPart.slice(startPos, endPos);
      for (const splitStr of containsPart.split('" "')) {
        if (splitStr) {
          containsStrings.push(splitStr);
        }
      }
    }
    const notContainsStrings = [];
    if (searchStrings[1]) {
      let notContainsPart = searchStrings[1].trim();
      if (notContainsPart) {
        const startPos = notContainsPart.startsWith('"') ? 1 : 0;
        const endPos = notContainsPart.endsWith('"') ? notContainsPart.length - 1 : notContainsPart.length;
        notContainsPart = notContainsPart.slice(startPos, endPos);
        for (const splitStr of notContainsPart.split('" "')) {
          if (splitStr) {
            notContainsStrings.push(splitStr);
          }
        }
      }
    }
    return buildRawFilter(
      `advanced-incremental-search__${field}`,
      fieldValueFromString(
        JSON.stringify({field, contains_strings: containsStrings, not_contains_strings: notContainsStrings}),
      ),
    );
  }

  function tryParseBinary(field: string, type: ColumnType, value: string): Filter | undefined {
    for (const binaryOperator of binaryOperators) {
      const values = value.split(binaryOperator);
      if (values.length === 2) {
        const leftValue = tryParseValue(type, values[0]);
        const rightValue = tryParseValue(type, values[1]);
        if (leftValue && rightValue) {
          return buildRangeFilter(field, leftValue, rightValue);
        }
      }
    }
  }

  function tryParseUnary(
    field: string,
    type: ColumnType,
    value: string,
    nullable: boolean,
  ): Filter | Filter[] | undefined {
    for (const [unaryOperator, condition] of unaryOperatorToConditionMap.entries()) {
      const values = value.split(unaryOperator); // for example '=someString'.split('=') will produce ['', 'someString']
      if (values.length === 2 && values[0] === '') {
        const trimmedValue = values[1].trim();
        if (trimmedValue === '' && (unaryOperator === '=' || unaryOperator === '!=')) {
          if (field.includes('.') && ['string', 'url', 'email', 'choice'].includes(type)) {
            return buildRawFilter(
              `empty-or-not-string-search__${field}`,
              fieldValueFromString(JSON.stringify({field, is_empty: unaryOperator === '='})),
            );
          } else if (nullable || field.includes('.') || ['date', 'datetime', 'datetime without tz'].includes(type)) {
            return unaryOperator === '=' ? buildIsNullFilter(field) : buildIsNotNullFilter(field);
          } else if (['integer', 'decimal', 'float', 'number'].includes(type)) {
            return unaryOperator === '='
              ? buildSimpleFilter(field, Condition.Equals, fieldValueFromNumber(0))
              : buildSimpleFilter(field, Condition.NotEquals, fieldValueFromNumber(0));
          } else {
            return unaryOperator === '='
              ? buildSimpleFilter(field, Condition.Equals, fieldValueFromString(''))
              : buildSimpleFilter(field, Condition.NotEquals, fieldValueFromString(''));
          }
        }
        const fieldValue = tryParseValue(type, trimmedValue);
        if (fieldValue) {
          return buildSimpleFilter(field, condition, fieldValue);
        }
      }
    }
  }

  function tryParseValue(type: ColumnType, value: string): FieldValue | undefined {
    const trimmedValue = value.trim();
    let result;
    switch (type) {
      case 'float':
      case 'decimal':
      case 'number':
      case 'integer': {
        const number = Number(trimmedValue);
        if (!isNaN(number)) {
          result = fieldValueFromNumber(number);
        }
        break;
      }
      case 'date':
      case 'datetime':
      case 'datetime without tz': {
        if (isValueIsList(trimmedValue)) {
          try {
            result = fieldValueFromArray(JSON.parse(trimmedValue).map(fieldValueFromString));
          } catch (objError) {
            if (!(objError instanceof SyntaxError)) {
              throw objError;
            }
            result = fieldValueFromString(trimmedValue);
          }
        } else {
          const date = tryDateStringToDate(trimmedValue);
          if (date) {
            result = fieldValueFromDate(date);
          }
        }
        break;
      }
      case 'boolean':
        if (trimmedValue === 'true') {
          result = fieldValueFromBoolean(true);
        } else if (trimmedValue === 'false') {
          result = fieldValueFromBoolean(false);
        }
        break;
      case 'string':
      case 'url':
      case 'email':
      case 'file upload':
        result = fieldValueFromString(trimmedValue); // todo: to trim or not to trim?
        break;
      case 'one':
      case 'choice':
        if (isValueIsList(trimmedValue)) {
          try {
            result = fieldValueFromArray(JSON.parse(trimmedValue).map(fieldValueFromString));
          } catch (objError) {
            if (!(objError instanceof SyntaxError)) {
              throw objError;
            }
            result = fieldValueFromString(trimmedValue);
          }
        } else {
          result = fieldValueFromString(trimmedValue);
        }
        break;
    }
    return result;
  }

  const trimmedValue = value.trim();
  let filter = tryParseAdvancedIncrementalSearch(field, type, trimmedValue);
  if (!filter) {
    filter = tryParseBinary(field, type, trimmedValue);
  }
  if (!filter) {
    filter = tryParseUnary(field, type, trimmedValue, nullable);
  }

  if (!filter) {
    const fieldValue = tryParseValue(type, trimmedValue);
    if (fieldValue) {
      if (fieldValue.type === FieldType.Array && ['date', 'datetime', 'datetime without tz'].includes(type)) {
        if (fieldValue.rawValue[0].rawValue === 'undefined') {
          return;
        } else if (fieldValue.rawValue[1].rawValue === 'undefined') {
          filter = buildSimpleFilter(
            field,
            Condition.ContainsIgnoreCase,
            fieldValueFromString(fieldValue?.rawValue[0].rawValue),
          );
        } else {
          filter = [
            buildSimpleFilter(field, Condition.GreaterOrEquals, fieldValueFromString(fieldValue?.rawValue[0].rawValue)),
            buildSimpleFilter(field, Condition.LesserOrEquals, fieldValueFromString(fieldValue?.rawValue[1].rawValue)),
          ];
        }
      } else if (fieldValue.type === FieldType.Array) {
        filter = buildInFilter(field, (fieldValue as any).rawValue);
      } else {
        filter = buildSimpleFilter(field, type === 'one' ? Condition.Equals : Condition.ContainsIgnoreCase, fieldValue);
      }
    }
  }
  return filter;
}
