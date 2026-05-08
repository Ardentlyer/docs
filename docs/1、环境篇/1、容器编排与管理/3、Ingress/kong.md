<!-- ORIGIN_INFO_START -->
> 原始文件路径：1、环境篇/1、容器编排与管理/3、Ingress/kong.md
> 原始目录：1、环境篇/1、容器编排与管理/3、Ingress
> 原始文件名：kong.md
<!-- ORIGIN_INFO_END -->
```````shell
helm search repo kong
 
# helm install kong kong/ingress -n kong --create-namespace
 
# helm install kong kong/kong -n kong --create-namespace

helm install kong kong/kong -n kong --create-namespace --set fullnameOverride=kong

helm upgrade kong kong/kong -n kong --set fullnameOverride=kong
```````

````shell
helm install kong kong/kong -n kong --create-namespace --set fullnameOverride=kong
Error: INSTALLATION FAILED: Get "https://github.com/Kong/charts/releases/download/kong-2.48.0/kong-2.48.0.tgz": dial tcp 20.205.243.166:443: i/o timeout (Client.Timeout exceeded while awaiting headers)
````



````shell
[root@k8s-doris ~/kong-yml]# po
NAME                         READY   STATUS    RESTARTS   AGE
kong-kong-595c44b85c-plvsd   2/2     Running   0          2m49s
[root@k8s-doris ~/kong-yml]# svc
NAME                           TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)                         AGE
kong-kong-manager              NodePort       10.100.165.193   <none>        8002:32726/TCP,8445:31005/TCP   2m49s
kong-kong-metrics              ClusterIP      10.106.75.224    <none>        10255/TCP,10254/TCP             2m49s
kong-kong-proxy                LoadBalancer   10.107.216.200   <pending>     80:31738/TCP,443:32427/TCP      2m49s
kong-kong-validation-webhook   ClusterIP      10.104.155.177   <none>        443/TCP                         2m49s
[root@k8s-doris ~/kong-yml]# helm ls
NAME    NAMESPACE       REVISION        UPDATED                                 STATUS          CHART           APP VERSION
kong    kong            1               2025-04-11 17:08:48.506994247 +0800 CST deployed        kong-2.48.0     3.9        
[root@k8s-doris ~/kong-yml]# 
````

![image-20250411171212088](/Users/huanghuanhui/Library/Application Support/typora-user-images/image-20250411171212088.png)

![image-20250411171319369](/Users/huanghuanhui/Library/Application Support/typora-user-images/image-20250411171319369.png)



**安装的 chart 不一样！**

| **命令**     | **安装的 Chart**      | **说明**                                                     |
| ------------ | --------------------- | ------------------------------------------------------------ |
| kong/ingress | Ingress Controller 版 | 只部署 Kong Ingress Controller，用 Kong 来代理你的K8s流量（纯Ingress功能）。适合用作传统 Ingress Controller，轻量。 |
| kong/kong    | 全功能 Kong 网关 版   | 部署的是完整 Kong API Gateway（带Ingress Controller + Service Mesh + Plugin等等功能）。适合需要完整API网关、认证、流量控制、插件扩展的人用。 |

**具体差异对比 🔥**

| **项目**                      | kong/ingress                                                 | kong/kong                                                    |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 主要功能                      | **Ingress Controller**（类似 Nginx Ingress那种）             | **API Gateway**（全功能，支持插件、认证、限流等）            |
| 是否包含数据库模式（DB-Mode） | 通常是 DB-less 模式（无数据库，配置存在内存）                | 可以支持 DB-less 也可以接数据库（Postgres）                  |
| 支持自定义插件？              | 很少，只是用作流量代理入口                                   | 可以自定义各种插件，比如认证、日志、限流等                   |
| 用途场景                      | 单纯转发K8s流量，类似 Nginx Ingress                          | 做认证、限流、转发、OpenID Connect 等更复杂API管理           |
| 资源开销                      | 相对小                                                       | 相对大，功能更多                                             |
| 官方 chart 文档               | [kong/ingress](https://github.com/Kong/charts/tree/main/charts/ingress) | [kong/kong](https://github.com/Kong/charts/tree/main/charts/kong) |

**⚡再多给点场景例子：**

| **场景**                                         | **用哪个**   |
| ------------------------------------------------ | ------------ |
| 只想像用 Nginx-ingress 那样暴露服务              | kong/ingress |
| 想在入口做 OpenID 登录认证、速率限制、防爬虫保护 | kong/kong    |
| 想要有 API 版本控制、日志收集插件、JWT 鉴权      | kong/kong    |



