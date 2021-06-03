#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { tryer } = require('sayfe');

const cwd = process.cwd();

interface IOption {
  host: string;
  token: string;
  projectId: string;
  outDir: string;
  enumKeys: { [key: string]: string };
}

function camelcase(str = ''): string {
  return str.replace(/(_\w)/g, $1 => $1.toUpperCase().replace('_', ''));
}

function pascalcase(str = ''): string {
  return `${str[0].toUpperCase()}${str.substr(1)}`;
}

const { host, token, projectId, outDir, enumKeys = {} }: IOption = require(`${cwd}/package.json`).yapi;

const dir = path.resolve(cwd, outDir);

fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);
fs.mkdirSync(dir + '/vo');
fs.mkdirSync(dir + '/dto');

interface IMenuList {
  data: {
    data: Array<{
      list: Array<{ _id: string }>;
      name: string;
      desc: string;
      uid: string;
    }>;
  };
}

interface Item {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'other' | 'text';
  desc: string;
  name: string;
  required: '0' | '1';
}

interface IData {
  title: string;
  path: string;
  req_body_type: 'form' | 'json';
  req_query: Item[];
  req_params: Item[];
  req_body_form: Item[];
  req_body_other: string;
  res_body: string;
}

interface IGetInterface {
  data: {
    data: IData;
  };
}

interface ITransformBody {
  properties?: any;
}

interface IList {
  key: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'other' | 'text';
  required: '0' | '1';
  data?: string | IList[];
}

const existNameMap: { [key: string]: boolean } = {};

function getUnusedName(path: string): string {
  const paths = path
    .split('/')
    .filter(o => o.indexOf(':') !== 0)
    .reverse();

  let name = '';
  tryer({
    tries: paths.length,
    exector: function (index: number, options: { stop: () => void }) {
      name = name ? camelcase(`${paths[index]}_${name}`) : paths[index];
      if (!existNameMap[name]) {
        options.stop();
      }
    },
    finished: function () {
      existNameMap[name] = true;
    }
  });
  return name;
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
      properties[key].data = transform(properties[key].properties);
    }
    list.push(properties[key]);
  });
  return list;
}

interface ITemplate {
  menu: string;
  title: string;
  name: string;
  list: IList[];
  isReq: boolean;
}

function template({ description, key, value, flag }: { description: string; key: string; value: string; flag: string }) {
  if (description) {
    return `
    /**
     * ${description || ''}
     */
    ${camelcase(key)}${flag}: ${enumKeys[key] || value};
      `;
  }
  return ` ${camelcase(key)}${flag}: ${enumKeys[key] || value};\r\n`;
}

function toTemplate({ menu, title, name, list, isReq }: ITemplate) {
  const items = list.filter(o => o.key);
  if (items.length === 0) {
    return;
  }

  const pascalName = pascalcase(name);

  function generateTemplate({ description, key, type, required, data }: IList) {
    const flag = required === '0' && isReq ? '?' : '';

    if (type === 'array' || type === 'object') {
      process.nextTick(() => {
        toTemplate({ menu, title: `${title}子项`, name: `${pascalName}Item`, list: data as IList[], isReq });
      });
      return template({ description: '列表子项', key, flag, value: `I${pascalName}Item${type === 'object' ? '' : '[]'}` });
    }
    if (type === 'other') {
      return template({ description, key, flag, value: 'any' });
    }
    return template({ description, key, flag, value: type });
  }

  const filepath = path.resolve(dir, isReq ? 'vo' : 'dto', `${menu}.ts`);

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

    const name = getUnusedName(path);

    const tries: Array<keyof IData> = ['res_body', 'req_query', 'req_body_form', 'req_params', 'req_body_other'];

    tryer({
      tries: tries.length,
      exector: function (index: number) {
        const key = tries[index];
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
                  toTemplate({ menu, title, name, list, isReq });
                } else {
                  const list = transform(body, jsonBody.required);
                  toTemplate({ menu, title, name, list, isReq });
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
            required: o.required
          }));
          toTemplate({ menu, title, name, list, isReq });
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
