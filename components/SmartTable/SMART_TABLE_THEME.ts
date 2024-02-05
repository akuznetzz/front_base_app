import {StylePropertyFunctionArg, ThemeDefine} from 'cheetah-grid/ts-types';

function DEFAULT_BG_COLOR(args: StylePropertyFunctionArg): string {
  const {row, grid} = args;
  if (row < grid.frozenRowCount) {
    return '#edeef0';
  }
  if (grid.selection.range.start.row <= row && row <= grid.selection.range.end.row) {
    return '#E0E0FF';
  }
  const index = grid.getRecordIndexByRow(row);
  if (index % 2) {
    return '#FFF';
  } else {
    return '#f7f7fa';
  }
}

export default {
  color: 'rgba(0, 0, 0, 0.87)',
  frozenRowsColor: 'rgba(0, 0, 0, 0.54)',

  defaultBgColor: DEFAULT_BG_COLOR,
  // frozenRowsBgColor: '#FFF',
  selectionBgColor: '#CCE0FF',

  borderColor: '#dcdfe6',
  frozenRowsBorderColor: '#dcdfe6',
  highlightBorderColor: '#5E9ED6',

  checkbox: {
    // uncheckBgColor: '#FFF',
    checkBgColor: 'rgb(76, 73, 72)',
    borderColor: 'rgba(0, 0, 0, 0.26)',
  },
  button: {
    color: '#FFF',
    bgColor: '#2196F3',
  },
  header: {
    sortArrowColor: 'rgba(0, 0, 0, 0.38)',
  },
  underlayBackgroundColor: '#FFF',
} as ThemeDefine;
