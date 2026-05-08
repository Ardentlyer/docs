<!-- ORIGIN_INFO_START -->
> 原始文件路径：1、环境篇/1、容器编排与管理/15、ingress-tls.md
> 原始目录：1、环境篇/1、容器编排与管理
> 原始文件名：15、ingress-tls.md
<!-- ORIGIN_INFO_END -->
# ingress-tls

```shell
kubectl create secret -n prod \
tls openhhh.com-ingress-tls \
--key=/root/ssl/openhhh.com.key \
--cert=/root/ssl/openhhh.com.pem
```




