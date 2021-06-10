#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { tryer } = require('sayfe');

const cwd = process.cwd();

function camelcase(str = ''): string {
  return str.replace(/(_\w)/g, $1 => $1.toUpperCase().replace('_', '')).replace(/_*$/, '');
}

function pascalcase(str = ''): string {
  return `${str[0].toUpperCase()}${str.substr(1)}`;
}

const { host, token, projectId, outDir, middleware }: IOption = require(`${cwd}/yerf.config`);

const dir = path.resolve(cwd, outDir);

fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);

const tries: Array<{ key: keyof IData; suffix: string }> = [
  { key: 'res_body', suffix: 'ResBody' },
  { key: 'req_query', suffix: 'Query' },
  { key: 'req_body_form', suffix: 'ReqForm' },
  { key: 'req_params', suffix: 'Param' },
  { key: 'req_body_other', suffix: 'ReqBody' }
];

function getIntefaceName(path: string): string {
  const _path = path
    .split('/')
    .filter(o => o.indexOf(':') !== 0)
    .join('_');
  const name = camelcase(_path);

  return middleware?.interfaceName(name) || name;
}

function transform(body: ITransformBody, requiredNames: string[] = []): IList[] {
  const list: IList[] = [];
  const properties = body.properties ? { ...body.properties } : { ...body };
  Object.keys(properties).forEach(key => {
    if (typeof properties[key] !== 'object') {
      return;
    }
    properties[key].key = key;
    if (requiredNames) {
      properties[key].required = requiredNames.includes(key) ? '1' : '0';
    } else {
      properties[key].required = properties[key].required || '1';
    }
    const type = properties[key].type;
    if (type === 'integer') {
      properties[key].type = 'number';
    }
    if (Array.isArray(type)) {
      properties[key].type = type[0];
    }
    if (type === 'array') {
      if (properties[key].items.properties) {
        properties[key].type = 'array';
        properties[key].data = transform(properties[key].items);
      } else {
        properties[key].type = 'other';
        properties[key].data = `${properties[key].items.type}[]`;
      }
    }
    if (type === 'object') {
      properties[key].type = 'object';
      if (Object.keys(properties[key].properties).length) {
        properties[key].data = transform(properties[key].properties);
      } else {
        properties[key].data = 'any';
      }
    }
    list.push(properties[key]);
  });
  return list;
}

function template({ description, key, type, modifier }: ITemplate) {
  return `
    /**
     * ${description || ''}
     */
    ${camelcase(key)}${modifier}: ${middleware?.propertiesType(key) || type};
      `;
}

function toTemplate({ menu, title, key, list, isReq, parentKey = '' }: IToTemplate) {
  const items = list.filter(o => o.key);
  if (items.length === 0) {
    return;
  }

  const pascalName = pascalcase(key + parentKey);

  function generateTemplate({ description, key, type, required, data }: IList) {
    const modifier = required === '0' && isReq ? '?' : '';
    const pk = pascalcase(key);

    if (type === 'array') {
      process.nextTick(() => {
        toTemplate({ menu, title: `${title}子项`, key: `${pascalName}`, parentKey: pk, list: data as IList[], isReq });
      });
      return template({ description: '列表子项', key, modifier, type: `I${pascalName}${pk}[]` });
    }

    if (type === 'object') {
      if (Array.isArray(data)) {
        process.nextTick(() => {
          toTemplate({ menu, title: `${title}子项`, key: `${pascalName}`, parentKey: pk, list: data as IList[], isReq });
        });
        return template({ description: '列表子项', key, modifier, type: `I${pascalName}${pk}` });
      }
      return template({ description: '列表子项', key, modifier, type: data as string });
    }

    if (type === 'other') {
      return template({ description, key, modifier, type: data as string });
    }

    return template({ description, key, modifier, type });
  }

  const filepath = path.resolve(dir, `${menu}.ts`);

  fs.writeFileSync(
    filepath,
    `
  /**
   * ${title}
   */
  export interface I${pascalName} {
    ${items.map(o => generateTemplate(o)).join('')}
  }\r\n
    `,
    {
      flag: 'a+'
    }
  );
}

async function getInterface(args: { _id: string; menu: string }) {
  const { _id, menu } = args;

  await axios.get(`${host}/api/interface/get?id=${_id}&token=${token}`).then((res: IGetInterface) => {
    const { path, title, req_body_type } = res.data.data;

    const name = getIntefaceName(path);

    tryer({
      tries: tries.length,
      exector: function (index: number) {
        const { key, suffix } = tries[index];
        if (key === 'req_body_other' && req_body_type !== 'json') {
          return;
        }
        if (key === 'req_body_form' && req_body_type !== 'form') {
          return;
        }

        const data = res.data.data[key];
        const isReq = index > 0;
        if (typeof data === 'string') {
          try {
            const jsonBody = JSON.parse(data);
            if (typeof jsonBody === 'object' && !Array.isArray(jsonBody)) {
              const body = key === 'req_body_other' ? jsonBody.properties : jsonBody.properties.data;
              if (body) {
                if (key === 'res_body' && body.type === 'array' && body.items) {
                  const list = transform(body.items);
                  toTemplate({ menu, title, key: `${name}${suffix}`, list, isReq });
                } else {
                  const list = transform(body, jsonBody.required);
                  toTemplate({ menu, title, key: `${name}${suffix}`, list, isReq });
                }
              }
            }
          } catch (e) {
            console.log(e);
          }
        }

        if (Array.isArray(data)) {
          const list: IList[] = data.map((o: Item) => ({
            type: o.type === 'text' ? 'string' : 'other',
            description: o.desc,
            key: o.name,
            required: o.required,
            data: 'any'
          }));
          toTemplate({ menu, title, key: `${name}${suffix}`, list, isReq });
        }
      }
    });
  });
}

function main() {
  axios.get(`${host}/api/interface/list_menu?project_id=${projectId}&token=${token}`).then(async (res: IMenuList) => {
    for (const menu of res.data.data) {
      for (const api of menu.list) {
        await getInterface({ ...api, menu: menu.desc || `api.${menu.uid}` });
      }
    }
    cp.exec(`node ${process.cwd()}/node_modules/prettier/bin-prettier.js --write "${dir}/**/*.ts"`);
  });
}

main();
