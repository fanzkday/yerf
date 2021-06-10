declare global {
  export interface IList {
    key: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'other' | 'text';
    required: '0' | '1';
    data?: string | IList[];
  }

  export interface ITemplate {
    description: string;
    key: string;
    type: string;
    modifier: string;
  }

  export interface IToTemplate {
    menu: string;
    title: string;
    key: string;
    parentKey?: string;
    list: IList[];
    isReq: boolean;
  }

  export interface IOption {
    host: string;
    token: string;
    projectId: string;
    outDir: string;
    middleware?: {
      interfaceName: (name: string) => string;
      propertiesType: (properties: string) => string;
    };
  }

  export interface IMenuList {
    data: {
      data: Array<{
        list: Array<{ _id: string }>;
        name: string;
        desc: string;
        uid: string;
      }>;
    };
  }

  export interface Item {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'other' | 'text';
    desc: string;
    name: string;
    required: '0' | '1';
  }

  export interface IData {
    title: string;
    path: string;
    req_body_type: 'form' | 'json';
    req_query: Item[];
    req_params: Item[];
    req_body_form: Item[];
    req_body_other: string;
    res_body: string;
  }

  export interface IGetInterface {
    data: {
      data: IData;
    };
  }

  export interface ITransformBody {
    properties?: any;
  }
}

export {};
