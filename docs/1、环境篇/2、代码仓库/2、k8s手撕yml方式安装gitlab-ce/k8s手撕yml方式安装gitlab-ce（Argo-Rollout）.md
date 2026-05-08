### k8s手撕yml方式安装gitlab-ce（Argo-Rollout）



###### gitlab企业级-生产级别部署（支持大约1000用户）

> k8s-1.32.3
>
> gitlab-17.10.4

###### gitlab

```powershell
mkdir -p ~/gitlab-yml

kubectl create ns gitlab
```

```shell
cat > ~/gitlab-yml/gitlab-rollout.yml << 'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: gitlab
  namespace: gitlab
spec:
  replicas: 1
  strategy:
    canary:
      canaryService: gitlab-svc-canary
      stableService: gitlab-svc-stable
      steps:
      - setWeight: 20
      - pause: {duration: 10}
      - setWeight: 40
      - pause: {duration: 10}
      - setWeight: 60
      - pause: {duration: 10}
      - setWeight: 80
      - pause: {} # 人工卡点
      - setWeight: 100
      - pause: {duration: 10}
  revisionHistoryLimit: 2
  selector:
    matchLabels:
      app: gitlab
  template:
    metadata:
      labels:
        app: gitlab
    spec:
      containers:
      - name: gitlab
        #image: ccr.ccs.tencentyun.com/huanghuanhui/gitlab:17.10.4-ce.0
        image: ccr.ccs.tencentyun.com/huanghuanhui/gitlab:16.11.0-ce.0
        imagePullPolicy: IfNotPresent
        env:
        - name: TZ
          value: Asia/Shanghai
        - name: GITLAB_ROOT_PASSWORD
          value: huanghuanhui@2025
        ports:
        - name: http
          containerPort: 80
        - name: ssh
          containerPort: 22
        resources:
          requests:
            cpu: 1
            memory: 2Gi
          limits:
            cpu: 2
            memory: 8Gi
        volumeMounts:
        - name: gitlab-pvc
          mountPath: /etc/gitlab
          subPath: gitlab-config
        - name: gitlab-pvc
          mountPath: /var/log/gitlab
          subPath: gitlab-logs
        - name: gitlab-pvc
          mountPath: /var/opt/gitlab
          subPath: gitlab-data
      volumes:
      - name: gitlab-pvc
        persistentVolumeClaim:
          claimName: gitlab-pvc
EOF
```

````shell
cat > ~/gitlab-yml/gitlab-pvc.yml << 'EOF'
apiVersion: v1
kind:  PersistentVolumeClaim
metadata:
  name: gitlab-pvc
  namespace: gitlab
spec:
  storageClassName: "dev-sc"
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Ti
EOF
````

```shell
cat > ~/gitlab-yml/gitlab-svc-stable.yml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: gitlab-svc-stable
  namespace: gitlab
  labels:
    name: gitlab
spec:
  type: NodePort
  ports:
    - name: http
      nodePort: 30999
      port: 80
      targetPort: http
    - name: ssh
      nodePort: 30222
      port: 22
      targetPort: ssh
  selector:
    app: gitlab
EOF
```

````shell
cat > ~/gitlab-yml/gitlab-svc-canary.yml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: gitlab-svc-canary
  namespace: gitlab
  labels:
    name: gitlab
spec:
  type: NodePort
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: ssh
      port: 22
      targetPort: ssh
  selector:
    app: gitlab
EOF
````

```shell
cat > ~/gitlab-yml/gitlab-Ingress.yml << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gitlab-ingress
  namespace: gitlab
  annotations:
    cert-manager.io/cluster-issuer: prod-issuer 
    acme.cert-manager.io/http01-edit-in-place: "true" 
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/proxy-body-size: '4G'
spec:
  ingressClassName: nginx
  rules:
  - host: gitlab.openhhh.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gitlab
            port:
              number: 80

  tls:
  - hosts:
    - gitlab.openhhh.com
    secretName: gitlab-ingress-tls
EOF
```

```shell
#kubectl create secret -n gitlab \
#tls gitlab-ingress-tls \
#--key=/root/ssl/openhhh.com.key \
#--cert=/root/ssl/openhhh.com.pem
```

```shell
kubectl apply -f ~/gitlab-yml/gitlab-Ingress.yml
```

> 访问地址：https://gitlab.openhhh.com
>
> 设置账号密码为：root、huanghuanhui@2024

===

备份1：k8s-cronjob 计划任务备份

