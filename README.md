# yerf

yapi doc to typescript interface

#### yapi - 将 yapi 文档转换为 typescript 的 interface

- 配置

```jsonc
// package.json
{
  "yapi": {
    "host": "http://x.x.x.x:8080", // 服务器地址
    "token": "9de5079657fe9393a481d49f7d60dfde0f770789200df339508998257ab9de7a", // 项目的token
    "projectId": "80", // 项目的id
    "outDir": "src/yapis", // 输出目录
    "enumKeys": {
      // 指定常用字段的类型; 此处设置的类型优先级最高
      "current": "number",
      "size": "number",
      "total": "number"
    }
  }
}
```

```
注意: 生成的文件命名规则, 默认取 *左侧菜单分类的备注* 命名; 未设置备注的情况下, 固定以api.${uid}命名
```

- 执行

```shell
node ./node_modules/yerf/lib/index.js
or
npx yerf
```
