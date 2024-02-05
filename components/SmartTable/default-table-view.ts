import {IDomainModel} from '~/framework/dbd/dbd-spec';
import {HTTP_200_OK, httpPost} from '~/framework/httpRequest';
import {warn} from '~/framework/messages';

export async function getFreshDefaultTableViewDescr(
  domainModel: IDomainModel,
  tableName: string,
  update_dtime?: string,
) {
  const res = await httpPost('get_fresh_default_table_view_descr/', {
    table_id: (await domainModel.getEntitySpec(tableName)).options!.content_type_id,
    update_dtime,
  });
  if (res.status !== HTTP_200_OK) {
    warn(res.data);
    return undefined;
  }
  return res.data.view_text;
}

export async function tryGetDefaultTableViewDescr(domainModel: IDomainModel, tableName: string) {
  const freshDefaultTableViewTxt = await getFreshDefaultTableViewDescr(domainModel, tableName);
  return freshDefaultTableViewTxt ? JSON.parse(freshDefaultTableViewTxt) : undefined;
}
