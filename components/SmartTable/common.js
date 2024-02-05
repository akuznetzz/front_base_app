export default {
  // Формирует Url
  createUrlWithIncludes(url, includes) {
    url = url + '?';
    includes.forEach((item) => {
      url = url + '&include[]=' + item + '.*';
    });
    return url;
  },

  // Переводит datetime в читабельный формат
  formatDate(datetime) {
    const date = new Date(Date.parse(datetime.split('T')[0]));
    let dd = date.getDate();
    if (dd < 10) dd = '0' + dd;

    let mm = date.getMonth() + 1;
    if (mm < 10) mm = '0' + mm;

    const yyyy = date.getFullYear();

    return dd + '.' + mm + '.' + yyyy;
  },
};