```shell
cat > gitlab-backup-job.yml << 'EOF'
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gitlab-backup-sa
  namespace: gitlab
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: gitlab-backup-role
  namespace: gitlab
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/exec"]
    verbs: ["get", "list", "create"]
  - apiGroups: ["argoproj.io"]
    resources: ["rollouts"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: gitlab-backup-rolebinding
  namespace: gitlab
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: gitlab-backup-role
subjects:
  - kind: ServiceAccount
    name: gitlab-backup-sa
    namespace: gitlab
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: gitlab-backup
  namespace: gitlab
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: gitlab-backup-sa
          restartPolicy: Never
          containers:
            - name: gitlab-backup
              #image: bitnami/kubectl:latest
              image: ccr.ccs.tencentyun.com/huanghuanhui/kubectl:bitnami-1.32.3
              command:
                - /bin/bash
                - -c
                - |
                  echo "📦 执行 GitLab 官方备份..."
                  # 获取稳定版本的 pod 名字
                  STABLE_POD=$(kubectl get pod -n gitlab -l "app=gitlab,rollouts-pod-template-hash=$(kubectl get rollout gitlab -n gitlab -o json | jq -r '.status.stableRS')" -o jsonpath="{.items[0].metadata.name}")
                  echo "✅ 找到稳定版本的 Pod: $STABLE_POD"
                  # 执行备份
                  kubectl exec -n gitlab $STABLE_POD -- gitlab-backup create
                  BACKUP_FILE=$(kubectl exec -n gitlab $STABLE_POD -- ls /var/opt/gitlab/backups | grep git | sort -n | tail -n 1)
                  echo "✅ 备份完成，文件保存在 /var/opt/gitlab/backups/，文件名: $BACKUP_FILE"
EOF
```

备份2：克隆所有项目存储到pvc

```shell
cat > ~/gitlab-yml/gitlab-backup-pvc.yml << 'EOF'
apiVersion: v1
kind:  PersistentVolumeClaim
metadata:
  name: gitlab-backup-pvc
  namespace: gitlab
spec:
  storageClassName: "dev-sc"
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Ti
EOF
```



**HTTP Clone 拉代码（用户名 + 密码 或 Personal Access Token）**

````shell
git clone http://<用户名>:<token>@10.1.13.205:30325/root/devops-doc.git

git clone http://root:此处填写 GitLab Personal Access Token@10.1.13.205:30325/root/devops-doc.git
git clone http://root:huanghuanhui%402025@10.1.13.205:30325/root/devops-doc.git
````

```shell
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token"   "http://10.1.13.205:30325/api/v4/projects?per_page=100&page=1" | jq '.[].name'
"hhh"
"Jenkins"
"DevOps-Doc"


curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token"   "http://gitlab-svc-canary/api/v4/projects?per_page=100&page=1" | jq '.[].name'
"hhh"
"Jenkins"
"DevOps-Doc"

curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token"   "http://gitlab-svc-stable/api/v4/projects?per_page=100&page=1" | jq '.[].name'
```

````shell
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects?per_page=100&page=1" | jq -r '.[].http_url_to_repo'
````

```shell
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects?per_page=100&page=1" | jq -r '.[].ssh_url_to_repo'
```

获取 clone 地址：

````shell
# Clone 地址（HTTP）
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects" | jq -r '.[].http_url_to_repo'

# Clone 地址（SSH）
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects" | jq -r '.[].ssh_url_to_repo'
````

````shell
curl -s --header "PRIVATE-TOKEN: vPd9iK4TzixTVRXNt2En"   "https://jgit.jingsocial.com:8000/api/v4/projects?per_page=100&page=1" | jq '.[].name'


https://jgit.jingsocial.com:8000/profile/personal_access_tokens
````

**🔍 参数说明**

| **参数**     | **作用**                                                     |
| ------------ | ------------------------------------------------------------ |
| per_page=100 | 每页返回最多 100 个项目（GitLab 默认是 20，最大可以设置到 100） |
| page=1       | 获取第 1 页的内容（配合 per_page 实现翻页，比如第 2 页就写 page=2） |

````shell
# 获取第 1 页（前 100 个项目）
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects?per_page=100&page=1"

# 获取第 2 页（101-200）
curl -s --header "PRIVATE-TOKEN: 此处填写 GitLab Personal Access Token" \
  "http://10.1.13.205:30325/api/v4/projects?per_page=100&page=2"
````

**🧠 小技巧：自动翻页脚本（可选）**

如果你项目非常多，可以写个简单的 bash 脚本自动翻页获取：

````shell
#!/bin/bash

TOKEN="此处填写 GitLab Personal Access Token"
HOST="http://10.1.13.205:30325"
PAGE=1

while :; do
  RESULT=$(curl -s --header "PRIVATE-TOKEN: $TOKEN" \
    "$HOST/api/v4/projects?per_page=100&page=$PAGE")

  COUNT=$(echo "$RESULT" | jq length)

  if [[ $COUNT -eq 0 ]]; then
    break
  fi

  echo "$RESULT" | jq -r '.[].http_url_to_repo'

  ((PAGE++))
