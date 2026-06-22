# 线上部署说明

推荐平台：Render 或 Railway。

原因：这个工具需要长时间调用 DeepSeek、上传 Excel、生成导出文件，并保存项目数据。它更适合常驻 Web 服务，不适合纯静态网页或短时 Serverless。

## 必填环境变量

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
VOC_ACCESS_CODE=你自己设置的访问码
```

## 已内置环境变量

```text
VOC_HOST=0.0.0.0
VOC_DATA_DIR=/var/data/data
VOC_EXPORT_DIR=/var/data/exports
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_ACCURATE_MODEL=deepseek-v4-pro
```

## Render 部署

1. 新建 Web Service。
2. 选择 Docker 部署。
3. 上传或连接本项目代码。
4. 添加 Persistent Disk：
   - Mount Path: `/var/data`
   - Size: 1GB 起步即可
5. 添加环境变量：
   - `DEEPSEEK_API_KEY`
   - `VOC_ACCESS_CODE`
6. 部署完成后打开 Render 给出的公网地址。

项目中已经包含 `render.yaml`，支持 Blueprint 部署。

## Railway 部署

1. 新建 Project。
2. 选择 Deploy from local/GitHub。
3. Railway 会读取 `Dockerfile`。
4. 添加环境变量：
   - `DEEPSEEK_API_KEY`
   - `VOC_ACCESS_CODE`
   - `VOC_DATA_DIR=/var/data/data`
   - `VOC_EXPORT_DIR=/var/data/exports`
5. 给服务加 Volume，并挂载到 `/var/data`。
6. 部署完成后打开 Railway 给出的公网地址。

## 不建议直接用 Vercel 的原因

Vercel 默认是短时 Serverless 函数，不适合保存上传文件和批量长时间打标。要上 Vercel，需要额外改成外部数据库和对象存储，工作量会明显增加。
