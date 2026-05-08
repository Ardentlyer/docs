<!-- ORIGIN_INFO_START -->
> 原始文件路径：2、组件篇/7、分布式云存储、CFS文件存储、COS对象存储/1、docker方式.md
> 原始目录：2、组件篇/7、分布式云存储、CFS文件存储、COS对象存储
> 原始文件名：1、docker方式.md
<!-- ORIGIN_INFO_END -->
# docker方式

###### docker方式

> 适合开发、测试环境
>

```shell
docker pull minio/minio:RELEASE.2024-08-03T04-33-23Z

docker pull ccr.ccs.tencentyun.com/huanghuanhui/minio:RELEASE.2024-08-03T04-33-23Z
```

```shell
docker run -d \
	--name minio \
	--restart always \
	--privileged=true \
	-p 9000:9000 \
	-p 9001:9001 \
	-v ~/minio/data:/data \
	-e "MINIO_ROOT_USER=admin" \
	-e "MINIO_ROOT_PASSWORD=Admin@2024" \
	-v /etc/localtime:/etc/localtime \
	-v /etc/timezone:/etc/timezone \
	ccr.ccs.tencentyun.com/huanghuanhui/minio:RELEASE.2024-08-03T04-33-23Z \
	server /data --console-address ":9001"
```

> ip:9000
>
> 访问：192.168.1.200:9000
>
> 账号密码：admin、Admin@2024






