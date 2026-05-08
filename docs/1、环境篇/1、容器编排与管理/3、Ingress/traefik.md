<!-- ORIGIN_INFO_START -->
> 原始文件路径：1、环境篇/1、容器编排与管理/3、Ingress/traefik.md
> 原始目录：1、环境篇/1、容器编排与管理/3、Ingress
> 原始文件名：traefik.md
<!-- ORIGIN_INFO_END -->
# traefik

###### helm安装traefik

**🛠 Traefik 在 Kubernetes 生产环境部署 (Helm版)**

````shell
helm repo add traefik https://traefik.github.io/charts

helm repo update

helm search repo traefik/traefik

helm pull traefik/traefik --version 35.0.0 --untar
````

```shell
cat > ~/traefik/values-prod.yaml << EOF
deployment:
  replicas: 3
service:  
  enabled: true
  type: NodePort
metrics:
  addInternals: true
  prometheus:
    service:
      enabled: true
additionalArguments:
  - "--api.insecure"   # 添加此参数以启用API的非安全访问

resources:
  limits:
    cpu: "500m"
    memory: "512Mi"
  requests:
    cpu: "200m"
    memory: "256Mi"

autoscaling:
  enabled: true
  minReplicas: 3  # 最少保持 3 个副本
  maxReplicas: 6  # 最多 6 个副本
EOF
```

```shell
kubectl create ns traefik

helm upgrade --install --namespace traefik traefik -f ./values-prod.yaml .
```

````shell
cat > ~/traefik/traefik-dashboard-svc.yml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: traefik-dashboard
  namespace: traefik
spec:
  selector:
    app.kubernetes.io/instance: traefik-traefik
    app.kubernetes.io/name: traefik
  type: NodePort
  ports:
  - name: traefik
    port: 8080
    targetPort: traefik
    nodePort: 30808
EOF
````

````shell
kubectl apply -f ~/traefik/traefik-dashboard-svc.yml
````