done
````

>  这个脚本会一直翻页，直到获取不到项目为止。

好的，下面是一个 **批量 clone GitLab 项目的 bash 脚本**，通过 GitLab API 获取所有项目地址，然后用 git clone 全部拉下来。

**✅ 批量 clone GitLab 所有项目（HTTP方式）**



假设你用的是 **HTTP 克隆方式 + Personal Access Token**，推荐方式如下：



**🧾 脚本内容 gitlab_clone_all.sh**

````shell
cat > gitlab_clone_all.sh << 'EOF'
#!/bin/bash

# 设置你的 GitLab 信息
GITLAB_HOST="http://10.1.13.205:30325"
PRIVATE_TOKEN="此处填写 GitLab Personal Access Token"  # 你的 GitLab Token
CLONE_DIR="./gitlab-projects"
PAGE=1

# 创建 clone 目录
mkdir -p "$CLONE_DIR"
cd "$CLONE_DIR" || exit 1

# 分页获取并 clone 项目
while :; do
  echo "📦 正在获取第 $PAGE 页项目..."

  RESPONSE=$(curl -s --header "PRIVATE-TOKEN: $PRIVATE_TOKEN" \
    "$GITLAB_HOST/api/v4/projects?per_page=100&page=$PAGE")

  COUNT=$(echo "$RESPONSE" | jq length)

  if [[ "$COUNT" -eq 0 ]]; then
    echo "✅ 获取完成。"
    break
  fi

  echo "$RESPONSE" | jq -r '.[].http_url_to_repo' | while read -r url; do
    echo "🔁 cloning $url ..."
    git clone "$url"
  done

  ((PAGE++))
done
EOF

chmod +x gitlab_clone_all.sh
./gitlab_clone_all.sh
````

**💡 如果你想用 SSH 方式**



只要把这段：

````shell
echo "$RESPONSE" | jq -r '.[].http_url_to_repo'
````

```shell
echo "$RESPONSE" | jq -r '.[].ssh_url_to_repo'
```

好的，我们来加一个参数来**过滤特定命名空间（namespace）或 group 下的项目**，比如你只想拉取 root 用户或者某个 group 下的仓库。

**✅ 最终增强版：根据 namespace 过滤 GitLab 项目并 clone**



**🔧 gitlab_clone_by_namespace.sh**

````shell
#!/bin/bash

# GitLab 配置
GITLAB_HOST="http://10.1.13.205:30325"
PRIVATE_TOKEN="此处填写 GitLab Personal Access Token"     # 替换成你的 Token
NAMESPACE="root"                            # 只拉取这个命名空间下的项目
CLONE_DIR="./gitlab-projects"
PAGE=1

# 创建 clone 目录
mkdir -p "$CLONE_DIR"
cd "$CLONE_DIR" || exit 1

# 分页获取项目
while :; do
  echo "📦 获取第 $PAGE 页项目..."

  RESPONSE=$(curl -s --header "PRIVATE-TOKEN: $PRIVATE_TOKEN" \
    "$GITLAB_HOST/api/v4/projects?per_page=100&page=$PAGE")

  COUNT=$(echo "$RESPONSE" | jq length)
  if [[ "$COUNT" -eq 0 ]]; then
    echo "✅ 所有项目获取完毕。"
    break
  fi

  echo "$RESPONSE" | jq -r --arg ns "$NAMESPACE" \
    '.[] | select(.namespace.path == $ns) | .http_url_to_repo' | while read -r url; do
      echo "🔁 正在 clone: $url"
      git clone "$url"
  done

  ((PAGE++))
done	


chmod +x gitlab_clone_by_namespace.sh
./gitlab_clone_by_namespace.sh
````

===

`````shell
cat > gitlab-backup.sh << 'EOF'
#!/bin/bash

# 设置变量
GITLAB_TOKEN="此处填写 GitLab Personal Access Token"
GITLAB_API="http://10.1.13.205:30325/api/v4/projects"
BACKUP_ROOT="./backup"
TODAY=$(date +%Y%m%d)

# 获取项目列表
project_urls=$(curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" "$GITLAB_API" | jq -r '.[].http_url_to_repo')

# 遍历每个项目地址
for url in $project_urls; do
  # 提取项目名
  repo_name=$(basename "$url" .git)

  # 创建备份目录结构
  backup_dir="$BACKUP_ROOT/$repo_name/$TODAY"
  mkdir -p "$backup_dir"

  # 克隆仓库（--mirror 或 --bare 可选）
  echo "📦 正在备份 $repo_name 到 $backup_dir"
  git clone --quiet "$url" "$backup_dir"
done

echo "✅ 所有项目备份完成！"
EOF
`````

