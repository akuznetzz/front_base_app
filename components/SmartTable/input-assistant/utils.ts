export function getParentFieldName(name: string) {
  return name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;
}

export function isValueIsList(value: string) {
  return value.startsWith('[') && value.endsWith(']');
}
